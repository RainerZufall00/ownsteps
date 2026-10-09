package de.ownsteps.app.ui.trip

import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.outlined.Photo
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.view.WindowCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import de.ownsteps.app.R
import de.ownsteps.app.api.Comment
import de.ownsteps.app.api.Photo
import de.ownsteps.app.api.Step
import de.ownsteps.app.api.TripDetail
import de.ownsteps.app.api.Variant
import de.ownsteps.app.data.Account
import de.ownsteps.app.data.PendingUpload
import de.ownsteps.app.data.TripCalendar
import de.ownsteps.app.model
import de.ownsteps.app.ui.CoverPlaceholder
import de.ownsteps.app.ui.Dates
import de.ownsteps.app.ui.DayLine
import de.ownsteps.app.ui.ErrorMessage
import de.ownsteps.app.ui.Hint
import de.ownsteps.app.ui.RemoteImage
import de.ownsteps.app.ui.rememberAction
import kotlinx.coroutines.launch

/** What a reader or author can do from an open step. */
class StepActions(
    val isAuthor: Boolean,
    val edit: (Step) -> Unit,
    val addPhotos: (Step) -> Unit,
    val share: (Step) -> Unit,
    val showOnMap: (Step) -> Unit,
    val comment: suspend (Step, String) -> Unit,
    val deleteComment: (Comment) -> Unit,
)

/**
 * The steps as full-screen stories, one above the other: swiping up brings
 * the next entry, so moving on to another day is a real scroll and not just
 * another photo. Inside a step its photos page sideways; a tap on the right
 * goes on, on the left back.
 */
@Composable
fun StepStory(
    account: Account,
    trip: TripDetail,
    calendar: TripCalendar,
    pending: Map<Long, List<PendingUpload>>,
    progress: Map<String, Float>,
    showViews: Boolean,
    stepId: Long,
    onStepChange: (Long) -> Unit,
    actions: StepActions,
    onClose: () -> Unit,
) {
    val steps by rememberUpdatedState(trip.steps)
    val start = calendar.tripStart(trip.trip.startDate, steps.firstOrNull()?.occurredAt)
    val pager = rememberPagerState(initialPage = steps.indexOfFirst { it.id == stepId }.coerceAtLeast(0)) { steps.size }
    /** The photo each step is at – kept while moving between steps. */
    val photoIndex = remember { mutableStateMapOf<Long, Int>() }
    var commentsFor by remember { mutableStateOf<Long?>(null) }
    var reading by remember { mutableStateOf<Step?>(null) }
    var zoom by remember { mutableStateOf<Pair<Step, Int>?>(null) }
    val change by rememberUpdatedState(onStepChange)

    BackHandler(onBack = onClose)
    LightSystemBars()
    LaunchedEffect(pager) { snapshotFlow { pager.settledPage }.collect { steps.getOrNull(it)?.let { step -> change(step.id) } } }
    // The step was deleted while open.
    LaunchedEffect(steps.map { it.id }) { if (steps.none { it.id == stepId }) onClose() }

    MaterialTheme(colorScheme = darkColorScheme(primary = MaterialTheme.colorScheme.inversePrimary)) {
        VerticalPager(pager, Modifier.fillMaxSize().background(Color.Black), beyondViewportPageCount = 1, key = { steps[it].id }) { page ->
            val step = steps[page]
            StoryPage(
                account = account,
                step = step,
                day = start?.let { calendar.tripDay(step.occurredAt, it) },
                calendar = calendar,
                pending = pending[step.id].orEmpty(),
                progress = progress,
                views = if (showViews) step.viewCount else null,
                isCurrent = page == pager.currentPage,
                index = photoIndex[step.id] ?: 0,
                onIndex = { photoIndex[step.id] = it },
                actions = actions,
                onClose = onClose,
                onComments = { commentsFor = step.id },
                onRead = { reading = step },
                onZoom = { zoom = step to it },
            )
        }
    }

    commentsFor?.let { id -> steps.firstOrNull { it.id == id }?.let { CommentsSheet(it, actions) { commentsFor = null } } }
    reading?.let { step -> TextSheet(step, start?.let { calendar.tripDay(step.occurredAt, it) }, calendar) { reading = null } }
    zoom?.let { (step, index) -> PhotoViewer(account, step.photos, index) { zoom = null } }
}

