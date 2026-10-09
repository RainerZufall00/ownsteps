package de.ownsteps.app

import android.app.Application
import android.content.Context
import android.util.Size
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.asImage
import coil3.decode.DataSource
import coil3.decode.ImageSource
import coil3.fetch.FetchResult
import coil3.fetch.Fetcher
import coil3.fetch.ImageFetchResult
import coil3.fetch.SourceFetchResult
import coil3.key.Keyer
import coil3.request.Options
import de.ownsteps.app.api.Photo
import de.ownsteps.app.api.Variant
import de.ownsteps.app.data.Account
import de.ownsteps.app.media.LibraryItem
import de.ownsteps.app.work.NewsWorker
import de.ownsteps.app.work.Notifications
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okio.FileSystem
import okio.Path.Companion.toOkioPath
import org.maplibre.android.MapLibre

class OwnStepsApplication : Application(), SingletonImageLoader.Factory {
    val model by lazy { AppModel(this) }

    override fun onCreate() {
        super.onCreate()
        MapLibre.getInstance(this)
        Notifications.createChannels(this)
        NewsWorker.schedule(this)
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context)
            .components {
                add(ServerPhotoFetcher.Factory(model))
                add(ServerPhotoKeyer)
                add(LibraryThumbnailFetcher.Factory(context))
                add(LibraryKeyer)
            }
            .build()
}

/** The one [AppModel] of the process. */
val Context.model: AppModel get() = (applicationContext as OwnStepsApplication).model

/**
 * A photo from a server as Coil loads it: through [de.ownsteps.app.data.PhotoCache],
 * with the account's token, falling back to smaller sizes already on the
 * device – e.g. full screen while offline.
 */
data class ServerPhoto(val account: Account, val photo: Photo, val variant: Variant, val fallbacks: List<Variant> = emptyList())

private class ServerPhotoFetcher(private val data: ServerPhoto, private val model: AppModel) : Fetcher {
    override suspend fun fetch(): FetchResult {
        val (account, photo, variant) = data
        val file = try {
            model.photos.get(account.id, model.client(account), photo, variant)
        } catch (error: Exception) {
            data.fallbacks.firstNotNullOfOrNull { model.photos.cached(account.id, photo, it) } ?: throw error
        }
        return SourceFetchResult(ImageSource(file.toOkioPath(), FileSystem.SYSTEM), "image/webp", DataSource.DISK)
    }

    class Factory(private val model: AppModel) : Fetcher.Factory<ServerPhoto> {
        override fun create(data: ServerPhoto, options: Options, imageLoader: ImageLoader) = ServerPhotoFetcher(data, model)
    }
}

private object ServerPhotoKeyer : Keyer<ServerPhoto> {
    override fun key(data: ServerPhoto, options: Options) = "${data.account.id}/${data.photo.id}-${data.photo.fileKey}-${data.variant.path}"
}

/** Grid tiles of the device's library: the system's own thumbnails, videos included. */
private class LibraryThumbnailFetcher(private val item: LibraryItem, private val context: Context) : Fetcher {
    override suspend fun fetch(): FetchResult = withContext(Dispatchers.IO) {
        val bitmap = context.contentResolver.loadThumbnail(item.uri, Size(THUMBNAIL, THUMBNAIL), null)
        ImageFetchResult(bitmap.asImage(), isSampled = true, dataSource = DataSource.DISK)
    }

    class Factory(private val context: Context) : Fetcher.Factory<LibraryItem> {
        override fun create(data: LibraryItem, options: Options, imageLoader: ImageLoader) = LibraryThumbnailFetcher(data, context)
    }

    private companion object {
        const val THUMBNAIL = 320
    }
}

private object LibraryKeyer : Keyer<LibraryItem> {
    override fun key(data: LibraryItem, options: Options) = "library/${data.id}"
}
