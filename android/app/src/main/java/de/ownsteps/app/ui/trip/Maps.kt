package de.ownsteps.app.ui.trip

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Shader
import android.view.Gravity
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.graphics.createBitmap
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import coil3.imageLoader
import coil3.request.ImageRequest
import coil3.request.allowHardware
import coil3.toBitmap
import de.ownsteps.app.ServerPhoto
import de.ownsteps.app.api.Step
import de.ownsteps.app.api.Variant
import de.ownsteps.app.data.Account
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point

/**
 * OpenFreeMap: no key, no account, no cost for whoever hosts OwnSteps – the
 * counterpart of Apple's map on iOS ([D8], [D24]).
 */
private const val STYLE_URL = "https://tiles.openfreemap.org/styles/liberty"

/** MapLibre in Compose: its lifecycle follows the screen's; [onReady] runs once the style is loaded. */
@Composable
fun MapLibreView(modifier: Modifier = Modifier, ornamentsAtTop: Boolean = true, onReady: (MapLibreMap, Style) -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val ready by rememberUpdatedState(onReady)
    val mapView = remember {
        MapView(context).apply {
            onCreate(null)
            getMapAsync { map ->
                map.uiSettings.isRotateGesturesEnabled = false
                map.uiSettings.isTiltGesturesEnabled = false
                // Logo and attribution (required by OpenStreetMap) where nothing covers them.
                val margin = (8 * resources.displayMetrics.density).toInt()
                val edge = if (ornamentsAtTop) Gravity.TOP else Gravity.BOTTOM
                map.uiSettings.logoGravity = edge or Gravity.END
                map.uiSettings.attributionGravity = edge or Gravity.END
                map.uiSettings.setLogoMargins(0, margin, margin * 4, margin)
                map.uiSettings.setAttributionMargins(0, margin, margin, margin)
                map.setStyle(Style.Builder().fromUri(STYLE_URL)) { style -> ready(map, style) }
            }
        }
    }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) mapView.onPause()
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) mapView.onStop()
            mapView.onDestroy()
        }
    }
    AndroidView({ mapView }, modifier)
}

/** Where the trip map should look; [version] makes asking twice for the same thing move it again. */
data class CameraRequest(val stepId: Long? = null, val version: Int = 0)

/**
 * The route: a line through the steps in the order they happened, a round
 * photo marker per step. A tapped marker reports its step; [camera] moves
 * the map to a step or the whole route. [padding] keeps both clear of what
 * covers the map.
 */