/** Light icons over the black story, the theme's again once it closes. */
@Composable
private fun LightSystemBars() {
    val view = LocalView.current
    DisposableEffect(view) {
        val window = (view.context as? android.app.Activity)?.window ?: return@DisposableEffect onDispose {}
        val controller = WindowCompat.getInsetsController(window, view)
        val wasLight = controller.isAppearanceLightStatusBars
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false
        onDispose {
            controller.isAppearanceLightStatusBars = wasLight
            controller.isAppearanceLightNavigationBars = wasLight
        }
    }
}

/**
 * One step as a story. Each layer has its own place, so it's clear what
 * belongs to what: day and place at the top under the bars, like the sender
 * of a status, and the day's text at the bottom – both stay while swiping.
 * The photos page between them, never under them, each with its caption
 * right below it. A step without photos becomes a text story.
 */
@Composable
private fun StoryPage(
    account: Account,
    step: Step,
    day: Int?,
    calendar: TripCalendar,
    pending: List<PendingUpload>,
    progress: Map<String, Float>,
    views: Int?,
    isCurrent: Boolean,
    index: Int,
    onIndex: (Int) -> Unit,
    actions: StepActions,
    onClose: () -> Unit,
    onComments: () -> Unit,
    onRead: () -> Unit,
    onZoom: (Int) -> Unit,
) {
    val photos by rememberUpdatedState(step.photos)
    val pager = rememberPagerState(initialPage = index.coerceIn(0, maxOf(photos.lastIndex, 0))) { photos.size }
    val scope = rememberCoroutineScope()
    val go = { delta: Int -> (pager.currentPage + delta).takeIf { it in photos.indices }?.let { scope.launch { pager.animateScrollToPage(it) } } }
    LaunchedEffect(pager) { snapshotFlow { pager.settledPage }.collect(onIndex) }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val width = constraints.maxWidth
        /** A tap on the right goes on, on the left back; a double tap zooms. */
        val taps = Modifier.pointerInput(photos) {
            detectTapGestures(onDoubleTap = { if (photos.isNotEmpty()) onZoom(pager.currentPage) }) { offset ->
                if (offset.x < width / 3f) go(-1) else go(1)
            }
        }
        if (photos.isEmpty()) CoverPlaceholder(step.id, Modifier.fillMaxSize(), iconSize = 0.dp)
        else Backdrop(account, photos.getOrNull(pager.currentPage))

        Column(Modifier.fillMaxSize()) {
            StoryHeader(step, day, calendar, photos.size, pager.currentPage, actions, onClose)
            Box(Modifier.weight(1f).fillMaxWidth().then(taps), contentAlignment = Alignment.Center) {
                if (photos.isEmpty()) {
                    // No photos: the text is the picture.
                    if (step.body.isNotEmpty()) {
                        ClampedText(step.body, 10, MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center), Modifier.padding(horizontal = 32.dp), onRead)
                    }
                } else {
                    HorizontalPager(pager, Modifier.fillMaxSize(), pageSpacing = 20.dp, key = { photos[it].id }) { page ->
                        StoryPhoto(account, photos[page], playing = isCurrent && page == pager.currentPage)
                    }
                }
            }
            StoryText(step, pending, progress, views, actions, onComments, onRead)
        }
    }
}

/** Bars, then day and place – the step's sender, standing still while the photos move. */
@Composable
private fun StoryHeader(step: Step, day: Int?, calendar: TripCalendar, count: Int, current: Int, actions: StepActions, onClose: () -> Unit) {
    Column(
        Modifier.fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent)))
            .statusBarsPadding()
            .padding(start = 8.dp, end = 8.dp, bottom = 12.dp),
    ) {
        if (count > 1) PhotoProgress(count, current)
        Row(verticalAlignment = Alignment.CenterVertically) {
            StoryButton(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back), onClose)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp).semantics(mergeDescendants = true) { heading() }) {
                DayLine(day, step.occurredAt, calendar, color = Color.White.copy(alpha = 0.85f))
                step.placeName?.let { Text(it, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 2) }
            }
            if (actions.isAuthor) StepMenu(step, actions)
        }
    }
}

