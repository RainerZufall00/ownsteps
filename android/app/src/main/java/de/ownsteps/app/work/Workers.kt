package de.ownsteps.app.work

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import de.ownsteps.app.MainActivity
import de.ownsteps.app.R
import de.ownsteps.app.data.Account
import de.ownsteps.app.data.TripNews
import de.ownsteps.app.model
import java.util.concurrent.TimeUnit

private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

/**
 * Sends the upload queue whenever there's a connection – also with the app
 * closed or the phone in a pocket ([D20]). Runs as a foreground service
 * while it can, so long videos aren't cut off.
 */
class UploadWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        // Not allowed from the background on newer systems; then it runs as plain work.
        runCatching { setForeground(getForegroundInfo()) }
        val nextRetry = applicationContext.model.uploads.process()
        nextRetry?.let { schedule(applicationContext, delayMs = it - System.currentTimeMillis()) }
        return Result.success()
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val notification = NotificationCompat.Builder(applicationContext, Notifications.UPLOADS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(applicationContext.getString(R.string.uploads_running))
            .setProgress(0, 0, true)
            .setOngoing(true)
            .setSilent(true)
            .build()
        return ForegroundInfo(Notifications.UPLOAD_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    }

    companion object {
        /** Appended, never replacing: a running upload must not be cut off by new work. */
        fun schedule(context: Context, delayMs: Long = 0) {
            val request = OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(online)
                .setInitialDelay(delayMs.coerceAtLeast(0), TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("uploads", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        }
    }
}

/**
 * Background refresh ([D16]): there's no push relay, so the app looks at
 * each server's change feed now and then and notifies about what's new.
 */
class NewsWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        applicationContext.model.checkForNews(notify = true)
        return Result.success()
    }

    companion object {
        /** Android decides when exactly; 15 minutes is the shortest period it allows. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<NewsWorker>(20, TimeUnit.MINUTES).setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("news", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}

/** Local notifications: readers hear about new steps, authors about comments ([D16]). */
object Notifications {
    const val NEWS = "news"
    const val UPLOADS = "uploads"
    const val UPLOAD_ID = 1
    const val EXTRA_ACCOUNT = "accountId"
    const val EXTRA_TRIP = "tripId"
    const val EXTRA_STEP = "stepId"

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(listOf(
            NotificationChannel(NEWS, context.getString(R.string.channel_news), NotificationManager.IMPORTANCE_DEFAULT),
            NotificationChannel(UPLOADS, context.getString(R.string.channel_uploads), NotificationManager.IMPORTANCE_LOW),
        ))
    }

    fun canPost(context: Context) = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun post(context: Context, account: Account, items: List<TripNews.Item>) {
        if (!canPost(context)) return
        val manager = NotificationManagerCompat.from(context)
        for (item in items) {
            val open = Intent(context, MainActivity::class.java)
                .putExtra(EXTRA_ACCOUNT, account.id)
                .putExtra(EXTRA_TRIP, item.tripId)
                .putExtra(EXTRA_STEP, item.stepId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            val id = "${account.id}-${item.stepId}-${item.kind}".hashCode() xor System.nanoTime().toInt()
            val notification = NotificationCompat.Builder(context, NEWS)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(if (item.kind == TripNews.Kind.STEP) context.getString(R.string.news_new_step, item.title) else item.title)
                .setContentText(item.body.ifEmpty { context.getString(R.string.news_tap_to_read) })
                .setStyle(NotificationCompat.BigTextStyle().bigText(item.body))
                .setGroup("${account.id}-${item.tripId}")
                .setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
                .build()
            @Suppress("MissingPermission")
            manager.notify(id, notification)
        }
    }
}
