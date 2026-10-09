package de.ownsteps.app.ui.trip

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PageSize
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import de.ownsteps.app.R
import de.ownsteps.app.api.Step
import de.ownsteps.app.api.Variant
import de.ownsteps.app.data.Account
import de.ownsteps.app.data.PendingUpload
import de.ownsteps.app.data.TripCalendar
import de.ownsteps.app.data.UploadSnapshot
import de.ownsteps.app.model
import de.ownsteps.app.ui.ConfirmDialog
import de.ownsteps.app.ui.ErrorText
import de.ownsteps.app.ui.IconLabel
import de.ownsteps.app.ui.RemoteImage
import de.ownsteps.app.ui.StepCounts
import de.ownsteps.app.ui.StepTitle
import de.ownsteps.app.ui.TrackBlue
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import java.time.Instant

val PagerHeight = 236.dp
val TrackHeight = 40.dp
private val CardShape = RoundedCornerShape(28.dp)
private val PhotoShape = RoundedCornerShape(20.dp)

/**
 * The steps as cards side by side under the map, like Polarsteps: swiping
 * moves to the previous or next step and the map follows. Oldest on the
 * left, so the route reads left to right; it opens on the newest, which is
 * what readers come back for ([E13]).
 */
@Composable
fun StepPager(
    account: Account,
    items: List<TimelineItem>,
    calendar: TripCalendar,
    queue: UploadSnapshot,
    progress: Map<String, Float>,
    showViews: Boolean,
    focusedId: String?,
    onFocus: (String) -> Unit,
    onOpen: (Step) -> Unit,
) {
    val initial = items.indexOfFirst { it.id == focusedId }.takeIf { it >= 0 } ?: items.lastIndex
    // Page count and keys read the same, current list: the queue can add a card at any time.
    val currentItems by rememberUpdatedState(items)
    val state = rememberPagerState(initialPage = initial) { currentItems.size }
    val haptics = LocalHapticFeedback.current
    val focus by rememberUpdatedState(onFocus)

    // Only the user's own swipes choose a step; where the pager opens or is
    // moved to from elsewhere isn't a choice, and must not move the map.
    LaunchedEffect(state) {
        var swiped = false
        launch { state.interactionSource.interactions.collect { if (it is DragInteraction.Start) swiped = true } }
        snapshotFlow { state.settledPage }.drop(1).collect { page ->
            if (!swiped) return@collect
            swiped = false
            currentItems.getOrNull(page)?.let { focus(it.id) }
            haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
        }
    }
    // Nothing chosen yet: stay on the newest, also when a fresher copy brings more steps.
    LaunchedEffect(items.size) {
        if (focusedId == null && state.currentPage != items.lastIndex) state.scrollToPage(items.lastIndex)
    }
    // Chosen elsewhere – a marker, the day track, a notification.
    LaunchedEffect(focusedId) {
        val index = items.indexOfFirst { it.id == focusedId }
        if (index >= 0 && index != state.currentPage) state.animateScrollToPage(index)
    }

    BoxWithConstraints(Modifier.fillMaxWidth()) {
        // Most of the width, so the neighbors peek in and show there's more.
        val pageWidth = minOf(maxWidth * 0.88f, 440.dp)
        HorizontalPager(
            state = state,
            pageSize = PageSize.Fixed(pageWidth),
            contentPadding = PaddingValues(horizontal = (maxWidth - pageWidth) / 2),
            pageSpacing = 10.dp,
            key = { currentItems[it].id },
            modifier = Modifier.height(PagerHeight),
        ) { page ->
            when (val item = currentItems[page]) {
                is TimelineItem.Server -> StepPreviewCard(
                    account, item.step, item.day, calendar,
                    pendingCount = queue.uploadsByStepId[item.step.id]?.size ?: 0,
                    views = if (showViews) item.step.viewCount else null,
                    onClick = { onOpen(item.step) },
                )
                is TimelineItem.Local -> LocalStepCard(item.local, item.day, calendar, progress)
            }
        }
    }
}

