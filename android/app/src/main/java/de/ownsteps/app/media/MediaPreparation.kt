package de.ownsteps.app.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.MediaStore
import androidx.exifinterface.media.ExifInterface
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import de.ownsteps.app.data.PreparedMedia
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.File
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.min

/**
 * Turns what the library or another app hands out into what the server
 * accepts ([D20]): JPEG instead of HEIC – the server's image library can't
 * decode HEVC – with EXIF and GPS kept, videos reduced to 1080p, and a
 * poster frame for each video.
 */
class MediaPreparation(private val context: Context) {
    enum class Problem { UNREADABLE, VIDEO_TOO_LARGE }

    class Failed(val problem: Problem) : Exception(problem.name)

    /** A picked item: where to read it, plus what the media store knows about it. */
    data class Source(val uri: Uri, val assetId: String? = null, val takenAt: Instant? = null)

    private val resolver get() = context.contentResolver

    /** One item after the other – full-size images take a lot of memory. */
    suspend fun prepare(sources: List<Source>, zone: ZoneId, originalVideos: Boolean): List<PreparedMedia> =
        sources.map { prepare(it, zone, originalVideos) }

    suspend fun prepare(source: Source, zone: ZoneId, originalVideos: Boolean): PreparedMedia {
        val mime = resolver.getType(source.uri).orEmpty()
        return try {
            if (mime.startsWith("video/")) video(source, mime, originalVideos) else withContext(Dispatchers.Default) { photo(source, zone) }
        } catch (error: Failed) {
            throw error
        } catch (error: kotlin.coroutines.cancellation.CancellationException) {
            throw error
        } catch (_: Exception) {
            throw Failed(Problem.UNREADABLE)
        } catch (_: OutOfMemoryError) {
            throw Failed(Problem.UNREADABLE)
        }
    }

    // Photos

    private fun photo(source: Source, zone: ZoneId): PreparedMedia {
        val original = resolver.openInputStream(withLocation(source.uri))?.use { it.readBytes() } ?: throw Failed(Problem.UNREADABLE)
        val isJpeg = original.size > 2 && original[0] == 0xFF.toByte() && original[1] == 0xD8.toByte()
        val file = temporaryFile("jpg")
        if (isJpeg && original.size <= MAX_IMAGE_BYTES) {
            // Taken over as it is: nothing lost, nothing to redo.
            file.writeBytes(original)
        } else {
            reencode(original, file)
        }
        val exif = ExifInterface(file)
        val position = exif.latLong
        return PreparedMedia(
            file = file,
            mime = "image/jpeg",
            thumbnail = thumbnail(file),
            assetId = source.assetId,
            takenAt = captureDate(exif, zone) ?: source.takenAt,
            lat = position?.get(0),
            lon = position?.get(1),
        )
    }

