package de.ownsteps.app.ui

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.core.graphics.createBitmap
import androidx.core.graphics.set
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Photo
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import coil3.compose.AsyncImage
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import de.ownsteps.app.R
import de.ownsteps.app.ServerPhoto
import de.ownsteps.app.api.Photo
import de.ownsteps.app.api.Share
import de.ownsteps.app.api.Trip
import de.ownsteps.app.api.Variant
import de.ownsteps.app.data.Account
import de.ownsteps.app.data.TripCalendar
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.io.File
import java.time.Instant
import kotlin.math.abs

/**
 * A photo from the server: the tiny blur-up placeholder right away, the real
 * image once it's on the device (see [ServerPhoto]).
 */
@Composable
fun RemoteImage(
    account: Account,
    photo: Photo,
    variant: Variant,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    fallbacks: List<Variant> = emptyList(),
) {
    val placeholder = remember(photo.placeholder) { placeholderBitmap(photo.placeholder) }
    Box(modifier) {
        placeholder?.let {
            Image(it.asImageBitmap(), null, Modifier.fillMaxSize().blur(8.dp), contentScale = contentScale, filterQuality = FilterQuality.Low)
        }
        AsyncImage(
            model = ServerPhoto(account, photo, variant, fallbacks),
            contentDescription = photo.caption,
            modifier = Modifier.fillMaxSize(),
            contentScale = contentScale,
        )
    }
}

/** The server's placeholder: a ~20 px JPEG as data URI. */
private fun placeholderBitmap(dataUri: String?): Bitmap? = dataUri?.substringAfter(",", "")?.takeIf { it.isNotEmpty() }?.let {
    runCatching { Base64.decode(it, Base64.DEFAULT).let { bytes -> BitmapFactory.decodeByteArray(bytes, 0, bytes.size) } }.getOrNull()
}

/** The trip's cover, or a calm gradient picked by the trip when it has none. */
@Composable
fun TripCover(account: Account, trip: Trip, variant: Variant, modifier: Modifier = Modifier, iconSize: Dp = 54.dp) {
    val cover = trip.cover
    if (cover != null) RemoteImage(account, cover, variant, modifier) else CoverPlaceholder(trip.id, modifier, iconSize)
}

private val palettes = listOf(
    Color(0xFF2973A0) to Color(0xFF173866),
    Color(0xFFED7D54) to Color(0xFFB33D52),
    Color(0xFF4D8C6B) to Color(0xFF1F4D4D),
    Color(0xFF7D66B8) to Color(0xFF3B2E73),
)

@Composable
fun CoverPlaceholder(seed: Long, modifier: Modifier = Modifier, iconSize: Dp = 54.dp) {
    val (from, to) = palettes[(abs(seed) % palettes.size).toInt()]
    Box(modifier.background(Brush.linearGradient(listOf(from, to))), contentAlignment = Alignment.Center) {
        if (iconSize > 0.dp) Icon(Icons.Filled.Map, null, Modifier.size(iconSize), tint = Color.White.copy(alpha = 0.22f))
    }
}

/** "Offline · as of …" under content that couldn't be refreshed. */
@Composable
fun OfflineNote(fetchedAt: Long, modifier: Modifier = Modifier) {
    IconLabel(Icons.Outlined.CloudOff, stringResource(R.string.offline_as_of, Dates.relative(Instant.ofEpochMilli(fetchedAt))), modifier)
}