@Composable
fun TripMap(
    account: Account,
    steps: List<Step>,
    selectedStepId: Long?,
    camera: CameraRequest,
    padding: PaddingValues,
    onSelect: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val direction = LocalLayoutDirection.current
    val select by rememberUpdatedState(onSelect)
    var ready by remember { mutableStateOf<Pair<MapLibreMap, Style>?>(null) }
    /** Step → photo whose marker image is in the style already. */
    val markerPhotos = remember { mutableMapOf<Long, Long>() }
    val located = steps.filter { it.hasPlace }

    MapLibreView(modifier) { map, style ->
        style.addSource(GeoJsonSource(ROUTE))
        style.addSource(GeoJsonSource(MARKERS))
        // A dark casing carries the white line over bright terrain.
        style.addLayer(LineLayer("$ROUTE-casing", ROUTE).withProperties(
            PropertyFactory.lineColor("rgba(0,0,0,0.35)"), PropertyFactory.lineWidth(7f),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND), PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
        ))
        style.addLayer(LineLayer(ROUTE, ROUTE).withProperties(
            PropertyFactory.lineColor("#ffffff"), PropertyFactory.lineWidth(3.5f),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND), PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
        ))
        style.addLayer(SymbolLayer(MARKERS, MARKERS).withProperties(
            PropertyFactory.iconImage(Expression.get("icon")),
            PropertyFactory.iconSize(Expression.switchCase(Expression.get("selected"), Expression.literal(1.35f), Expression.literal(1f))),
            PropertyFactory.iconAllowOverlap(true),
            PropertyFactory.iconIgnorePlacement(true),
            PropertyFactory.symbolSortKey(Expression.get("order")),
        ))
        map.addOnMapClickListener { point ->
            val feature = map.queryRenderedFeatures(map.projection.toScreenLocation(point), MARKERS).firstOrNull()
            feature?.getNumberProperty("id")?.toLong()?.also(select) != null
        }
        ready = map to style
    }

    // Line and markers; marker images start as numbers, photos replace them once loaded.
    LaunchedEffect(ready, located, selectedStepId) {
        val (_, style) = ready ?: return@LaunchedEffect
        located.forEachIndexed { index, step ->
            if (style.getImage(icon(step)) == null) style.addImage(icon(step), numberMarker(index + 1, density.density))
        }
        // A line needs two points.
        val route = located.map { Point.fromLngLat(it.lon!!, it.lat!!) }
        style.getSourceAs<GeoJsonSource>(ROUTE)?.setGeoJson(
            if (route.size > 1) FeatureCollection.fromFeature(Feature.fromGeometry(LineString.fromLngLats(route))) else FeatureCollection.fromFeatures(emptyList()),
        )
        style.getSourceAs<GeoJsonSource>(MARKERS)?.setGeoJson(FeatureCollection.fromFeatures(located.mapIndexed { index, step ->
            Feature.fromGeometry(Point.fromLngLat(step.lon!!, step.lat!!)).apply {
                addNumberProperty("id", step.id)
                addStringProperty("icon", icon(step))
                addBooleanProperty("selected", step.id == selectedStepId)
                addNumberProperty("order", if (step.id == selectedStepId) Int.MAX_VALUE else index)
            }
        }))
        for (step in located) {
            val photo = step.photos.firstOrNull() ?: continue
            if (markerPhotos[step.id] == photo.id) continue
            val request = ImageRequest.Builder(context).data(ServerPhoto(account, photo, Variant.THUMB)).size(MARKER_PX).allowHardware(false).build()
            val image = context.imageLoader.execute(request).image ?: continue
            style.addImage(icon(step), photoMarker(image.toBitmap(), density.density))
            markerPhotos[step.id] = photo.id
        }
    }

    LaunchedEffect(ready, camera) {
        val (map, _) = ready ?: return@LaunchedEffect
        val (left, top, right, bottom) = with(density) {
            listOf(padding.calculateLeftPadding(direction), padding.calculateTopPadding(), padding.calculateRightPadding(direction), padding.calculateBottomPadding())
                .map { (it + 24.dp).roundToPx() }
        }
        val step = located.firstOrNull { it.id == camera.stepId }
        val update = if (step != null) {
            // Close enough to see the place, far enough to see where it lies.
            CameraUpdateFactory.newCameraPosition(
                CameraPosition.Builder().target(LatLng(step.lat!!, step.lon!!)).zoom(9.0)
                    .padding(left.toDouble(), top.toDouble(), right.toDouble(), bottom.toDouble()).build(),
            )
        } else {
            overview(located)?.let { CameraUpdateFactory.newLatLngBounds(it, left, top, right, bottom) } ?: return@LaunchedEffect
        }
        map.animateCamera(update, 900)
    }
}

/** The whole route – but never closer than a region, or a trip with one step would show rooftops. */
private fun overview(steps: List<Step>): LatLngBounds? {
    if (steps.isEmpty()) return null
    val lats = steps.map { it.lat!! }
    val lons = steps.map { it.lon!! }
    val (centerLat, centerLon) = (lats.min() + lats.max()) / 2 to (lons.min() + lons.max()) / 2
    val halfLat = maxOf((lats.max() - lats.min()) / 2, 0.25)
    val halfLon = maxOf((lons.max() - lons.min()) / 2, 0.25)
    return LatLngBounds.from(centerLat + halfLat, centerLon + halfLon, centerLat - halfLat, centerLon - halfLon)
}

private const val ROUTE = "route"
private const val MARKERS = "markers"
private const val MARKER_PX = 128

private fun icon(step: Step) = "step-${step.id}"

/** A round photo with a white ring, like on the web. */
private fun photoMarker(photo: Bitmap, density: Float): Bitmap = marker(density) { canvas, size, ring ->
    val scale = size / minOf(photo.width, photo.height).toFloat()
    val shader = BitmapShader(photo, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
        setLocalMatrix(android.graphics.Matrix().apply {
            setScale(scale, scale)
            postTranslate((size - photo.width * scale) / 2, (size - photo.height * scale) / 2)
        })
    }
    canvas.drawCircle(size / 2, size / 2, size / 2 - ring, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader })
}

/** A step without photos: its number on a dark disc. */
private fun numberMarker(number: Int, density: Float): Bitmap = marker(density) { canvas, size, ring ->
    canvas.drawCircle(size / 2, size / 2, size / 2 - ring, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF29261F.toInt() })
    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        textSize = size * 0.36f
        textAlign = Paint.Align.CENTER
        isFakeBoldText = true
    }
    canvas.drawText(number.toString(), size / 2, size / 2 - (text.descent() + text.ascent()) / 2, text)
}

private fun marker(density: Float, sizeDp: Dp = 44.dp, draw: (Canvas, Float, Float) -> Unit): Bitmap {
    val size = sizeDp.value * density
    val ring = 3 * density
    return createBitmap(size.toInt(), size.toInt()).also { bitmap ->
        val canvas = Canvas(bitmap)
        canvas.drawCircle(size / 2, size / 2, size / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE })
        draw(canvas, size, ring)
    }
}
