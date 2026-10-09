package de.ownsteps.app.media

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import de.ownsteps.app.data.PhotoSuggestions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant

/** A photo or video in the device's media store. */
data class LibraryItem(
    val id: Long,
    val isVideo: Boolean,
    val takenAt: Instant,
    val width: Int,
    val height: Int,
    val durationMs: Long?,
) {
    val uri: Uri
        get() = ContentUris.withAppendedId(
            if (isVideo) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id,
        )

    /** How the upload queue remembers it, for photo suggestions ([D22]). */
    val assetId get() = id.toString()

    val source get() = MediaPreparation.Source(uri, assetId, takenAt)

    val candidate get() = PhotoSuggestions.Candidate(assetId, takenAt, width, height, durationMs)
}

/**
 * The device's photos and videos through the media store. The app has its
 * own picker on top of this instead of the system one: the system picker
 * strips the GPS position, and a step's place mostly comes from it ([E8]).
 */
object Library {
    /** Full or partial ("selected photos") access, plus the photos' positions. */
    val permissions: Array<String> = when {
        Build.VERSION.SDK_INT >= 34 -> arrayOf(
            Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO,
            Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED, Manifest.permission.ACCESS_MEDIA_LOCATION,
        )
        Build.VERSION.SDK_INT >= 33 -> arrayOf(
            Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.ACCESS_MEDIA_LOCATION,
        )
        else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.ACCESS_MEDIA_LOCATION)
    }

    fun hasAccess(context: Context): Boolean = permissions
        .filter { it != Manifest.permission.ACCESS_MEDIA_LOCATION }
        .any { granted(context, it) }

    /** Only some photos were shared with the app (Android 14+). */
    fun isPartial(context: Context): Boolean = Build.VERSION.SDK_INT >= 34 &&
        !granted(context, Manifest.permission.READ_MEDIA_IMAGES) &&
        granted(context, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)

    fun canReadLocation(context: Context) = granted(context, Manifest.permission.ACCESS_MEDIA_LOCATION)

    private fun granted(context: Context, permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    /** Newest first; [range] limits it to a trip's period. Screenshots aren't travel photos. */
    suspend fun items(context: Context, range: ClosedRange<Instant>? = null, ids: List<Long>? = null): List<LibraryItem> =
        withContext(Dispatchers.IO) {
            val conditions = mutableListOf(
                "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (${MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE}, ${MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO})",
                "(${MediaStore.MediaColumns.RELATIVE_PATH} IS NULL OR ${MediaStore.MediaColumns.RELATIVE_PATH} NOT LIKE '%Screenshots%')",
            )
            val arguments = mutableListOf<String>()
            range?.let {
                conditions += "${MediaStore.MediaColumns.DATE_TAKEN} >= ? AND ${MediaStore.MediaColumns.DATE_TAKEN} < ?"
                arguments += listOf(it.start.toEpochMilli().toString(), it.endInclusive.toEpochMilli().toString())
            }
            ids?.let { conditions += "${MediaStore.MediaColumns._ID} IN (${it.joinToString()})" }
            val columns = arrayOf(
                MediaStore.MediaColumns._ID, MediaStore.Files.FileColumns.MEDIA_TYPE, MediaStore.MediaColumns.DATE_TAKEN,
                MediaStore.MediaColumns.DATE_ADDED, MediaStore.MediaColumns.WIDTH, MediaStore.MediaColumns.HEIGHT,
                MediaStore.MediaColumns.DURATION,
            )
            context.contentResolver.query(
                MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL), columns,
                conditions.joinToString(" AND "), arguments.toTypedArray(),
                "${MediaStore.MediaColumns.DATE_TAKEN} DESC",
            )?.use { cursor ->
                buildList {
                    while (cursor.moveToNext()) {
                        val isVideo = cursor.getInt(1) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO
                        // Items without a capture time fall back to when they were added (seconds).
                        val taken = cursor.getLong(2).takeIf { it > 0 } ?: (cursor.getLong(3) * 1000)
                        add(LibraryItem(
                            id = cursor.getLong(0), isVideo = isVideo, takenAt = Instant.ofEpochMilli(taken),
                            width = cursor.getInt(4), height = cursor.getInt(5),
                            durationMs = if (isVideo) cursor.getLong(6) else null,
                        ))
                    }
                }
            }.orEmpty()
        }
}
