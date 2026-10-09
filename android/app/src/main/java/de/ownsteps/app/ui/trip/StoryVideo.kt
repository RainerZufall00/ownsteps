package de.ownsteps.app.ui.trip

import android.animation.ValueAnimator
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import de.ownsteps.app.R
import de.ownsteps.app.api.Photo
import de.ownsteps.app.api.Variant
import de.ownsteps.app.data.Account
import de.ownsteps.app.model
import de.ownsteps.app.ui.RemoteImage
import kotlinx.coroutines.delay

/**
 * Sound for all story videos at once: off until a tap, then on for the next
 * video too, until the app starts again.
 */
private object StorySound {
    var muted by mutableStateOf(true)
}

/**
 * A video as in a story: it plays by itself, muted and looping, while it's
 * the page in view, and stops when paged away, off screen or in the
 * background. No controls – a tap switches the sound, a thin bar shows the
 * position, and a small button opens the standard controls for scrubbing.
 * Until the first frame is there, the poster stands in. With animations
 * switched off in the system, the poster waits with a play button.
 *
 * Muted, the player doesn't ask for audio focus, so the user's music keeps
 * playing; with sound it does.
 */
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun StoryVideo(account: Account, photo: Photo, active: Boolean, modifier: Modifier = Modifier, onEdgeTap: ((forward: Boolean) -> Unit)? = null) {
    val context = LocalContext.current
    val model = context.model
    val resumed by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val inForeground = resumed.isAtLeast(Lifecycle.State.RESUMED)
    // "Remove animations" is Android's nearest to iOS' video autoplay switch.
    val autoplay = remember(inForeground) { ValueAnimator.areAnimatorsEnabled() }
    /** Without autoplay: the play button was tapped while on this page. */
    var started by remember(photo.id) { mutableStateOf(false) }
    var fullControls by remember { mutableStateOf(false) }
    var player by remember(photo.id) { mutableStateOf<ExoPlayer?>(null) }
    var firstFrame by remember(photo.id) { mutableStateOf(false) }
    val progress = remember(photo.id) { mutableFloatStateOf(0f) }
    var indicatorFlash by remember { mutableIntStateOf(0) }
    var showsIndicator by remember { mutableStateOf(false) }
    val waitsForPlay = !autoplay && !started
    val shouldPlay = active && inForeground && !waitsForPlay
    // The tap handler outlives recompositions; it reads these fresh.
    val currentEdgeTap by rememberUpdatedState(onEdgeTap)
    val currentlyWaiting by rememberUpdatedState(waitsForPlay)

    fun makePlayer(): ExoPlayer {
        val client = model.client(account)
        val source = OkHttpDataSource.Factory(model.http).setDefaultRequestProperties(listOfNotNull(client.authorization?.let { "Authorization" to it }).toMap())
        return ExoPlayer.Builder(context).setMediaSourceFactory(DefaultMediaSourceFactory(source)).build().apply {
            setMediaItem(MediaItem.fromUri(client.mediaUrl(photo.id, Variant.VIDEO).toString()))
            repeatMode = Player.REPEAT_MODE_ONE
            setHandleAudioBecomingNoisy(true)
            addListener(object : Player.Listener {
                override fun onRenderedFirstFrame() { firstFrame = true }
            })
            prepare()
        }.also { player = it }
    }

    LaunchedEffect(active) { if (!active) started = false }
    // The standard controls are in charge while they're open.
    LaunchedEffect(shouldPlay, fullControls) {
        if (fullControls) return@LaunchedEffect
        if (shouldPlay) {
            val current = player ?: makePlayer()
            current.applySound(StorySound.muted)
            current.play()
            // Shows that the video is silent and a tap brings the sound.
            if (StorySound.muted) indicatorFlash++
        } else {
            // Paused, Media3 would keep the audio focus; hand it back like the iOS app does.
            player?.run { pause(); applySound(muted = true) }
        }
    }
    DisposableEffect(photo.id) { onDispose { player?.release() } }
    LaunchedEffect(player, shouldPlay) {
        val current = player ?: return@LaunchedEffect
        while (shouldPlay) {
            withFrameMillis {}
            val duration = current.duration
            if (duration > 0) progress.floatValue = (current.currentPosition.toFloat() / duration).coerceIn(0f, 1f)
        }
    }
    LaunchedEffect(indicatorFlash) {
        if (indicatorFlash == 0) return@LaunchedEffect
        showsIndicator = true
        delay(1200)
        showsIndicator = false
    }

    fun toggleSound() {
        StorySound.muted = !StorySound.muted
        player?.applySound(StorySound.muted)
        indicatorFlash++
    }
    fun openFullControls() {
        started = true
        val current = player ?: makePlayer()
        current.applySound(muted = false)
        current.play()
        fullControls = true
    }

    val soundLabel = stringResource(if (StorySound.muted) R.string.sound_on else R.string.sound_off)
    val playLabel = stringResource(R.string.play_video)
    val controlsLabel = stringResource(R.string.show_playback_controls)
    val ratio = if (photo.width > 0 && photo.height > 0) photo.width.toFloat() / photo.height else 16f / 9f

    Box(modifier, contentAlignment = Alignment.Center) {
        Box(
            Modifier.aspectRatio(ratio)
                .pointerInput(Unit) {
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        val up = waitForUpOrCancellation() ?: return@awaitEachGesture
                        up.consume()
                        val x = down.position.x / size.width
                        val edgeTap = currentEdgeTap
                        when {
                            edgeTap != null && x < 0.2f -> edgeTap(false)
                            edgeTap != null && x > 0.8f -> edgeTap(true)
                            currentlyWaiting -> started = true
                            else -> toggleSound()
                        }
                    }
                }
                .semantics {
                    customActions = listOf(
                        if (waitsForPlay) CustomAccessibilityAction(playLabel) { started = true; true }
                        else CustomAccessibilityAction(soundLabel) { toggleSound(); true },
                        CustomAccessibilityAction(controlsLabel) { openFullControls(); true },
                    )
                },
        ) {
            player?.let { current ->
                AndroidView(
                    factory = {
                        PlayerView(it).apply {
                            useController = false
                            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                            setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                        }
                    },
                    update = { it.player = if (fullControls) null else current },
                    onRelease = { it.player = null },
                    modifier = Modifier.fillMaxSize(),
                )
            }
            // The poster over the player's surface until its first frame: no black flash.
            if (!firstFrame) RemoteImage(account, photo, Variant.MEDIUM, Modifier.fillMaxSize(), ContentScale.Fit)

            if (waitsForPlay) {
                Icon(
                    Icons.Filled.PlayArrow, null,
                    Modifier.align(Alignment.Center).size(72.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).padding(16.dp),
                    tint = Color.White,
                )
            } else if (player != null && firstFrame) {
                Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(start = 10.dp, end = 10.dp, bottom = 8.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    StoryButton(Icons.Filled.Fullscreen, controlsLabel) { openFullControls() }
                    // Read while drawing only: the bar moves without recomposing.
                    Box(
                        Modifier.fillMaxWidth().height(3.dp).drawBehind {
                            val radius = CornerRadius(size.height / 2)
                            drawRoundRect(Color.White.copy(alpha = 0.3f), cornerRadius = radius)
                            drawRoundRect(Color.White.copy(alpha = 0.95f), size = Size(size.width * progress.floatValue, size.height), cornerRadius = radius)
                        },
                    )
                }
            }
            AnimatedVisibility(showsIndicator && !waitsForPlay, Modifier.align(Alignment.Center), enter = fadeIn() + scaleIn(initialScale = 0.8f), exit = fadeOut()) {
                Icon(
                    if (StorySound.muted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp, null,
                    Modifier.size(56.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).padding(14.dp),
                    tint = Color.White,
                )
            }
        }
    }

    val current = player
    if (fullControls && current != null) {
        Dialog({ fullControls = false }, DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
            Box(Modifier.fillMaxSize().background(Color.Black)) {
                AndroidView(
                    factory = {
                        PlayerView(it).apply {
                            setShowNextButton(false)
                            setShowPreviousButton(false)
                        }
                    },
                    update = { it.player = current },
                    onRelease = { it.player = null },
                    modifier = Modifier.fillMaxSize(),
                )
                Box(Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(8.dp)) {
                    StoryButton(Icons.Filled.Close, stringResource(R.string.close)) { fullControls = false }
                }
            }
        }
    }
}

/** Muted, without audio focus – other apps keep playing. With sound, the player asks for it. */
private fun ExoPlayer.applySound(muted: Boolean) {
    volume = if (muted) 0f else 1f
    val attributes = AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build()
    setAudioAttributes(attributes, !muted)
}