/** A photo or video, as large as it fits, with its caption right under it – set like a note under a print. */
@Composable
private fun StoryPhoto(account: Account, photo: Photo, playing: Boolean) {
    Column(Modifier.fillMaxSize().padding(vertical = 4.dp), verticalArrangement = Arrangement.Center) {
        val ratio = if (photo.width > 0 && photo.height > 0) photo.width.toFloat() / photo.height else 1f
        // Measured after the caption: the photo takes what's left, keeping its shape.
        val media = Modifier.weight(1f, fill = false).fillMaxWidth().aspectRatio(ratio)
        if (photo.isVideo) VideoPlayer(account, photo, playing, media)
        else RemoteImage(account, photo, Variant.LARGE, media, ContentScale.Fit, listOf(Variant.MEDIUM, Variant.THUMB))
        photo.caption?.trim()?.takeIf { it.isNotEmpty() }?.let { caption ->
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.Photo, null, Modifier.size(16.dp).padding(top = 2.dp), tint = Color.White.copy(alpha = 0.7f))
                Text(caption, color = Color.White.copy(alpha = 0.92f), style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic, maxLines = 4)
            }
        }
    }
}

/** The shown photo, blurred, behind everything – fading from photo to photo instead of sliding. */
@Composable
private fun Backdrop(account: Account, photo: Photo?) {
    AnimatedContent(photo, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "backdrop") { current ->
        if (current != null) RemoteImage(account, current, Variant.THUMB, Modifier.fillMaxSize().blur(40.dp).graphicsLayer { alpha = 0.55f })
    }
}

/** One bar per photo, filled up to the one shown. */
@Composable
private fun PhotoProgress(count: Int, current: Int) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        repeat(count) { position ->
            Box(Modifier.weight(1f).height(3.dp).clip(CircleShape).background(Color.White.copy(alpha = if (position <= current) 0.95f else 0.35f)))
        }
    }
}

@Composable
private fun StoryButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    FilledTonalIconButton(onClick, colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = Color.Black.copy(alpha = 0.35f), contentColor = Color.White)) {
        Icon(icon, label)
    }
}

@Composable
private fun StepMenu(step: Step, actions: StepActions) {
    var open by remember { mutableStateOf(false) }
    Box {
        StoryButton(Icons.Filled.MoreVert, stringResource(R.string.step_options)) { open = true }
        DropdownMenu(open, { open = false }) {
            DropdownMenuItem({ Text(stringResource(R.string.edit)) }, { open = false; actions.edit(step) }, leadingIcon = { Icon(Icons.Filled.Edit, null) })
            DropdownMenuItem({ Text(stringResource(R.string.add_photos)) }, { open = false; actions.addPhotos(step) }, leadingIcon = { Icon(Icons.Filled.AddPhotoAlternate, null) })
            DropdownMenuItem({ Text(stringResource(R.string.share)) }, { open = false; actions.share(step) }, leadingIcon = { Icon(Icons.Filled.Share, null) })
        }
    }
}

