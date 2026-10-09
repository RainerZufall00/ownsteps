package de.ownsteps.app.media

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale
import kotlin.coroutines.resume

/** A position with the name to show for it, if one is known. */
data class Place(val lat: Double, val lon: Double, val name: String?)

/**
 * "My location" and place names, from Google Play Services' fused location
 * and the system geocoder. Offline, names stay empty – the server names the
 * place from the position then.
 */
object Places {
    enum class Problem { DENIED, UNAVAILABLE }

    class Failed(val problem: Problem) : Exception(problem.name)

    val permissions = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)

    fun hasPermission(context: Context) = permissions.any {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

    /** Where the phone is now – a fresh fix, or one at most a minute old. */
    @SuppressLint("MissingPermission")
    suspend fun current(context: Context): Location {
        if (!hasPermission(context)) throw Failed(Problem.DENIED)
        val request = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setMaxUpdateAgeMillis(60_000)
            .setDurationMillis(30_000)
            .build()
        val cancel = CancellationTokenSource()
        return try {
            LocationServices.getFusedLocationProviderClient(context).getCurrentLocation(request, cancel.token).await()
        } catch (_: Exception) {
            null
        } finally {
            cancel.cancel()
        } ?: throw Failed(Problem.UNAVAILABLE)
    }

    /** "Bergen, Vestland" – like the server's place names. */
    @Suppress("DEPRECATION")
    suspend fun name(context: Context, lat: Double, lon: Double): String? = geocode(
        context,
        modern = { geocoder, listener -> geocoder.getFromLocation(lat, lon, 1, listener) },
        legacy = { it.getFromLocation(lat, lon, 1) },
    )?.firstOrNull()?.let(::label)

    /** Places matching a search, for picking one on the map. */
    @Suppress("DEPRECATION")
    suspend fun search(context: Context, query: String): List<Place> = geocode(
        context,
        modern = { geocoder, listener -> geocoder.getFromLocationName(query, 8, listener) },
        legacy = { it.getFromLocationName(query, 8) },
    ).orEmpty()
        .filter { it.hasLatitude() && it.hasLongitude() }
        .map { Place(it.latitude, it.longitude, it.featureName?.takeUnless { name -> name.all(Char::isDigit) } ?: label(it)) }

    private fun label(address: Address): String? =
        listOfNotNull(address.locality ?: address.subAdminArea, address.adminArea ?: address.countryName)
            .distinct().joinToString(", ").ifEmpty { null }

    /** The asynchronous geocoder of Android 13+, or the blocking one before, with a time limit. */
    private suspend fun geocode(
        context: Context,
        modern: (Geocoder, Geocoder.GeocodeListener) -> Unit,
        legacy: (Geocoder) -> List<Address>?,
    ): List<Address>? {
        if (!Geocoder.isPresent()) return null
        val geocoder = Geocoder(context, Locale.getDefault())
        return withTimeoutOrNull(10_000) {
            if (Build.VERSION.SDK_INT >= 33) {
                suspendCancellableCoroutine { continuation ->
                    modern(geocoder, object : Geocoder.GeocodeListener {
                        override fun onGeocode(addresses: MutableList<Address>) = continuation.resume(addresses)
                        override fun onError(message: String?) = continuation.resume(null)
                    })
                }
            } else {
                withContext(Dispatchers.IO) { runCatching { legacy(geocoder) }.getOrNull() }
            }
        }
    }
}
