package de.ownsteps.app.data

import de.ownsteps.app.api.ApiError
import de.ownsteps.app.api.ServerClient
import de.ownsteps.app.api.addFile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.MediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okio.Buffer
import okio.BufferedSink
import okio.ForwardingSink
import okio.buffer
import java.io.File
import java.time.Instant
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.min
import kotlin.math.pow

/** A photo or video ready for the queue: files in the cache folder, plus what was read from them. */
data class PreparedMedia(
    /** JPEG, or the (compressed) video. */
    val file: File,
    val mime: String,
    /** Videos only: the poster frame as JPEG. */
    val poster: File? = null,
    /** A small JPEG shown until the server has the photo. */
    val thumbnail: File? = null,
    val durationMs: Long? = null,
    /** The media store item, for photo suggestions ([D22]). */
    val assetId: String? = null,
    val takenAt: Instant? = null,
    val lat: Double? = null,
    val lon: Double? = null,
) {
    val isVideo get() = mime.startsWith("video/")
    val hasPlace get() = lat != null && lon != null

    /** Deletes the files again, e.g. when the user cancels. */
    fun discard() = listOfNotNull(file, poster, thumbnail).forEach(File::delete)
}

/** What's still on the way for one trip, for the trip screen. */
data class UploadSnapshot(
    /** Steps the server doesn't have yet. */
    val localSteps: List<LocalStep> = emptyList(),
    /** Uploads still pending for steps the server already has. */
    val uploadsByStepId: Map<Long, List<PendingUpload>> = emptyMap(),
) {
    data class LocalStep(val step: PendingStep, val uploads: List<PendingUpload>)
}

/**
 * The way steps and photos written on the road reach the server ([D19]).
 *
 * Everything is recorded in the database first, so nothing is lost when the
 * app is closed or the connection drops. [process] – run by the upload
 * worker – then works through it: create the steps the server doesn't have
 * yet (idempotent through the client UUID), then send every file, streamed
 * from disk, one after the other.
 */