/** The day's text, uploads still on the way, comments and the map – staying while the photos move. */
@Composable
private fun StoryText(
    step: Step,
    pending: List<PendingUpload>,
    progress: Map<String, Float>,
    views: Int?,
    actions: StepActions,
    onComments: () -> Unit,
    onRead: () -> Unit,
) {
    Column(
        Modifier.fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.5f))))
            .navigationBarsPadding()
            .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // On a text story the text is the picture already.
        if (step.photos.isNotEmpty() && step.body.isNotEmpty()) {
            ClampedText(step.body, 3, MaterialTheme.typography.bodyLarge.copy(color = Color.White.copy(alpha = 0.9f)), Modifier.fillMaxWidth(), onRead)
        }
        if (pending.isNotEmpty()) PendingUploads(pending, progress)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            FilledTonalButton(onClick = onComments) {
                Icon(Icons.Outlined.ChatBubbleOutline, null, Modifier.padding(end = 6.dp))
                Text(pluralStringResource(R.plurals.comments, step.comments.size, step.comments.size))
            }
            if (step.hasPlace) {
                FilledTonalIconButton(onClick = { actions.showOnMap(step) }) { Icon(Icons.Filled.Map, stringResource(R.string.show_on_map)) }
            }
            Spacer(Modifier.weight(1f))
            views?.let {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Visibility, pluralStringResource(R.plurals.seen_by, it, it), tint = Color.White.copy(alpha = 0.8f))
                    Text(" $it", color = Color.White.copy(alpha = 0.8f))
                }
            }
        }
    }
}

/**
 * Text cut to [lines]. When anything was cut, it ends in a bold "… more",
 * like captions in messengers, and a tap opens the whole text – a separate
 * button below was easy to miss.
 */
@Composable
private fun ClampedText(text: String, lines: Int, style: TextStyle, modifier: Modifier, more: () -> Unit) {
    // Paragraphs run on in the preview; the reading sheet keeps them.
    val flowing = remember(text) { text.lines().map(String::trim).filter(String::isNotEmpty).joinToString(" ") }
    val moreLabel = stringResource(R.string.more_inline)
    var cut by remember(flowing, lines) { mutableStateOf<Int?>(null) }
    val shown = cut?.let { end ->
        buildAnnotatedString {
            append(flowing.take(end).trimEnd())
            append("… ")
            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(moreLabel) }
        }
    } ?: buildAnnotatedString { append(flowing) }
    Text(
        shown, modifier.clickable(enabled = cut != null, onClick = more), style = style, maxLines = lines,
        onTextLayout = { layout ->
            // Measured once uncut: room is made for "… more" on the last line.
            if (cut == null && layout.hasVisualOverflow) {
                cut = (layout.getLineEnd(lines - 1, visibleEnd = true) - moreLabel.length - 4).coerceAtLeast(0)
            }
        },
    )
}

