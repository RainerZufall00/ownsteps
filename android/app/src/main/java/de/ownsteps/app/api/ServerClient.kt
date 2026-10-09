package de.ownsteps.app.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.File
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** What can go wrong talking to a server, reduced to what the app needs to decide what to show. */
sealed class ApiError : Exception() {
    /** The problem document's `code`, if the server sent one. */
    open val code: String? get() = null

    /** The server answered with a problem document; `code` is stable ([D12]). */
    data class Problem(override val code: String, val status: Int) : ApiError()
    /** The address answers, but not like an OwnSteps server. */
    data object NotOwnSteps : ApiError()
    /** The server is older than this app supports, or the other way round. */
    data class Incompatible(val serverVersion: String) : ApiError()
    data class Unexpected(val status: Int) : ApiError()

    /** The token is gone or revoked – the account needs signing in again. */
    val isUnauthorized: Boolean get() = (this as? Problem)?.status == 401

    companion object {
        fun from(status: Int, body: String?): ApiError =
            body?.let { runCatching { ApiJson.decodeFromString<ProblemBody>(it) }.getOrNull() }
                ?.let { Problem(it.code, status) } ?: Unexpected(status)
    }
}

/**
 * One OwnSteps server, reached with an author's device token, a reader's
 * viewer token, or none (before signing in). Every endpoint is a line here;
 * the plumbing – auth header, JSON, problem documents – lives in [call].
 */
class ServerClient(val baseUrl: HttpUrl, private val token: String?, private val http: OkHttpClient) {

    // Server info and signing in

    /** Checks the address really is an OwnSteps server this app can talk to. */
    suspend fun info(appVersion: String): Info {
        val info = try {
            call("GET", "info", Info.serializer())
        } catch (error: IOException) {
            // Unreachable, unknown host, TLS trouble: say so, not "wrong server".
            throw error
        } catch (_: Exception) {
            // A web page, a 404, JSON that isn't ours.
            throw ApiError.NotOwnSteps
        }
        if (info.apiVersion != 1 || AppVersion(appVersion) < AppVersion(info.minAppVersion)) {
            throw ApiError.Incompatible(info.version)
        }
        return info
    }

    suspend fun signIn(email: String, password: String, deviceName: String) =
        call("POST", "auth/token", AuthorToken.serializer(), json(TokenRequest(email, password, deviceName)))

    /** The page the browser opens for OIDC; it ends at `ownsteps://auth`. */
    fun oidcStartUrl(pkce: Pkce, state: String, deviceName: String): HttpUrl =
        api("auth/oidc/start").newBuilder()
            .addQueryParameter("code_challenge", pkce.challenge)
            .addQueryParameter("state", state)
            .addQueryParameter("device_name", deviceName)
            .build()

    suspend fun exchange(code: String, pkce: Pkce) =
        call("POST", "auth/oidc/exchange", AuthorToken.serializer(), json(OidcExchange(code, pkce.verifier)))

    /** Signs this device out on the server; the token stops working. */
    suspend fun signOut() = send("DELETE", "auth/token")

    // Trips

    suspend fun trips(): List<Trip> = call("GET", "trips", Page.serializer(Trip.serializer())).items

    /** A trip with its published steps, oldest first. */
    suspend fun trip(id: Long) = call("GET", "trips/$id", TripDetail.serializer())

    suspend fun createTrip(fields: TripFields) = call("POST", "trips", Trip.serializer(), json(fields))

    /** Fields left `null` keep their value; an empty string clears a text or date. */
    suspend fun updateTrip(id: Long, fields: TripFields) = call("PATCH", "trips/$id", Trip.serializer(), json(fields))

    suspend fun deleteTrip(id: Long) = send("DELETE", "trips/$id")

    /** Uploads a prepared JPEG as cover and returns the photo's ID. */
    suspend fun uploadCover(tripId: Long, jpeg: File): Long =
        call("POST", "trips/$tripId/cover", Created.serializer(), multipart { addFile("file", jpeg, "image/jpeg") }).id

    // Steps, photos, comments

    /** Idempotent through `clientUuid`: a retry returns the step created the first time ([D19]). */
    suspend fun createStep(
        tripId: Long,
        clientUuid: String,
        body: String,
        placeName: String?,
        lat: Double?,
        lon: Double?,
        occurredAt: java.time.Instant,
        publish: Boolean,
    ) = call(
        "POST", "trips/$tripId/steps", Step.serializer(),
        json(StepCreate(clientUuid, body, placeName, lat, lon, occurredAt, publish)),
    )

    suspend fun updateStep(id: Long, patch: StepPatch) = call("PATCH", "steps/$id", Step.serializer(), json(patch))

    suspend fun deleteStep(id: Long) = send("DELETE", "steps/$id")

    /** One photo or video; the upload queue builds [body]. Returns the new photo's ID. */
    suspend fun uploadMedia(stepId: Long, body: RequestBody): Long =
        call("POST", "steps/$stepId/media", CreatedMedia.serializer(), body).photo.id

    /** An empty caption removes it. */
    suspend fun updateCaption(photoId: Long, caption: String) =
        call("PATCH", "photos/$photoId", Photo.serializer(), json(PhotoPatch(caption)))