class UploadQueue(
    private val dao: QueueDao,
    private val directory: File,
    private val clientFor: (accountId: String) -> ServerClient?,
    private val now: () -> Long = System::currentTimeMillis,
) {
    private val mutex = Mutex()
    private val progressState = MutableStateFlow<Map<String, Float>>(emptyMap())

    /** Progress of the upload in flight, 0…1 by upload ID. Only in memory. */
    val progress: StateFlow<Map<String, Float>> = progressState.asStateFlow()

    init {
        directory.mkdirs()
    }

    // Adding

    /** A new step with its media and their captions. Returns the step's client UUID. */
    suspend fun enqueueStep(
        accountId: String,
        tripId: Long,
        body: String,
        placeName: String?,
        lat: Double?,
        lon: Double?,
        occurredAt: Instant,
        media: List<Pair<PreparedMedia, String?>>,
    ): String {
        val text = body.trim()
        val place = placeName?.trim()?.ifEmpty { null }
        val step = PendingStep(
            clientUuid = newId(), accountId = accountId, tripId = tripId, body = text, placeName = place,
            lat = lat, lon = lon, occurredAt = occurredAt.toEpochMilli(),
            // A step without text or place appears with its first photo ([E7]).
            publish = text.isNotEmpty() || place != null,
            createdAt = now(),
        )
        dao.insert(step, adopt(media, accountId, tripId, stepClientUuid = step.clientUuid, stepId = null))
        return step.clientUuid
    }

    /** More photos for a step the server already has. */
    suspend fun enqueueMedia(accountId: String, tripId: Long, stepId: Long, media: List<Pair<PreparedMedia, String?>>) =
        dao.insert(adopt(media, accountId, tripId, stepClientUuid = null, stepId = stepId))

    /** Moves the prepared files into the queue's folder and describes them as uploads. */
    private fun adopt(
        media: List<Pair<PreparedMedia, String?>>,
        accountId: String,
        tripId: Long,
        stepClientUuid: String?,
        stepId: Long?,
    ) = media.mapIndexed { index, (item, caption) ->
        val id = newId()
        PendingUpload(
            clientUuid = id, accountId = accountId, tripId = tripId, stepClientUuid = stepClientUuid, stepId = stepId,
            sortIndex = index, assetId = item.assetId,
            fileName = move(item.file, "$id.${item.file.extension.ifEmpty { "bin" }}")!!,
            posterName = move(item.poster, "$id-poster.jpg"),
            thumbnailName = move(item.thumbnail, "$id-thumb.jpg"),
            mime = item.mime, durationMs = item.durationMs,
            caption = caption?.trim()?.ifEmpty { null },
            createdAt = now(),
        )
    }

    private fun move(file: File?, name: String): String? {
        file ?: return null
        val target = File(directory, name)
        if (!file.renameTo(target)) {
            file.copyTo(target, overwrite = true)
            file.delete()
        }
        return name
    }

    // Working through

    /**
     * Creates missing steps and sends every upload that's due. Returns when
     * the next one waiting out a backoff is due (epoch ms), if any.
     */
    suspend fun process(): Long? = mutex.withLock {
        // Only this runs uploads; one marked as running was cut off.
        dao.resetInterrupted()
        if (createSteps()) sendUploads()
        dao.nextRetry(now())
    }

    /** False when the servers can't be reached – no point trying the files then. */
    private suspend fun createSteps(): Boolean {
        for (step in dao.stepsToCreate()) {
            val client = clientFor(step.accountId) ?: continue
            try {
                val created = client.createStep(
                    step.tripId, step.clientUuid, step.body, step.placeName, step.lat, step.lon,
                    Instant.ofEpochMilli(step.occurredAt), step.publish,
                )
                dao.update(step.copy(serverStepId = created.id, lastError = null))
                dao.attach(step.clientUuid, created.id)
                dao.cleanUp()
            } catch (error: ApiError) {
                if (isTransient(error)) return false
                dao.update(step.copy(lastError = error.code ?: "unexpected"))
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                // Offline or server trouble: the next run tries again.
                return false
            }
        }
        return true
    }

    private suspend fun sendUploads() {
        while (true) {
            val upload = dao.dueUploads(now()).firstOrNull() ?: return
            if (!send(upload)) return
        }
    }

    /** False when the connection failed – the rest waits for the next run. */
    private suspend fun send(upload: PendingUpload): Boolean {
        val client = clientFor(upload.accountId)
        val file = File(directory, upload.fileName)
        if (client == null || !file.exists()) {
            dao.update(upload.copy(state = PendingUpload.State.FAILED, lastError = if (client == null) "not_signed_in" else "file_missing"))
            return true
        }
        dao.update(upload.copy(state = PendingUpload.State.UPLOADING))
        return try {
            val photoId = client.uploadMedia(upload.stepId!!, body(upload, file))
            upload.assetId?.let { dao.markUploaded(UploadedAsset(upload.accountId, it, photoId, now())) }
            dao.deleteUpload(upload.clientUuid)
            removeFiles(upload)
            dao.cleanUp()
            true
        } catch (error: ApiError) {
            val status = (error as? ApiError.Problem)?.status ?: (error as? ApiError.Unexpected)?.status ?: 0
            if (status in 400..499 && status !in retryableStatuses) {
                // A retry won't change "too large" or "unsupported format".
                dao.update(upload.copy(state = PendingUpload.State.FAILED, lastError = error.code ?: "http_$status"))
            } else {
                retryLater(upload, if (status == 401) "not_signed_in" else error.code ?: "network")
            }
            true
        } catch (error: CancellationException) {
            // Stopped by the system: the row goes back to the queue on the next run.
            throw error
        } catch (_: Exception) {
            retryLater(upload, "network")
            false
        } finally {
            progressState.update { it - upload.clientUuid }
        }
    }

    private suspend fun retryLater(upload: PendingUpload, reason: String) {
        val attempts = upload.attempts + 1
        dao.update(upload.copy(state = PendingUpload.State.QUEUED, attempts = attempts, lastError = reason, notBefore = now() + backoff(attempts)))
    }

    private fun body(upload: PendingUpload, file: File): RequestBody {
        val multipart = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("clientUuid", upload.clientUuid)
            .addFile("file", file, upload.mime)
        upload.posterName?.let { multipart.addFile("poster", File(directory, it), "image/jpeg") }
        upload.durationMs?.let { multipart.addFormDataPart("durationMs", it.toString()) }
        upload.caption?.let { multipart.addFormDataPart("caption", it) }
        return ProgressBody(multipart.build()) { fraction ->
            progressState.update { it + (upload.clientUuid to fraction) }
        }
    }

    // Managing

    /** Gives a failed upload another try. */
    suspend fun retry(id: String) {
        dao.upload(id)?.let { dao.update(it.copy(state = PendingUpload.State.QUEUED, notBefore = null, lastError = null)) }
    }

    suspend fun remove(id: String) {
        dao.upload(id)?.let {
            dao.deleteUpload(id)
            removeFiles(it)
            dao.cleanUp()
        }
    }

    /** Throws away a step that never reached the server, with its media. */
    suspend fun removeStep(clientUuid: String) {
        val uploads = dao.uploadsOfStep(clientUuid)
        dao.deleteStep(clientUuid)
        uploads.forEach(::removeFiles)
    }

    /**
     * A deleted trip takes what was still queued for it along; signing out
     * ([tripId] null) forgets the account's queue and its photo bookkeeping.
     */
    suspend fun removeAll(accountId: String, tripId: Long? = null) {
        val uploads = dao.uploadsOf(accountId, tripId)
        dao.removeAll(accountId, tripId, assetsToo = tripId == null)
        uploads.forEach(::removeFiles)
    }

    /** Whether the account still has something on its way – what must not vanish on a server sign-out. */
    suspend fun hasPending(accountId: String) = dao.hasPending(accountId)

    suspend fun knownAssets(accountId: String) = dao.knownAssets(accountId).toSet()

    suspend fun ignore(accountId: String, assetIds: List<String>) = dao.ignore(assetIds.map { IgnoredAsset(accountId, it) })

    fun thumbnail(upload: PendingUpload): File? = upload.thumbnailName?.let { File(directory, it) }

    /** Keeps the trip screen up to date while uploads move along. */
    fun observe(accountId: String, tripId: Long): Flow<UploadSnapshot> =
        combine(dao.observeSteps(accountId, tripId), dao.observeUploads(accountId, tripId), ::snapshot).distinctUntilChanged()

    /** Everything on its way, across accounts and trips – for the app-wide upload indicator. */
    fun observeAll(): Flow<UploadOverview> =
        combine(dao.observeUnsentSteps(), dao.observeAllUploads(), ::UploadOverview).distinctUntilChanged()

    private fun removeFiles(upload: PendingUpload) =
        listOfNotNull(upload.fileName, upload.posterName, upload.thumbnailName).forEach { File(directory, it).delete() }

    companion object {
        /** Client errors a later attempt can get past: signed out (until the next sign-in), timeout, rate limit. */
        private val retryableStatuses = setOf(401, 408, 429)

        fun isTransient(error: ApiError): Boolean = when (error) {
            is ApiError.Problem -> error.status >= 500 || error.status in retryableStatuses
            is ApiError.Unexpected -> error.status >= 500 || error.status == 0
            else -> false
        }

        /** 30 s, 1 min, 2 min … capped at an hour. */
        fun backoff(attempts: Int): Long = min(30_000 * 2.0.pow(maxOf(attempts - 1, 0)), 3_600_000.0).toLong()

        fun snapshot(steps: List<PendingStep>, uploads: List<PendingUpload>): UploadSnapshot {
            val local = steps.filter { it.serverStepId == null }
            val localIds = local.map { it.clientUuid }.toSet()
            return UploadSnapshot(
                localSteps = local.sortedByDescending { it.occurredAt }.map { step ->
                    UploadSnapshot.LocalStep(step, uploads.filter { it.stepClientUuid == step.clientUuid })
                },
                uploadsByStepId = uploads
                    .filter { it.stepId != null && it.stepClientUuid !in localIds }
                    .groupBy { it.stepId!! },
            )
        }

        private fun newId() = UUID.randomUUID().toString()
    }
}

/** Reports how much of a request body went out – at most once per whole percent. */
private class ProgressBody(private val delegate: RequestBody, private val report: (Float) -> Unit) : RequestBody() {
    override fun contentType(): MediaType? = delegate.contentType()
    override fun contentLength() = delegate.contentLength()

    override fun writeTo(sink: BufferedSink) {
        val total = contentLength().toFloat()
        var sent = 0L
        var reported = -1
        val counting = object : ForwardingSink(sink) {
            override fun write(source: Buffer, byteCount: Long) {
                super.write(source, byteCount)
                sent += byteCount
                val percent = (sent * 100 / total).toInt()
                if (total > 0 && percent != reported) {
                    reported = percent
                    report(sent / total)
                }
            }
        }.buffer()
        delegate.writeTo(counting)
        counting.flush()
    }
}
