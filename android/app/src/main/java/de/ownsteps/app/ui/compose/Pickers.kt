package de.ownsteps.app.ui.compose

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.compose.AsyncImage
import de.ownsteps.app.R
import de.ownsteps.app.data.TripCalendar
import de.ownsteps.app.media.Library
import de.ownsteps.app.media.LibraryItem
import de.ownsteps.app.media.MediaPreparation
import de.ownsteps.app.media.Place
import de.ownsteps.app.media.Places
import de.ownsteps.app.ui.Dates
import de.ownsteps.app.ui.Hint
import de.ownsteps.app.ui.ScreenScaffold
import de.ownsteps.app.ui.trip.MapLibreView
import kotlinx.coroutines.delay
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap

/**
 * The device's photos as a grid to pick from, newest first – optionally
 * grouped by day. Used by the composer's picker and the photo suggestions.
 */
@Composable
fun LibraryGrid(
    items: List<LibraryItem>,
    selected: List<Long>,
    onToggle: (LibraryItem) -> Unit,
    modifier: Modifier = Modifier,
    days: TripCalendar? = null,
    footer: (@Composable () -> Unit)? = null,
) {
    LazyVerticalGrid(GridCells.Adaptive(96.dp), modifier, contentPadding = PaddingValues(bottom = 24.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        val groups = if (days == null) listOf(null to items) else items.groupBy { days.localDate(it.takenAt) }.toList()
        for ((day, group) in groups) {
            if (day != null && days != null) {
                item(span = { GridItemSpan(maxLineSpan) }, key = day.toString()) {
                    Text(Dates.day(group.first().takenAt, days, withYear = true), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(12.dp, 16.dp, 12.dp, 6.dp))
                }
            }
            items(group, key = { it.id }) { item ->
                val position = selected.indexOf(item.id)
                Box(Modifier.aspectRatio(1f).clickable { onToggle(item) }) {
                    AsyncImage(item, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    if (item.isVideo) Icon(Icons.Filled.PlayCircle, null, Modifier.align(Alignment.BottomStart).padding(4.dp), tint = Color.White)
                    if (position >= 0) {
                        Box(Modifier.fillMaxSize().border(3.dp, MaterialTheme.colorScheme.primary))
                        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).size(24.dp)) {
                            Box(contentAlignment = Alignment.Center) {
                                Text("${position + 1}", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                }
            }
        }
        footer?.let { item(span = { GridItemSpan(maxLineSpan) }) { it() } }
    }
}

/** A full-screen dialog with a close button, a title and an optional action. */
@Composable
fun FullScreenDialog(
    title: String,
    onDismiss: () -> Unit,
    action: String? = null,
    actionEnabled: Boolean = true,
    onAction: () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    Dialog(onDismiss, DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        ScreenScaffold(
            title, onDismiss,
            actions = { if (action != null) TextButton(onClick = onAction, enabled = actionEnabled) { Text(action) } },
            content = content,
        )
    }
}

/**
 * Access to the device's library: asked for once on first use, again with
 * [request]. [version] changes with every answer – partial access (Android
 * 14+) may have changed which photos the app sees, so lists load again.
 */
class LibraryAccess(val granted: Boolean, val version: Int, val request: () -> Unit)

@Composable
fun rememberLibraryAccess(): LibraryAccess {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(Library.hasAccess(context)) }
    var version by remember { mutableIntStateOf(0) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        granted = Library.hasAccess(context)
        version++
    }
    LaunchedEffect(Unit) { if (!granted) ask.launch(Library.permissions) }
    return LibraryAccess(granted, version) { ask.launch(Library.permissions) }
}

/**
 * Picking photos and videos for a step. The app's own grid keeps the GPS
 * position in the files; without library access the system picker is the
 * fallback – it strips the position, so the place must be chosen by hand.
 */
@Composable
fun MediaPickerDialog(onDismiss: () -> Unit, onPicked: (List<MediaPreparation.Source>) -> Unit) {
    val context = LocalContext.current
    val access = rememberLibraryAccess()
    var items by remember { mutableStateOf<List<LibraryItem>>(emptyList()) }
    val selected = remember { mutableStateListOf<Long>() }
    val system = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
        if (uris.isNotEmpty()) onPicked(uris.map { MediaPreparation.Source(it) })
        onDismiss()
    }
    LaunchedEffect(access.granted, access.version) { if (access.granted) items = Library.items(context) }

    FullScreenDialog(
        title = stringResource(R.string.add_photos_or_videos),
        onDismiss = onDismiss,
        action = if (selected.isEmpty()) null else stringResource(R.string.add_n, selected.size),
        onAction = {
            onPicked(selected.mapNotNull { id -> items.firstOrNull { it.id == id }?.source })
            onDismiss()
        },
    ) { padding ->
        if (access.granted) {
            LibraryGrid(items, selected, { if (!selected.remove(it.id)) selected += it.id }, Modifier.padding(padding)) {
                if (Library.isPartial(context)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Hint(stringResource(R.string.limited_library))
                        OutlinedButton(onClick = access.request) { Text(stringResource(R.string.choose_more_photos)) }
                    }
                }
            }
        } else {
            Column(Modifier.padding(padding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(stringResource(R.string.library_access_needed))
                Button(onClick = access.request) { Text(stringResource(R.string.allow_access)) }
                OutlinedButton(onClick = { system.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) }) {
                    Text(stringResource(R.string.use_system_picker))
                }
                Hint(stringResource(R.string.system_picker_hint))
            }
        }
    }
}

/**
 * Picking a step's place by hand: move the map under the pin, or search
 * for a place and jump there (where the system has a geocoder).
 */
@Composable
fun LocationPickerDialog(initial: Pair<Double, Double>?, onDismiss: () -> Unit, onPick: (Double, Double, String?) -> Unit) {
    val context = LocalContext.current
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var center by remember { mutableStateOf(initial) }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Place>>(emptyList()) }
    /** The search result jumped to – its name is used while the pin stays there. */
    var chosen by remember { mutableStateOf<Place?>(null) }

    LaunchedEffect(query) {
        val text = query.trim()
        if (text.length < 2) {
            results = emptyList()
            return@LaunchedEffect
        }
        delay(300) // A pause in typing.
        results = Places.search(context, text)
    }

    FullScreenDialog(
        title = stringResource(R.string.choose_place),
        onDismiss = onDismiss,
        action = stringResource(R.string.done),
        actionEnabled = center != null,
        onAction = {
            center?.let { (lat, lon) -> onPick(lat, lon, chosen?.name) }
            onDismiss()
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            MapLibreView(Modifier.fillMaxSize(), ornamentsAtTop = false) { ready, _ ->
                initial?.let { (lat, lon) -> ready.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(lat, lon), 11.0)) }
                ready.addOnCameraIdleListener {
                    val target = ready.cameraPosition.target ?: return@addOnCameraIdleListener
                    center = target.latitude to target.longitude
                    // Moved away from the search result: no longer its name.
                    chosen?.let { if (target.distanceTo(LatLng(it.lat, it.lon)) > 200) chosen = null }
                }
                map = ready
            }
            Icon(
                Icons.Filled.Place, null, Modifier.align(Alignment.Center).offset(y = (-17).dp).size(40.dp),
                tint = MaterialTheme.colorScheme.error,
            )
            Column(Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(12.dp)) {
                Surface(shape = MaterialTheme.shapes.extraLarge, shadowElevation = 4.dp) {
                    OutlinedTextField(
                        query, { query = it }, Modifier.fillMaxWidth(),
                        placeholder = { Text(stringResource(R.string.search_place)) },
                        leadingIcon = { Icon(Icons.Filled.Search, null) },
                        singleLine = true,
                    )
                }
                if (results.isNotEmpty()) {
                    Surface(shape = MaterialTheme.shapes.large, shadowElevation = 4.dp, modifier = Modifier.padding(top = 4.dp)) {
                        LazyColumn {
                            items(results) { place ->
                                ListItem(
                                    headlineContent = { Text(place.name ?: "%.4f, %.4f".format(place.lat, place.lon)) },
                                    modifier = Modifier.clickable {
                                        chosen = place
                                        query = ""
                                        map?.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(place.lat, place.lon), 11.0))
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
