package de.ownsteps.app.ui.compose

import android.app.Application
import android.location.Location
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import de.ownsteps.app.data.Account
import de.ownsteps.app.data.PreparedMedia
import de.ownsteps.app.media.Library
import de.ownsteps.app.media.MediaPreparation
import de.ownsteps.app.media.Places
import de.ownsteps.app.model
import de.ownsteps.app.ui.ErrorText
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import java.time.LocalDate

/** Where a step's place comes from. */
enum class LocationSource { PHOTO, CURRENT, MAP }

/** Where photos of one step were taken; [key] is the earliest photo's item there. */
data class PhotoPlace(val key: String, val lat: Double, val lon: Double)

/** A trip on one of the signed-in servers. */
data class TripTarget(val accountId: String, val tripId: Long)

/**
 * Writing a step – also without a connection ([D19]). Picked media are
 * prepared right away, so saving is instant and date and place can come
 * from the photos; on save everything goes into the upload queue. With a
 * [stepId] it only adds photos to a step the server has. The share sheet
 * uses the same model with the trip still to choose.
 */
class ComposerViewModel(
    application: Application,
    target: TripTarget?,
    val stepId: Long?,
    preselected: List<Long>,
    shared: List<MediaPreparation.Source>,
) : AndroidViewModel(application) {
    data class Item(val key: String, val source: MediaPreparation.Source, val prepared: PreparedMedia? = null)

    private val model = application.model
    private val preparing = Mutex()
    private var saved = false

    val isNew = stepId == null
    var target by mutableStateOf(target)
    val items = mutableStateListOf<Item>()
    val captions = mutableStateMapOf<String, String>()
    var body by mutableStateOf("")
    var date by mutableStateOf(Instant.now())
        private set
    private var dateTouched = false
    var locationSource by mutableStateOf<LocationSource?>(null)
        private set
    /** With [LocationSource.PHOTO]: the place whose position the step takes. */
    var photoPlaceKey by mutableStateOf<String?>(null)
        private set
    var position by mutableStateOf<Pair<Double, Double>?>(null)
        private set
    var placeName by mutableStateOf("")
        private set
    /** Typed by hand – a newly chosen position doesn't overwrite it then. */
    private var placeTyped = false
    val placeNames = mutableStateMapOf<String, String>()
    var locating by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)

    val account: Account? get() = target?.let { model.account(it.accountId) }
    private val zone get() = account?.zone ?: java.time.ZoneId.systemDefault()

    val isPreparing by derivedStateOf { items.any { it.prepared == null } }

    val canSave by derivedStateOf {
        target != null && !isPreparing && !locating &&
            (items.isNotEmpty() || (isNew && (body.isNotBlank() || placeName.isNotBlank())))
    }

    /** Where the photos were taken, earliest first; within a kilometre counts as one place. */
    val photoPlaces by derivedStateOf {
        val located = items.mapNotNull { item -> item.prepared?.takeIf { it.hasPlace }?.let { item.key to it } }
            .sortedBy { it.second.takenAt ?: Instant.MAX }
        buildList<PhotoPlace> {
            for ((key, media) in located) {
                val near = any { place ->
                    FloatArray(1).also { Location.distanceBetween(place.lat, place.lon, media.lat!!, media.lon!!, it) }[0] < 1_000
                }
                if (!near) add(PhotoPlace(key, media.lat!!, media.lon!!))
            }
        }
    }

    init {
        viewModelScope.launch {
            if (preselected.isNotEmpty()) add(Library.items(application, ids = preselected).map { it.source })
        }
        if (shared.isNotEmpty()) add(shared)
    }

    // Media

    /** Prepares new picks one after the other, in the background. */
    fun add(sources: List<MediaPreparation.Source>) {
        val known = items.map { it.key }.toSet()
        val fresh = sources.map { Item(it.assetId ?: it.uri.toString(), it) }.filter { it.key !in known }.distinctBy { it.key }
        items += fresh
        viewModelScope.launch {
            preparing.withLock {
                for (item in fresh) {
                    if (items.none { it.key == item.key }) continue
                    try {
                        val prepared = model.media.prepare(item.source, zone, model.prefs.originalVideos)
                        val index = items.indexOfFirst { it.key == item.key }
                        if (index >= 0) items[index] = item.copy(prepared = prepared) else prepared.discard()
                    } catch (failure: Exception) {
                        items.removeAll { it.key == item.key }
                        error = ErrorText.message(getApplication(), failure)
                    }
                }
                adoptEarliestDate()
                adoptPhotoPlace()
            }
        }
    }

    fun remove(key: String) {
        items.firstOrNull { it.key == key }?.prepared?.discard()
        items.removeAll { it.key == key }
        captions.remove(key)
        adoptPhotoPlace()
    }

    fun thumbnail(key: String) = items.firstOrNull { it.key == key }?.prepared?.thumbnail

    // Date

    /** A picked day keeps the time of day. */
    fun setDay(day: LocalDate) {
        val time = date.atZone(zone).toLocalTime()
        date = day.atTime(time).atZone(zone).toInstant()
        dateTouched = true
    }

    val day: LocalDate get() = date.atZone(zone).toLocalDate()

    private fun adoptEarliestDate() {
        if (dateTouched) return
        items.mapNotNull { it.prepared?.takenAt }.minOrNull()?.let { date = it }
    }

    // Place

    fun typePlace(text: String) {
        placeName = text
        placeTyped = text.isNotEmpty()
    }

    fun choose(source: LocationSource?) {
        error = null
        when (source) {
            LocationSource.PHOTO -> {
                locationSource = LocationSource.PHOTO
                (photoPlaces.firstOrNull { it.key == photoPlaceKey } ?: photoPlaces.firstOrNull())?.let(::usePhotoPlace)
            }
            LocationSource.CURRENT -> useCurrentLocation()
            // Switched once a place was picked; cancelling keeps the old one.
            LocationSource.MAP -> Unit
            null -> clearLocation()
        }
    }

    fun usePhotoPlace(place: PhotoPlace) {
        photoPlaceKey = place.key
        apply(place.lat, place.lon, placeNames[place.key])
    }

    fun pickedOnMap(lat: Double, lon: Double, name: String?) {
        locationSource = LocationSource.MAP
        apply(lat, lon, name)
    }

    /** Takes over a position; its name too, unless one was typed. Offline the name stays empty – the server names it then. */
    private fun apply(lat: Double, lon: Double, name: String?) {
        position = lat to lon
        if (placeTyped) return
        placeName = name.orEmpty()
        if (name != null) return
        viewModelScope.launch {
            val found = Places.name(getApplication(), lat, lon)
            if (!placeTyped && position == lat to lon && found != null) placeName = found
        }
    }

    fun clearLocation() {
        locationSource = null
        position = null
        if (!placeTyped) placeName = ""
    }

    /** Preselects where the earliest photo was taken, unless another source was chosen. */
    private fun adoptPhotoPlace() {
        if (!isNew || (locationSource != null && locationSource != LocationSource.PHOTO)) return
        val place = photoPlaces.firstOrNull { it.key == photoPlaceKey } ?: photoPlaces.firstOrNull()
        if (place == null) {
            if (locationSource == LocationSource.PHOTO) clearLocation()
            return
        }
        locationSource = LocationSource.PHOTO
        usePhotoPlace(place)
    }

    fun lookUpName(place: PhotoPlace) {
        if (placeNames.containsKey(place.key)) return
        viewModelScope.launch {
            Places.name(getApplication(), place.lat, place.lon)?.let { name ->
                placeNames[place.key] = name
                if (place.key == photoPlaceKey && !placeTyped && placeName.isEmpty()) placeName = name
            }
        }
    }

    private fun useCurrentLocation() {
        locating = true
        viewModelScope.launch {
            try {
                val location = Places.current(getApplication())
                locationSource = LocationSource.CURRENT
                apply(location.latitude, location.longitude, null)
            } catch (failure: Exception) {
                error = ErrorText.message(getApplication(), failure)
            } finally {
                locating = false
            }
        }
    }

    // Saving

    /** Everything goes into the queue; the upload worker brings it to the server when it can. */
    fun save(onSaved: () -> Unit) {
        val (accountId, tripId) = target ?: return
        val media = items.map { it.prepared!! to captions[it.key] }
        saved = true
        model.scope.launch {
            if (stepId == null) {
                model.uploads.enqueueStep(
                    accountId, tripId, body, placeName,
                    // Sent with the step, so the server doesn't take whichever photo arrives first.
                    position?.first, position?.second, date, media,
                )
            } else {
                model.uploads.enqueueMedia(accountId, tripId, stepId, media)
            }
            model.resumeUploads()
        }
        target?.let { model.prefs.lastShareTrip = "${it.accountId}/${it.tripId}" }
        onSaved()
    }

    override fun onCleared() {
        if (!saved) items.forEach { it.prepared?.discard() }
    }
}
