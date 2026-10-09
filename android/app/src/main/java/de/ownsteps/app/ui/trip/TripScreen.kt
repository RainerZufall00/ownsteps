package de.ownsteps.app.ui.trip

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.OpenInFull
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import de.ownsteps.app.R
import de.ownsteps.app.api.TripDetail
import de.ownsteps.app.api.Variant
import de.ownsteps.app.data.Account
import de.ownsteps.app.ui.ConfirmDialog
import de.ownsteps.app.ui.Dates
import de.ownsteps.app.ui.Hint
import de.ownsteps.app.ui.OfflineNote
import de.ownsteps.app.ui.Routes
import de.ownsteps.app.ui.TripCover
import de.ownsteps.app.ui.link
import de.ownsteps.app.ui.shareLink
import de.ownsteps.app.ui.tripCounts
import kotlinx.coroutines.delay

/**
 * One trip, laid out like Polarsteps: the route on a map that fills the
 * screen, the steps as cards side by side below it. Swiping the cards moves
 * the map along; a tapped marker brings its card; a tapped card opens the
 * step as a story.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripScreen(account: Account, tripId: Long, focusStepId: Long?, navController: NavController) {
    val context = LocalContext.current
    val vm = viewModel(key = "${account.id}/$tripId") {
        TripViewModel(context.applicationContext as Application, account, tripId, focusStepId)
    }
    val trip = vm.trip
    val queue by vm.queue.collectAsState()
    val progress by vm.progress.collectAsState()
    var camera by remember { mutableStateOf(CameraRequest()) }
    var menu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var confirmUnfollow by remember { mutableStateOf(false) }
    /** Sharing is off: the link to share once it's switched on. */
    var enableSharingFor by remember { mutableStateOf<Long?>(null) }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.refresh() }

    val items = remember(trip, queue) { trip?.let { TimelineItem.build(it, queue, vm.calendar) }.orEmpty() }
    val focusedStep = (items.firstOrNull { it.id == vm.focusedId } as? TimelineItem.Server)?.step
    // The map follows the card in view.
    LaunchedEffect(vm.focusedId, trip != null) { camera = CameraRequest(focusedStep?.id, camera.version + 1) }
    // A reader saw a step for a second – on its card or as a story ([D28]).
    val shownStepId = vm.openStepId ?: focusedStep?.id
    LaunchedEffect(shownStepId) {
        delay(1_000)
        shownStepId?.let(vm::reportView)
    }

    val share = { stepId: Long? ->
        val url = trip?.trip?.share.link(stepId)
        if (url != null) context.shareLink(url, trip?.trip?.title) else enableSharingFor = stepId ?: -1
    }
    val actions = StepActions(
        isAuthor = vm.isAuthor,
        edit = { navController.navigate(Routes.EditStep(account.id, tripId, it.id)) },
        addPhotos = { navController.navigate(Routes.Composer(account.id, tripId, stepId = it.id)) },
        share = { share(it.id) },
        showOnMap = { step ->
            vm.openStepId = null
            vm.focusedId = TimelineItem.key(step)
        },
        comment = vm::comment,
        deleteComment = { vm.deleteComment(it) },
    )

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(trip?.trip?.title.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    navigationIcon = {
                        IconButton(onClick = navController::popBackStack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back)) }
                    },
                    actions = {
                        if (vm.isAuthor && trip != null) {
                            FilledTonalIconButton(onClick = { navController.navigate(Routes.Composer(account.id, tripId)) }) {
                                Icon(Icons.Filled.Add, stringResource(R.string.new_step))
                            }
                        }
                        IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.more)) }
                        TripMenu(menu, { menu = false }, vm, navController, onShare = { share(null) }, onDelete = { confirmDelete = true }, onUnfollow = { confirmUnfollow = true })
                    },
                )
            },
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding())) {
                // Frames the route in what the cards leave free.
                val mapPadding = PaddingValues(top = 56.dp, bottom = PagerHeight + TrackHeight + padding.calculateBottomPadding() + 24.dp)
                TripMap(
                    account, trip?.steps.orEmpty(), focusedStep?.id, camera, mapPadding,
                    onSelect = { stepId -> trip?.steps?.firstOrNull { it.id == stepId }?.let { vm.focusedId = TimelineItem.key(it) } },
                    modifier = Modifier.fillMaxSize(),
                )
                if (trip != null && trip.steps.isNotEmpty()) {
                    OverviewBar(account, trip, vm, Modifier.padding(16.dp, 8.dp)) {
                        vm.focusedId = null
                        camera = CameraRequest(null, camera.version + 1)
                    }
                }
                Column(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (vm.visibleSuggestions > 0) {
                        SuggestionsCard(vm.visibleSuggestions, onReview = { navController.navigate(Routes.Suggestions(account.id, tripId)) }, onDismiss = vm::dismissSuggestions)
                    }
                    when {
                        trip == null && vm.error != null -> UnavailableCard(vm.error!!)
                        trip == null -> Box(Modifier.fillMaxWidth().padding(PagerHeight / 3), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                        items.isEmpty() -> TripCoverCard(account, trip, vm.staleSince)
                        else -> {
                            DayTrack(
                                items,
                                start = vm.calendar.tripStart(trip.trip.startDate, items.first().date),
                                end = tripEnd(trip, vm, items.last().date),
                                focusedId = vm.focusedId,
                                onFocus = { vm.focusedId = it },
                                modifier = Modifier.padding(horizontal = 24.dp),
                            )
                            StepPager(
                                account, items, vm.calendar, queue, progress, showViews = vm.isAuthor, focusedId = vm.focusedId,
                                onFocus = { vm.focusedId = it }, onOpen = { vm.openStepId = it.id },
                            )
                        }
                    }
                }
            }
        }

        val openStep = vm.openStepId
        if (trip != null && openStep != null) {
            StepStory(
                account, trip, vm.calendar, queue.uploadsByStepId, progress, vm.isAuthor, openStep,
                onStepChange = { id ->
                    vm.openStepId = id
                    // Going back leaves the pager and the map at this step.
                    trip.steps.firstOrNull { it.id == id }?.let { vm.focusedId = TimelineItem.key(it) }
                },
                actions = actions,
                onClose = { vm.openStepId = null },
            )
        }
    }

    vm.actionError?.let {
        AlertDialog({ vm.actionError = null }, { TextButton({ vm.actionError = null }) { Text(stringResource(R.string.ok)) } },
            title = { Text(stringResource(R.string.something_went_wrong)) }, text = { Text(it) })
    }
    if (confirmDelete && trip != null) {
        var name by remember { mutableStateOf("") }
        ConfirmDialog(
            title = stringResource(R.string.delete_trip_title),
            text = stringResource(R.string.delete_trip_text, trip.trip.title),
            confirm = stringResource(R.string.delete),
            enabled = name.trim() == trip.trip.title.trim(),
            onConfirm = { vm.deleteTrip(onDeleted = { navController.popBackStack() }) },
            onDismiss = { confirmDelete = false },
        ) { OutlinedTextField(name, { name = it }, label = { Text(stringResource(R.string.trip_name)) }, singleLine = true) }
    }
    if (confirmUnfollow) {
        ConfirmDialog(
            title = stringResource(R.string.unfollow_title), text = stringResource(R.string.unfollow_text), confirm = stringResource(R.string.unfollow),
            onConfirm = { vm.unfollow() }, onDismiss = { confirmUnfollow = false },
        )
    }
    enableSharingFor?.let { target ->
        AlertDialog(
            onDismissRequest = { enableSharingFor = null },
            title = { Text(stringResource(R.string.sharing_off_title)) },
            text = { Text(stringResource(R.string.sharing_off_text)) },
            confirmButton = {
                TextButton(onClick = {
                    enableSharingFor = null
                    vm.enableSharing { updated -> updated.trip.share.link(target.takeIf { it > 0 })?.let { context.shareLink(it, updated.trip.title) } }
                }) { Text(stringResource(R.string.turn_on_sharing_and_share)) }
            },
            dismissButton = { TextButton(onClick = { enableSharingFor = null }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

/** The bar runs to the entered end date – the end of that day – or to the last step, whichever is later. */
private fun tripEnd(trip: TripDetail, vm: TripViewModel, last: java.time.Instant): java.time.Instant {
    val entered = vm.calendar.startOfDay(trip.trip.endDate)?.plus(java.time.Duration.ofDays(1)) ?: return last
    return maxOf(entered, last)
}

@Composable
private fun TripMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    vm: TripViewModel,
    navController: NavController,
    onShare: () -> Unit,
    onDelete: () -> Unit,
    onUnfollow: () -> Unit,
) {
    val account = vm.account
    @Composable fun item(label: Int, icon: androidx.compose.ui.graphics.vector.ImageVector, action: () -> Unit) =
        DropdownMenuItem({ Text(stringResource(label)) }, { onDismiss(); action() }, leadingIcon = { Icon(icon, null) })

    DropdownMenu(expanded, onDismiss) {
        if (vm.isAuthor) {
            item(R.string.edit_trip, Icons.Filled.Edit) { navController.navigate(Routes.TripForm(account.id, vm.tripId)) }
            item(R.string.share_trip, Icons.Filled.Share, onShare)
            item(R.string.readers, Icons.Filled.People) { navController.navigate(Routes.Readers(account.id, vm.tripId)) }
            item(R.string.photo_suggestions, Icons.Filled.PhotoLibrary) { navController.navigate(Routes.Suggestions(account.id, vm.tripId)) }
        }
        item(R.string.refresh, Icons.Filled.Refresh) { vm.refresh() }
        DropdownMenuItem(
            text = { Text(stringResource(if (vm.isAuthor) R.string.notify_comments else R.string.notify_steps)) },
            leadingIcon = { Icon(Icons.Filled.Notifications, null) },
            trailingIcon = { Checkbox(!vm.muted, null) },
            onClick = vm::toggleMuted,
        )
        HorizontalDivider()
        if (vm.isAuthor) {
            item(R.string.trip_settings, Icons.Filled.Settings) { navController.navigate(Routes.TripSettings(account.id, vm.tripId)) }
            item(R.string.delete_trip, Icons.Outlined.Delete, onDelete)
        } else {
            item(R.string.unfollow, Icons.Filled.PersonRemove, onUnfollow)
        }
    }
}

/** The trip at a glance, at the top of the map; a tap shows the whole route. */
@Composable
private fun OverviewBar(account: Account, trip: TripDetail, vm: TripViewModel, modifier: Modifier, onClick: () -> Unit) {
    val context = LocalContext.current
    Surface(shape = CircleShape, shadowElevation = 3.dp, tonalElevation = 3.dp, modifier = modifier.clip(CircleShape).clickable(onClick = onClick)) {
        Row(Modifier.padding(start = 6.dp, end = 16.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TripCover(account, trip.trip, Variant.THUMB, Modifier.size(38.dp).clip(CircleShape), iconSize = 14.dp)
            Column {
                Dates.tripRange(context, trip.trip, vm.calendar)?.let { Text(it, style = MaterialTheme.typography.labelLarge) }
                vm.staleSince?.let { OfflineNote(it) } ?: Text(tripCounts(trip.trip), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Outlined.OpenInFull, stringResource(R.string.show_whole_trip), Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** The only card while the trip has no steps: cover, title, dates. */
@Composable
private fun TripCoverCard(account: Account, trip: TripDetail, staleSince: Long?) {
    ElevatedCard(Modifier.padding(horizontal = 16.dp).widthIn(max = 440.dp).fillMaxWidth()) {
        TripCover(account, trip.trip, Variant.MEDIUM, Modifier.fillMaxWidth().padding(8.dp).size(height = 112.dp, width = 440.dp).clip(MaterialTheme.shapes.large), iconSize = 34.dp)
        Column(Modifier.padding(horizontal = 18.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(trip.trip.title, style = MaterialTheme.typography.titleMedium)
            Hint(listOfNotNull(Dates.tripRange(LocalContext.current, trip.trip, account.calendar), tripCounts(trip.trip)).joinToString(" · "))
            staleSince?.let { OfflineNote(it) } ?: Hint(stringResource(R.string.steps_appear_here))
        }
    }
}

@Composable
private fun UnavailableCard(message: String) {
    Card(Modifier.padding(16.dp).fillMaxWidth()) {
        Row(Modifier.padding(20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Outlined.ErrorOutline, null)
            Column {
                Text(stringResource(R.string.trip_unavailable), style = MaterialTheme.typography.titleMedium)
                Hint(message)
            }
        }
    }
}

/** Library photos from the trip's period that aren't in it yet ([D22]). */
@Composable
private fun SuggestionsCard(count: Int, onReview: () -> Unit, onDismiss: () -> Unit) {
    ElevatedCard(Modifier.padding(horizontal = 16.dp).widthIn(max = 440.dp)) {
        Row(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.PhotoLibrary, null, tint = MaterialTheme.colorScheme.primary)
            Text(pluralStringResource(R.plurals.suggestions_banner, count, count), Modifier.weight(1f).padding(horizontal = 12.dp), style = MaterialTheme.typography.bodyMedium)
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.not_now)) }
            FilledTonalButton(onClick = onReview) { Text(stringResource(R.string.review)) }
        }
    }
}