/** A step in the pager: its first photo, day and place, the start of the text. */
@Composable
private fun StepPreviewCard(account: Account, step: Step, day: Int?, calendar: TripCalendar, pendingCount: Int, views: Int?, onClick: () -> Unit) {
    ElevatedCard(onClick = onClick, shape = CardShape, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.padding(8.dp).fillMaxSize()) {
            step.photos.firstOrNull()?.let { photo ->
                Box(Modifier.fillMaxWidth().height(100.dp).clip(PhotoShape)) {
                    RemoteImage(account, photo, Variant.MEDIUM, Modifier.fillMaxSize(), fallbacks = listOf(Variant.THUMB))
                    if (step.photos.size > 1) {
                        Surface(shape = CircleShape, color = Color.Black.copy(alpha = 0.5f), modifier = Modifier.align(Alignment.BottomEnd).padding(8.dp)) {
                            Text("+${step.photos.size - 1}", color = Color.White, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            Column(Modifier.padding(horizontal = 10.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                StepTitle(day, step.occurredAt, calendar, step.placeName)
                if (step.body.isNotEmpty()) {
                    Text(
                        step.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = if (step.photos.isEmpty()) 5 else 2, overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.weight(1f))
                StepCounts(step.photos.size + pendingCount, step.comments.size, views)
            }
        }
    }
}

/** A step written on the device that the server doesn't have yet. Long press discards it. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun LocalStepCard(local: UploadSnapshot.LocalStep, day: Int?, calendar: TripCalendar, progress: Map<String, Float>) {
    val model = LocalContext.current.model
    var discard by remember { mutableStateOf(false) }
    val step = local.step
    ElevatedCard(shape = CardShape, modifier = Modifier.fillMaxSize().combinedClickable(onClick = {}, onLongClick = { discard = true })) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            StepTitle(day, Instant.ofEpochMilli(step.occurredAt), calendar, step.placeName)
            if (local.uploads.isNotEmpty()) LocalThumbnails(local.uploads)
            if (step.body.isNotEmpty()) Text(step.body, maxLines = if (local.uploads.isEmpty()) 4 else 1, overflow = TextOverflow.Ellipsis)
            val error = step.lastError
            if (error != null) IconLabel(Icons.Outlined.ErrorOutline, ErrorText.upload(LocalContext.current, error), color = MaterialTheme.colorScheme.error)
            else PendingUploads(local.uploads, progress, showThumbnails = false)
        }
    }
    if (discard) {
        ConfirmDialog(
            title = stringResource(R.string.discard_step_title), text = null, confirm = stringResource(R.string.discard_step),
            onConfirm = { model.scope.launch { model.uploads.removeStep(step.clientUuid) } }, onDismiss = { discard = false },
        )
    }
}

/** How the uploads of a step are doing, with retry and remove for the ones the server refused. */
@Composable
fun PendingUploads(uploads: List<PendingUpload>, progress: Map<String, Float>, showThumbnails: Boolean = true) {
    val context = LocalContext.current
    val model = context.model
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (showThumbnails && uploads.isNotEmpty()) LocalThumbnails(uploads)
        val (failed, active) = uploads.partition { it.state == PendingUpload.State.FAILED }
        when {
            active.isEmpty() && uploads.isEmpty() -> IconLabel(Icons.Outlined.CloudUpload, stringResource(R.string.waiting_to_send))
            active.isEmpty() -> Unit
            active.none { it.state == PendingUpload.State.UPLOADING } -> IconLabel(
                Icons.Outlined.CloudUpload,
                if (active.any { it.lastError != null }) stringResource(R.string.waiting_for_connection)
                else pluralStringResource(R.plurals.waiting_to_upload, active.size, active.size),
            )
            else -> Column {
                Text(pluralStringResource(R.plurals.uploading, active.size, active.size), style = MaterialTheme.typography.labelMedium)
                LinearProgressIndicator({ active.sumOf { (progress[it.clientUuid] ?: 0f).toDouble() }.toFloat() / active.size }, Modifier.fillMaxWidth())
            }
        }
        for (upload in failed) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconLabel(Icons.Outlined.ErrorOutline, ErrorText.upload(context, upload.lastError.orEmpty()), Modifier.weight(1f), color = MaterialTheme.colorScheme.error)
                TextButton(onClick = { model.scope.launch { model.uploads.retry(upload.clientUuid); model.resumeUploads() } }) { Text(stringResource(R.string.retry)) }
                TextButton(onClick = { model.scope.launch { model.uploads.remove(upload.clientUuid) } }) { Text(stringResource(R.string.remove)) }
            }
        }
    }
}

/** Previews of media that only exist on the device so far. */
@Composable
private fun LocalThumbnails(uploads: List<PendingUpload>) {
    val model = LocalContext.current.model
    LazyRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        items(uploads, key = { it.clientUuid }) { upload ->
            Box(Modifier.size(64.dp).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                AsyncImage(model.uploads.thumbnail(upload), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop,
                    alpha = if (upload.state == PendingUpload.State.FAILED) 0.5f else 1f)
                if (upload.isVideo) Icon(Icons.Filled.PlayCircle, null, Modifier.align(Alignment.Center), tint = Color.White)
            }
        }
    }
}

/**
 * The trip as a blue bar above the cards, like Polarsteps: filled up to the
 * step in view, with "Day n" riding on its end. Dragging along it scrubs
 * through the steps – the cards and the map follow.
 */
@Composable
fun DayTrack(items: List<TimelineItem>, start: Instant?, end: Instant?, focusedId: String?, onFocus: (String) -> Unit, modifier: Modifier = Modifier) {
    val current = items.firstOrNull { it.id == focusedId } ?: items.lastOrNull()
    fun fraction(item: TimelineItem): Float {
        if (start == null || end == null || end <= start) return 1f
        return ((item.date.toEpochMilli() - start.toEpochMilli()).toFloat() / (end.toEpochMilli() - start.toEpochMilli())).coerceIn(0f, 1f)
    }
    val filled by animateFloatAsState(current?.let(::fraction) ?: 1f, label = "track")
    val pick by rememberUpdatedState { at: Float ->
        items.minByOrNull { kotlin.math.abs(fraction(it) - at) }?.let { if (it.id != focusedId) onFocus(it.id) }
    }
    BoxWithConstraints(
        modifier.fillMaxWidth().height(TrackHeight).pointerInput(Unit) {
            detectTapGestures { pick(it.x / size.width) }
        }.pointerInput(Unit) {
            detectHorizontalDragGestures { change, _ -> pick((change.position.x / size.width).coerceIn(0f, 1f)) }
        },
        contentAlignment = Alignment.CenterStart,
    ) {
        val width = maxWidth
        Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f)).border(0.5.dp, Color.White.copy(alpha = 0.25f), CircleShape))
        Box(Modifier.width(maxOf(6.dp, width * filled)).height(6.dp).clip(CircleShape).background(TrackBlue))
        // The pill stays on the bar even at its very ends.
        val pillHalf = 44.dp
        val center = (width * filled).coerceIn(pillHalf, width - pillHalf)
        Surface(
            shape = CircleShape, color = TrackBlue, contentColor = Color.White, shadowElevation = 3.dp,
            modifier = Modifier.offset(x = center - pillHalf).width(pillHalf * 2).border(1.dp, Color.White.copy(alpha = 0.6f), CircleShape),
        ) {
            Row(Modifier.padding(vertical = 5.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.AutoMirrored.Filled.DirectionsWalk, null, Modifier.size(14.dp))
                current?.day?.let { Text(stringResource(R.string.day_n, it), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 4.dp)) }
            }
        }
    }
}
