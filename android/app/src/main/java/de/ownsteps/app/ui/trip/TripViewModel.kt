package de.ownsteps.app.ui.trip

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.ownsteps.app.api.ApiError
import de.ownsteps.app.api.Comment
import de.ownsteps.app.api.Step
import de.ownsteps.app.api.TripDetail
import de.ownsteps.app.api.TripFields
import de.ownsteps.app.api.Variant
import de.ownsteps.app.data.Account
import de.ownsteps.app.data.TripCalendar
import de.ownsteps.app.data.UploadSnapshot
import de.ownsteps.app.media.LibraryItem
import de.ownsteps.app.model
import de.ownsteps.app.ui.ErrorText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant

/** A card in the pager: a step on the server, or one still on the device. */
sealed interface TimelineItem {
    /** Doubles as the pager's key, which the map follows. A step written in the app keeps its key when it reaches the server. */
    val id: String
    val date: Instant
    val day: Int?

    data class Server(val step: Step, override val day: Int?) : TimelineItem {
        override val id get() = key(step)
        override val date: Instant get() = step.occurredAt
    }

    data class Local(val local: UploadSnapshot.LocalStep, override val day: Int?) : TimelineItem {
        override val id get() = "step-${local.step.clientUuid}"
        override val date: Instant get() = Instant.ofEpochMilli(local.step.occurredAt)
    }

    companion object {
        fun key(step: Step) = step.clientUuid?.let { "step-$it" } ?: "server-${step.id}"

        /** Server steps and steps still on the device, oldest first – the route reads left to right ([E13]). */
        fun build(trip: TripDetail, queue: UploadSnapshot, calendar: TripCalendar): List<TimelineItem> {
            val start = calendar.tripStart(trip.trip.startDate, trip.steps.firstOrNull()?.occurredAt)
            fun day(date: Instant) = start?.let { calendar.tripDay(date, it) }
            // A step the server already has must not show up twice.
            val known = trip.steps.mapNotNull { it.clientUuid }.toSet()
            val local = queue.localSteps.filter { it.step.clientUuid !in known }.map { Local(it, day(Instant.ofEpochMilli(it.step.occurredAt))) }
            return (trip.steps.map { Server(it, day(it.occurredAt)) } + local).sortedBy { it.date }
        }
    }
}

/**
 * One trip: the cached copy first, refreshed behind it, plus what the upload
 * queue still has for it. Also the actions the trip screen offers.
 */
class TripViewModel(private val app: Application, val account: Account, val tripId: Long, focusStepId: Long?) : ViewModel() {
    private val model = app.model
    val isAuthor = account.isAuthor
    val calendar = account.calendar

    var trip by mutableStateOf<TripDetail?>(null)
        private set
    var staleSince by mutableStateOf<Long?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    /** Something the user did failed while the trip is on screen. */
    var actionError by mutableStateOf<String?>(null)
    /** The card in view – the map follows it; null shows the whole route. */
    var focusedId by mutableStateOf<String?>(null)
    /** The step open as a story. */
    var openStepId by mutableStateOf<Long?>(null)
    var muted by mutableStateOf(model.prefs.isMuted(account.id, tripId))
        private set
    var suggestions by mutableStateOf<List<LibraryItem>>(emptyList())
        private set
    var suggestionsDismissedUntil by mutableLongStateOf(model.prefs.suggestionsDismissedUntil(account.id, tripId))
        private set

    val queue = model.uploads.observe(account.id, tripId).stateIn(viewModelScope, SharingStarted.Eagerly, UploadSnapshot())
    val progress = model.uploads.progress
    private val reportedViews = mutableSetOf<Long>()
    private var pendingFocus = focusStepId
    private var queuedRefresh: Job? = null

    init {
        viewModelScope.launch {
            if (trip == null) model.cache.trip(account.id, tripId)?.let { trip = it.value; applyPendingFocus() }
        }
        watchQueue()
    }

    fun refresh() = viewModelScope.launch { load() }

    private suspend fun load() {
        try {
            val fresh = model.withClient(account) { it.trip(tripId) }
            trip = fresh
            staleSince = null
            error = null
            model.cache.saveTrip(account.id, fresh)
            applyPendingFocus()
            prefetch(fresh)
            updateSuggestions()
        } catch (failure: Exception) {
            if (failure is ApiError && failure.code == "trip_not_found") {
                // Deleted on the server: don't keep showing a ghost.
                model.cache.removeTrip(account.id, tripId)
                trip = null
            }
            if (trip == null) error = ErrorText.message(app, failure)
            else staleSince = model.cache.trip(account.id, tripId)?.fetchedAt
        }
    }

