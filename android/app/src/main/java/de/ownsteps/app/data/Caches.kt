package de.ownsteps.app.data

import de.ownsteps.app.api.ApiError
import de.ownsteps.app.api.ApiJson
import de.ownsteps.app.api.Photo
import de.ownsteps.app.api.ServerClient
import de.ownsteps.app.api.Trip
import de.ownsteps.app.api.TripDetail
import de.ownsteps.app.api.Variant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/** Something read from the device's copy, with when the server last sent it. */
data class Cached<T>(val value: T, val fetchedAt: Long)

/**
 * What the app has seen of each server, so trips stay readable offline
 * ([D22]). Responses are stored as JSON, keyed by account and trip.
 */
class TripCache(private val dao: CacheDao) {
    suspend fun saveTrips(accountId: String, trips: List<Trip>) =
        dao.put(CachedTripList(accountId, ApiJson.encodeToString(trips), System.currentTimeMillis()))

    suspend fun trips(accountId: String): Cached<List<Trip>>? =
        dao.tripList(accountId)?.let { decode(it.json, it.fetchedAt) }

    suspend fun saveTrip(accountId: String, trip: TripDetail) =
        dao.put(CachedTrip(accountId, trip.id, ApiJson.encodeToString(TripDetail.serializer(), trip), System.currentTimeMillis()))

    suspend fun trip(accountId: String, tripId: Long): Cached<TripDetail>? =
        dao.trip(accountId, tripId)?.let { decode(it.json, it.fetchedAt) }

    suspend fun removeTrip(accountId: String, tripId: Long) = dao.removeTrip(accountId, tripId)

    suspend fun removeAll(accountId: String) = dao.removeAll(accountId)

    /** An entry an older app version wrote in a shape this one can't read counts as missing. */
    private inline fun <reified T> decode(json: String, fetchedAt: Long): Cached<T>? =
        runCatching { Cached(ApiJson.decodeFromString<T>(json), fetchedAt) }.getOrNull()
}

/**
 * Photos, loaded with the account's token and kept on disk. Files are named
 * after the photo's `fileKey`, which is new with every upload, so a file on
 * disk is valid forever – even if a restored server hands out the same
 * photo ID again. These files are the cache: nothing goes to OkHttp's.
 */
class PhotoCache(private val directory: File, private val http: OkHttpClient) {
    private val inFlight = ConcurrentHashMap<String, CompletableDeferred<File>>()

    fun file(accountId: String, photo: Photo, variant: Variant) =
        File(directory, "$accountId/${photo.id}-${photo.fileKey}-${variant.path}.webp")

    /** Only what's already on the device – for offline fallbacks. */
    fun cached(accountId: String, photo: Photo, variant: Variant): File? =
        file(accountId, photo, variant).takeIf(File::exists)

    /** From disk, or from the server; parallel requests for one file share a download. */
    suspend fun get(accountId: String, client: ServerClient, photo: Photo, variant: Variant): File {
        val file = file(accountId, photo, variant)
        if (file.exists()) return file
        val mine = CompletableDeferred<File>()
        val running = inFlight.putIfAbsent(file.path, mine)
        if (running != null) return running.await()
        try {
            download(client, photo, variant, file)
            mine.complete(file)
        } catch (error: Throwable) {
            mine.completeExceptionally(error)
            throw error
        } finally {
            inFlight.remove(file.path)
        }
        return file
    }

    private suspend fun download(client: ServerClient, photo: Photo, variant: Variant, file: File) = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(client.mediaUrl(photo.id, variant))
            .apply { client.authorization?.let { header("Authorization", it) } }
            .build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw ApiError.Unexpected(response.code)
            file.parentFile?.mkdirs()
            // Written aside and moved, so a cut-off download never looks complete.
            val partial = File(file.path + ".part")
            partial.outputStream().use { response.body.byteStream().copyTo(it) }
            partial.renameTo(file)
        }
    }

    fun removeAll(accountId: String) {
        File(directory, accountId).deleteRecursively()
    }
}