/** The whole text of a step, to read at length. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TextSheet(step: Step, day: Int?, calendar: TripCalendar, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismiss) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            DayLine(day, step.occurredAt, calendar, withYear = true)
            step.placeName?.let { Text(it, style = MaterialTheme.typography.headlineMedium) }
            SelectionContainer { Text(step.body, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 8.dp)) }
        }
    }
}

/** The comments of a step, with a field to write one. Authors can delete comments. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CommentsSheet(step: Step, actions: StepActions, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf("") }
    val action = rememberAction()
    ModalBottomSheet(onDismiss) {
        Column(Modifier.imePadding().padding(bottom = 16.dp)) {
            Text(stringResource(R.string.comments), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
            LazyColumn(Modifier.weight(1f, fill = false)) {
                if (step.comments.isEmpty()) item { Hint(stringResource(R.string.no_comments), Modifier.padding(horizontal = 24.dp, vertical = 16.dp)) }
                items(step.comments, key = { it.id }) { comment ->
                    ListItem(
                        overlineContent = { Text("${comment.authorName} · ${Dates.relative(comment.createdAt)}") },
                        headlineContent = { Text(comment.body) },
                        trailingContent = if (actions.isAuthor) {
                            { IconButton(onClick = { actions.deleteComment(comment) }) { Icon(Icons.Outlined.Delete, stringResource(R.string.delete_comment)) } }
                        } else null,
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    )
                }
            }
            HorizontalDivider()
            action.error?.let { Box(Modifier.padding(horizontal = 24.dp, vertical = 4.dp)) { ErrorMessage(it) } }
            Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(text, { text = it }, Modifier.weight(1f), placeholder = { Text(stringResource(R.string.your_comment)) }, maxLines = 5)
                IconButton(
                    onClick = { action.run(onSuccess = { text = "" }) { actions.comment(step, text) } },
                    enabled = text.isNotBlank() && !action.busy,
                ) { Icon(Icons.AutoMirrored.Filled.Send, stringResource(R.string.send)) }
            }
        }
    }
}

/** Full-screen photos and videos of one step, paged sideways; pinch or double-tap to zoom. */
@Composable
private fun PhotoViewer(account: Account, photos: List<Photo>, startIndex: Int, onDismiss: () -> Unit) {
    Dialog(onDismiss, DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        val current by rememberUpdatedState(photos)
        val pager = rememberPagerState(initialPage = startIndex) { current.size }
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(pager, Modifier.fillMaxSize(), key = { current[it].id }) { page ->
                val photo = current[page]
                if (photo.isVideo) VideoPlayer(account, photo, playing = page == pager.currentPage, Modifier.fillMaxSize())
                else ZoomablePhoto(account, photo)
            }
            Row(Modifier.statusBarsPadding().padding(8.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                if (photos.size > 1) Text("${pager.currentPage + 1} / ${photos.size}", color = Color.White, modifier = Modifier.padding(start = 12.dp))
                Spacer(Modifier.weight(1f))
                StoryButton(Icons.Filled.Close, stringResource(R.string.close), onDismiss)
            }
            photos.getOrNull(pager.currentPage)?.caption?.takeIf { it.isNotEmpty() }?.let {
                Surface(color = Color.Black.copy(alpha = 0.5f), shape = RoundedCornerShape(20.dp), modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(16.dp)) {
                    Text(it, color = Color.White, modifier = Modifier.padding(horizontal = 18.dp, vertical = 12.dp), textAlign = TextAlign.Center)
                }
            }
        }
    }
}

/** Pinch or double-tap to zoom; panning only while zoomed, so paging keeps working otherwise. */
@Composable
private fun ZoomablePhoto(account: Account, photo: Photo) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    val state = rememberTransformableState { _: Offset, zoom: Float, pan: Offset, _: Float ->
        scale = (scale * zoom).coerceIn(1f, 4f)
        offset = if (scale > 1f) offset + pan else Offset.Zero
    }
    val shownScale by animateFloatAsState(scale, label = "zoom")
    RemoteImage(
        account, photo, Variant.LARGE,
        Modifier.fillMaxSize()
            .pointerInput(Unit) { detectTapGestures(onDoubleTap = { if (scale > 1f) { scale = 1f; offset = Offset.Zero } else scale = 2.5f }) }
            .transformable(state, canPan = { scale > 1f })
            .graphicsLayer { scaleX = shownScale; scaleY = shownScale; translationX = offset.x; translationY = offset.y },
        ContentScale.Fit, listOf(Variant.MEDIUM, Variant.THUMB),
    )
}

/** Streams a video with the account's token; plays only while it's the one in view. */
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
private fun VideoPlayer(account: Account, photo: Photo, playing: Boolean, modifier: Modifier) {
    val context = LocalContext.current
    val model = context.model
    val player = remember(photo.id) {
        val client = model.client(account)
        val source = OkHttpDataSource.Factory(model.http).setDefaultRequestProperties(listOfNotNull(client.authorization?.let { "Authorization" to it }).toMap())
        ExoPlayer.Builder(context).setMediaSourceFactory(DefaultMediaSourceFactory(source)).build().apply {
            setMediaItem(MediaItem.fromUri(client.mediaUrl(photo.id, Variant.VIDEO).toString()))
            prepare()
        }
    }
    LaunchedEffect(playing) { player.playWhenReady = playing }
    DisposableEffect(player) { onDispose { player.release() } }
    Box(modifier) {
        // The poster until the first frame is there.
        RemoteImage(account, photo, Variant.MEDIUM, Modifier.fillMaxSize(), ContentScale.Fit)
        AndroidView(
            factory = { PlayerView(it).apply { this.player = player; layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT) } },
            modifier = Modifier.fillMaxSize(),
        )
    }
}