    /** Opened from a notification: its step's card once the trip is there. */
    private fun applyPendingFocus() {
        val stepId = pendingFocus ?: return
        trip?.steps?.firstOrNull { it.id == stepId }?.let {
            focusedId = TimelineItem.key(it)
            pendingFocus = null
        }
    }

    /**
     * Follows the upload queue; whenever something reached the server, its
     * copy is fetched again so the new photos show. Photos finish in bursts,
     * so one reload a second after the last of them does.
     */
    private fun watchQueue() = viewModelScope.launch {
        var pending = emptySet<String>()
        var localSteps = 0
        queue.collect { snapshot ->
            val now = (snapshot.localSteps.flatMap { local -> local.uploads.map { it.clientUuid } + local.step.clientUuid } +
                snapshot.uploadsByStepId.values.flatten().map { it.clientUuid }).toSet()
            val finished = (pending - now).isNotEmpty()
            pending = now
            if (snapshot.localSteps.size < localSteps) {
                // A step reached the server: fetch it right away, so its card doesn't vanish and come back.
                queuedRefresh?.cancel()
                load()
            } else if (finished) {
                queuedRefresh?.cancel()
                queuedRefresh = viewModelScope.launch { delay(1_000); load() }
            }
            localSteps = snapshot.localSteps.size
        }
    }

    /**
     * Loads what the cards and stories show, so the trip stays readable
     * offline ([D22]). Files already on the device cost nothing.
     */
    private fun prefetch(trip: TripDetail) = viewModelScope.launch(Dispatchers.IO) {
        val client = model.client(account)
        val wanted = listOfNotNull(trip.trip.cover?.let { it to Variant.MEDIUM }) + trip.steps.flatMap { step ->
            step.photos.take(1).map { it to Variant.MEDIUM } + step.photos.take(4).map { it to Variant.THUMB }
        }
        for ((photo, variant) in wanted) runCatching { model.photos.get(account.id, client, photo, variant) }
    }

    // Readers' views ([D28])

    /** A reader saw a step for a second: tell the server, once per step. Authors aren't counted. */
    fun reportView(stepId: Long) {
        if (isAuthor || !reportedViews.add(stepId)) return
        viewModelScope.launch {
            runCatching { model.client(account).recordViews(tripId, listOf(stepId)) }.onFailure { reportedViews.remove(stepId) }
        }
    }

    // Actions

    private fun act(block: suspend () -> Unit) = viewModelScope.launch {
        try {
            block()
        } catch (failure: Exception) {
            actionError = ErrorText.message(app, failure)
        }
    }

    fun deleteComment(comment: Comment) = act {
        model.withClient(account) { it.deleteComment(comment.id) }
        load()
    }

    suspend fun comment(step: Step, text: String) {
        model.withClient(account) { it.comment(step.id, text.trim()) }
        load()
    }

    /** Needs a connection, like every change to what the server has ([D19]). */
    fun deleteTrip(onDeleted: () -> Unit) = act {
        model.withClient(account) { it.deleteTrip(tripId) }
        model.cache.removeTrip(account.id, tripId)
        model.uploads.removeAll(account.id, tripId)
        model.tripListRevision.value++
        onDeleted()
    }

    fun enableSharing(then: (TripDetail) -> Unit) = act {
        val updated = model.withClient(account) { it.updateTrip(tripId, TripFields(shareEnabled = true)) }
        trip = trip?.let { it.copy(trip = it.trip.copy(share = updated.share)) }
        trip?.let(then)
    }

    fun toggleMuted() {
        val value = !muted
        muted = value
        model.prefs.setMuted(account.id, tripId, value)
    }

    fun unfollow() = model.scope.launch { model.unfollow(account) }

    // Photo suggestions ([D22])

    /** Without library access nothing is asked here – only the menu asks. */
    fun updateSuggestions() = viewModelScope.launch {
        val current = trip ?: return@launch
        if (isAuthor) suggestions = model.photoSuggestions(account, current)
    }

    /** "Not now": hidden until newer photos turn up. */
    fun dismissSuggestions() {
        val newest = suggestions.maxOfOrNull { it.takenAt.toEpochMilli() } ?: return
        suggestionsDismissedUntil = newest
        model.prefs.setSuggestionsDismissedUntil(account.id, tripId, newest)
    }

    val visibleSuggestions: Int
        get() = if ((suggestions.maxOfOrNull { it.takenAt.toEpochMilli() } ?: 0) > suggestionsDismissedUntil) suggestions.size else 0
}