    suspend fun deletePhoto(id: Long) = send("DELETE", "photos/$id")

    /** Authors comment under their account name, readers under theirs. */
    suspend fun comment(stepId: Long, body: String) =
        call("POST", "steps/$stepId/comments", Comment.serializer(), json(CommentCreate(body)))

    suspend fun deleteComment(id: Long) = send("DELETE", "comments/$id")

    /** Steps a reader looked at ([D28]); the server ignores authors. */
    suspend fun recordViews(tripId: Long, stepIds: List<Long>) = send("POST", "trips/$tripId/views", json(StepViews(stepIds)))

    // Readers ([D17])

    suspend fun redeem(shareLink: String, password: String?, name: String, deviceName: String) =
        call("POST", "viewers/redeem", ViewerToken.serializer(), json(Redeem(shareLink, password, name, deviceName)))

    /** With a viewer token: forget this device on the server. */
    suspend fun unfollow() = send("DELETE", "viewers/me")

    suspend fun viewers(tripId: Long) = call("GET", "trips/$tripId/viewers", Page.serializer(Viewer.serializer())).items

    suspend fun removeViewer(id: Long) = send("DELETE", "viewers/$id")

    suspend fun removeAllViewers(tripId: Long) = send("DELETE", "trips/$tripId/viewers")

    // Changes ([D16])

    /** Changes after [cursor]; without one, only the current cursor. */
    suspend fun changes(cursor: Long?) =
        call("GET", "changes" + (cursor?.let { "?since=$it" } ?: ""), ChangeFeed.serializer())

    // Keeping a trip

    /** Streams the offline album (a ZIP) into [directory] under the server's file name. */
    suspend fun downloadAlbum(tripId: Long, directory: File): File = withContext(Dispatchers.IO) {
        execute(request("GET", "trips/$tripId/export")).use { response ->
            if (!response.isSuccessful) throw ApiError.from(response.code, response.body.string())
            val name = response.header("Content-Disposition")
                ?.substringAfter("filename=", "")?.trim('"', ' ')?.takeIf { it.isNotEmpty() && !it.contains('/') }
                ?: "trip-$tripId.zip"
            directory.mkdirs()
            File(directory, name).also { file -> file.outputStream().use { response.body.byteStream().copyTo(it) } }
        }
    }

    suspend fun immichStatus(tripId: Long) = call("GET", "trips/$tripId/immich", ImmichStatus.serializer())

    suspend fun startImmichExport(tripId: Long) = call("POST", "trips/$tripId/immich", ImmichStatus.serializer())

    suspend fun immichConnection() = call("GET", "me/immich", ImmichConnection.serializer())

    suspend fun connectImmich(url: String, apiKey: String) =
        call("PUT", "me/immich", ImmichConnection.serializer(), json(ImmichConnect(url, apiKey)))

    suspend fun disconnectImmich() = send("DELETE", "me/immich")

    // Media files

    /** Where a photo's file lives; loaded with [authorization]. */
    fun mediaUrl(photoId: Long, variant: Variant): HttpUrl = api("photos/$photoId/${variant.path}")

    val authorization: String? get() = token?.let { "Bearer $it" }

    // Plumbing

    private fun api(path: String): HttpUrl = baseUrl.resolve("api/v1/$path")!!

    private fun request(method: String, path: String, body: RequestBody? = null): Request =
        Request.Builder().url(api(path)).method(method, body).apply {
            authorization?.let { header("Authorization", it) }
            header("Accept", "application/json")
        }.build()

    private suspend fun <T> call(method: String, path: String, out: KSerializer<T>, body: RequestBody? = null): T =
        ApiJson.decodeFromString(out, fetch(method, path, body))

    /** For endpoints that answer 204. */
    private suspend fun send(method: String, path: String, body: RequestBody? = null) {
        fetch(method, path, body)
    }

    /** The body of a successful answer; failures become [ApiError]s. */
    private suspend fun fetch(method: String, path: String, body: RequestBody? = null): String {
        val response = execute(request(method, path, body))
        return withContext(Dispatchers.IO) {
            response.use {
                val text = it.body.string()
                if (!it.isSuccessful) throw ApiError.from(it.code, text)
                text
            }
        }
    }

    private suspend fun execute(request: Request): Response = suspendCancellableCoroutine { continuation ->
        val call = http.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) = continuation.resume(response) { _, _, _ -> response.close() }
            override fun onFailure(call: Call, e: IOException) = continuation.resumeWithException(e)
        })
    }

    private inline fun <reified T> json(value: T): RequestBody =
        ApiJson.encodeToString(value).toRequestBody(JSON)

    private fun multipart(build: MultipartBody.Builder.() -> Unit): RequestBody =
        MultipartBody.Builder().setType(MultipartBody.FORM).apply(build).build()

    companion object {
        private val JSON = "application/json".toMediaType()
    }
}

/** A file part, streamed from disk – a 400 MB video never passes through memory. */
fun MultipartBody.Builder.addFile(name: String, file: File, mime: String): MultipartBody.Builder =
    addFormDataPart(name, file.name, file.asRequestBody(mime.toMediaType()))