@Composable
fun IconLabel(icon: ImageVector, text: String, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(16.dp), tint = color)
        Text(text, style = MaterialTheme.typography.labelMedium, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** "Day 3 · Tuesday, 12 May" */
@Composable
fun DayLine(day: Int?, date: Instant, calendar: TripCalendar, modifier: Modifier = Modifier, withYear: Boolean = false, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (day != null) {
            Text(stringResource(R.string.day_n, day), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
            Text("·", color = color, style = MaterialTheme.typography.labelLarge)
        }
        Text(Dates.day(date, calendar, withYear), color = color, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** How a step card starts: day line, then the place. */
@Composable
fun StepTitle(day: Int?, date: Instant, calendar: TripCalendar, place: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        DayLine(day, date, calendar)
        place?.let { Text(it, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
    }
}

/** Photos, comments and – for authors – readers, as small symbols. */
@Composable
fun StepCounts(photos: Int, comments: Int, views: Int?) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        if (photos > 0) IconLabel(Icons.Outlined.Photo, "$photos")
        if (comments > 0) IconLabel(Icons.Outlined.ChatBubbleOutline, "$comments")
        if (views != null) IconLabel(Icons.Outlined.Visibility, "$views")
    }
}

/** "12 steps · 80 photos" */
@Composable
fun tripCounts(trip: Trip): String =
    pluralStringResource(R.plurals.steps, trip.stepCount, trip.stepCount) + " · " +
        pluralStringResource(R.plurals.photos, trip.photoCount, trip.photoCount)

/** A QR code, drawn sharp at any size. */
@Composable
fun QrCode(text: String, modifier: Modifier = Modifier) {
    val bitmap = remember(text) {
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0)
        createBitmap(matrix.width, matrix.height, Bitmap.Config.RGB_565).apply {
            for (x in 0 until width) for (y in 0 until height) this[x, y] = if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE
        }
    }
    Image(bitmap.asImageBitmap(), stringResource(R.string.qr_code), modifier.background(Color.White).padding(8.dp), filterQuality = FilterQuality.None)
}

/** Yes/no before something that can't be undone. */
@Composable
fun ConfirmDialog(
    title: String,
    text: String?,
    confirm: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    enabled: Boolean = true,
    content: @Composable (() -> Unit)? = null,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                text?.let { Text(it) }
                content?.invoke()
            }
        },
        confirmButton = {
            TextButton(onClick = { onDismiss(); onConfirm() }, enabled = enabled) {
                Text(confirm, color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}

/**
 * Something the user started that talks to a server: busy while it runs,
 * the error in words if it fails. Every form uses it instead of its own
 * flags and try/catch.
 */
class Action(private val scope: CoroutineScope, private val context: Context) {
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)

    fun run(onSuccess: () -> Unit = {}, block: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                block()
                onSuccess()
            } catch (failure: kotlin.coroutines.cancellation.CancellationException) {
                throw failure
            } catch (failure: Exception) {
                error = ErrorText.message(context, failure)
            } finally {
                busy = false
            }
        }
    }
}

@Composable
fun rememberAction(): Action {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    return remember { Action(scope, context) }
}

/**
 * A screen of its own: close (or back) on the left, actions on the right.
 * Forms, pickers and lists all stand on it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScreenScaffold(
    title: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    back: Boolean = false,
    actions: @Composable RowScope.() -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        if (back) Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back))
                        else Icon(Icons.Filled.Close, stringResource(R.string.close))
                    }
                },
                actions = actions,
            )
        },
        bottomBar = bottomBar,
        content = content,
    )
}

/**
 * A form: the confirming action on the right, the fields in a readable
 * column below. Every form in the app is one.
 */
@Composable
fun FormScreen(
    title: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    confirm: String? = null,
    confirmEnabled: Boolean = true,
    busy: Boolean = false,
    onConfirm: () -> Unit = {},
    back: Boolean = false,
    error: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    ScreenScaffold(
        title, onClose, modifier, back,
        actions = {
            if (busy) CircularProgressIndicator(Modifier.padding(horizontal = 16.dp).size(24.dp), strokeWidth = 2.dp)
            else if (confirm != null) TextButton(onClick = onConfirm, enabled = confirmEnabled) { Text(confirm, fontWeight = FontWeight.SemiBold) }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding).imePadding(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 600.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                error?.let { ErrorMessage(it) }
                content()
            }
        }
    }
}

@Composable
fun ErrorMessage(text: String) {
    Text(text, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
}

/** A short explanation under a group of fields. */
@Composable
fun Hint(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 8.dp))
}

/** The system share sheet with a link – a trip's or a step's ([D22]). */
fun Context.shareLink(url: String, subject: String? = null, message: String? = null) {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain")
        .putExtra(Intent.EXTRA_TEXT, listOfNotNull(message, url).joinToString("\n"))
        .putExtra(Intent.EXTRA_SUBJECT, subject)
    startActivity(Intent.createChooser(send, null))
}

/** The share sheet with a file from the cache, e.g. the offline album. */
fun Context.shareFile(file: File, mime: String) {
    val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
    val send = Intent(Intent.ACTION_SEND).setType(mime)
        .putExtra(Intent.EXTRA_STREAM, uri)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    startActivity(Intent.createChooser(send, null))
}

/**
 * The trip's share link, or that link pointing at one step – the web jumps
 * there via `#step-<id>`. Null while sharing is off.
 */
fun Share?.link(stepId: Long? = null): String? =
    this?.takeIf { it.enabled }?.url?.let { url -> stepId?.let { "$url#step-$it" } ?: url }