    /**
     * Decodes any image Android can read into an upright JPEG and carries
     * the metadata over. Huge panoramas step the quality down until they
     * fit the server's limit.
     */
    private fun reencode(original: ByteArray, file: File) {
        val bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(java.nio.ByteBuffer.wrap(original))) { decoder, _, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
        var quality = 85
        do {
            file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, quality, it) }
            quality -= 15
        } while (file.length() > MAX_IMAGE_BYTES && quality >= 50)
        bitmap.recycle()

        val from = ExifInterface(ByteArrayInputStream(original))
        val to = ExifInterface(file)
        for (tag in COPIED_TAGS) from.getAttribute(tag)?.let { to.setAttribute(tag, it) }
        // The decoder already turned the pixels upright.
        to.setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL.toString())
        to.saveAttributes()
    }

    /**
     * When the photo was taken, from EXIF. Cameras write local time without
     * a zone; like the server ([E12]), it's read in the server's zone.
     */
    private fun captureDate(exif: ExifInterface, zone: ZoneId): Instant? {
        val text = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL) ?: return null
        return runCatching { LocalDateTime.parse(text, EXIF_DATE).atZone(zone).toInstant() }.getOrNull()
    }

    /**
     * The original file, GPS included. Without `ACCESS_MEDIA_LOCATION` the
     * media store hands out a copy with the position blanked; then that's
     * what there is.
     */
    private fun withLocation(uri: Uri): Uri =
        if (uri.authority == MediaStore.AUTHORITY && Library.canReadLocation(context)) {
            runCatching { MediaStore.setRequireOriginal(uri) }.getOrDefault(uri)
        } else {
            uri
        }

    // Videos

    private suspend fun video(source: Source, mime: String, original: Boolean): PreparedMedia {
        // The other app's file may only be readable for a moment: copy it first.
        val copy = temporaryFile(if (mime == "video/quicktime") "mov" else "mp4")
        withContext(Dispatchers.IO) {
            resolver.openInputStream(withLocation(source.uri))?.use { input -> copy.outputStream().use(input::copyTo) }
                ?: throw Failed(Problem.UNREADABLE)
        }
        val facts = withContext(Dispatchers.IO) { VideoFacts.read(copy) }
        var file = copy
        var type = mime.ifEmpty { "video/mp4" }
        if (!original && facts.shortSide > MAX_SHORT_SIDE) {
            file = temporaryFile("mp4")
            try {
                transcode(copy, file)
            } finally {
                copy.delete()
            }
            type = "video/mp4"
        }
        if (file.length() > MAX_VIDEO_BYTES) {
            file.delete()
            throw Failed(Problem.VIDEO_TOO_LARGE)
        }
        return withContext(Dispatchers.IO) {
            val poster = posterFrame(file, facts.durationMs)
            PreparedMedia(
                file = file,
                mime = type,
                poster = poster,
                thumbnail = thumbnail(poster),
                durationMs = facts.durationMs,
                assetId = source.assetId,
                takenAt = source.takenAt ?: facts.recordedAt,
                lat = facts.location?.first,
                lon = facts.location?.second,
            )
        }
    }

    /** Re-encodes to H.264 with the short side at 1080 – usually a third of the size ([D20]). */
    @androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
    private suspend fun transcode(input: File, output: File) = withContext(Dispatchers.Main) {
        suspendCancellableCoroutine { continuation ->
            val transformer = Transformer.Builder(context)
                .setVideoMimeType(MimeTypes.VIDEO_H264)
                .addListener(object : Transformer.Listener {
                    override fun onCompleted(composition: Composition, result: ExportResult) = continuation.resume(Unit)
                    override fun onError(composition: Composition, result: ExportResult, exception: ExportException) =
                        continuation.resumeWithException(Failed(Problem.UNREADABLE))
                })
                .build()
            val item = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(input)))
                .setEffects(Effects(emptyList(), listOf(Presentation.createForShortSide(MAX_SHORT_SIDE))))
                .build()
            continuation.invokeOnCancellation { transformer.cancel() }
            transformer.start(item, output.path)
        }
    }

    /** A frame a second in (the first is often black), as JPEG. */
    private fun posterFrame(video: File, durationMs: Long): File = MediaMetadataRetriever().use { retriever ->
        retriever.setDataSource(video.path)
        val at = min(1_000L, durationMs / 3) * 1000
        val frame = retriever.getScaledFrameAtTime(at, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 1920, 1920)
            ?: throw Failed(Problem.UNREADABLE)
        temporaryFile("jpg").also { file -> file.outputStream().use { frame.compress(Bitmap.CompressFormat.JPEG, 80, it) } }
    }

    // Shared

    /** A small upright JPEG for previews until the server has the photo. */
    private fun thumbnail(image: File): File? = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(image.path, bounds)
        val sample = Integer.highestOneBit(maxOf(1, maxOf(bounds.outWidth, bounds.outHeight) / THUMBNAIL_PIXELS))
        val bitmap = BitmapFactory.decodeFile(image.path, BitmapFactory.Options().apply { inSampleSize = sample })
        val degrees = ExifInterface(image).rotationDegrees
        val upright = if (degrees == 0) bitmap else
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(degrees.toFloat()) }, true)
        temporaryFile("jpg").also { file -> file.outputStream().use { upright.compress(Bitmap.CompressFormat.JPEG, 70, it) } }
    }.getOrNull()

    fun temporaryFile(extension: String) = File(context.cacheDir, "prepared/${UUID.randomUUID()}.$extension").apply { parentFile?.mkdirs() }

    companion object {
        /** Server limits (`src/lib/limits.ts`). */
        const val MAX_IMAGE_BYTES = 25L * 1024 * 1024
        const val MAX_VIDEO_BYTES = 400L * 1024 * 1024
        const val MAX_SHORT_SIDE = 1080
        private const val THUMBNAIL_PIXELS = 400
        private val EXIF_DATE = DateTimeFormatter.ofPattern("yyyy:MM:dd HH:mm:ss")

        /** What the server reads (time, place) plus what's worth keeping about the camera. */
        private val COPIED_TAGS = listOf(
            ExifInterface.TAG_DATETIME, ExifInterface.TAG_DATETIME_ORIGINAL, ExifInterface.TAG_DATETIME_DIGITIZED,
            ExifInterface.TAG_OFFSET_TIME, ExifInterface.TAG_OFFSET_TIME_ORIGINAL, ExifInterface.TAG_SUBSEC_TIME_ORIGINAL,
            ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF, ExifInterface.TAG_GPS_LONGITUDE,
            ExifInterface.TAG_GPS_LONGITUDE_REF, ExifInterface.TAG_GPS_ALTITUDE, ExifInterface.TAG_GPS_ALTITUDE_REF,
            ExifInterface.TAG_GPS_TIMESTAMP, ExifInterface.TAG_GPS_DATESTAMP, ExifInterface.TAG_MAKE, ExifInterface.TAG_MODEL,
            ExifInterface.TAG_F_NUMBER, ExifInterface.TAG_EXPOSURE_TIME, ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY,
            ExifInterface.TAG_FOCAL_LENGTH, ExifInterface.TAG_IMAGE_DESCRIPTION,
        )
    }
}

/** What a video file says about itself. */
data class VideoFacts(val durationMs: Long, val shortSide: Int, val recordedAt: Instant?, val location: Pair<Double, Double>?) {
    companion object {
        fun read(file: File): VideoFacts = MediaMetadataRetriever().use { retriever ->
            retriever.setDataSource(file.path)
            fun value(key: Int) = retriever.extractMetadata(key)
            val width = value(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
            val height = value(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
            VideoFacts(
                durationMs = value(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0,
                shortSide = min(width, height),
                // "20260512T093011.000Z"
                recordedAt = value(MediaMetadataRetriever.METADATA_KEY_DATE)?.let {
                    runCatching { java.time.ZonedDateTime.parse(it, DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss.SSSX")).toInstant() }.getOrNull()
                },
                location = value(MediaMetadataRetriever.METADATA_KEY_LOCATION)?.let(::iso6709),
            )
        }

        /** The recording location a camera writes into a video: "+60.3913+005.3221/". */
        fun iso6709(value: String): Pair<Double, Double>? {
            val numbers = Regex("[+-][0-9.]+").findAll(value).mapNotNull { it.value.toDoubleOrNull() }.toList()
            if (numbers.size < 2 || kotlin.math.abs(numbers[0]) > 90 || kotlin.math.abs(numbers[1]) > 180) return null
            return numbers[0] to numbers[1]
        }
    }
}
