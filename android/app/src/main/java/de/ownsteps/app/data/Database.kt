package de.ownsteps.app.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/**
 * The app's one SQLite file: the offline copy of what the servers sent
 * ([D22]) and the upload queue ([D19]). Times are epoch milliseconds.
 * Schemas are exported to `app/schemas`; a change means a new version and
 * a migration – installed apps have run every earlier one.
 */
@Database(
    version = 1,
    entities = [CachedTripList::class, CachedTrip::class, PendingStep::class, PendingUpload::class, UploadedAsset::class, IgnoredAsset::class],
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun cache(): CacheDao
    abstract fun queue(): QueueDao

    companion object {
        fun open(context: Context) = Room.databaseBuilder(context, AppDatabase::class.java, "ownsteps.db").build()
    }
}

// Offline copy

@Entity(tableName = "trip_list")
data class CachedTripList(@PrimaryKey val accountId: String, val json: String, val fetchedAt: Long)

@Entity(tableName = "trip_detail", primaryKeys = ["accountId", "tripId"])
data class CachedTrip(val accountId: String, val tripId: Long, val json: String, val fetchedAt: Long)

@Dao
interface CacheDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(list: CachedTripList)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(trip: CachedTrip)

    @Query("SELECT * FROM trip_list WHERE accountId = :accountId")
    suspend fun tripList(accountId: String): CachedTripList?

    @Query("SELECT * FROM trip_detail WHERE accountId = :accountId AND tripId = :tripId")
    suspend fun trip(accountId: String, tripId: Long): CachedTrip?

    @Query("DELETE FROM trip_detail WHERE accountId = :accountId AND tripId = :tripId")
    suspend fun removeTrip(accountId: String, tripId: Long)

    @Transaction
    suspend fun removeAll(accountId: String) {
        removeLists(accountId)
        removeTrips(accountId)
    }

    @Query("DELETE FROM trip_list WHERE accountId = :accountId")
    suspend fun removeLists(accountId: String)

    @Query("DELETE FROM trip_detail WHERE accountId = :accountId")
    suspend fun removeTrips(accountId: String)
}

// Upload queue

/** A step written on the device that the server may not have yet. */
@Entity(tableName = "pending_step")
data class PendingStep(
    @PrimaryKey val clientUuid: String,
    val accountId: String,
    val tripId: Long,
    val body: String,
    val placeName: String?,
    val lat: Double?,
    val lon: Double?,
    val occurredAt: Long,
    /** False while the step has no text or place – it shows with its first photo ([E7]). */
    val publish: Boolean,
    val serverStepId: Long? = null,
    val lastError: String? = null,
    val createdAt: Long,
)

/** One photo or video on its way to the server. Its files wait in the queue folder. */
@Entity(
    tableName = "pending_upload",
    foreignKeys = [ForeignKey(PendingStep::class, ["clientUuid"], ["stepClientUuid"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("stepClientUuid"), Index("accountId", "tripId")],
)
data class PendingUpload(
    @PrimaryKey val clientUuid: String,
    val accountId: String,
    val tripId: Long,
    /** Set when the step was written on the device. */
    val stepClientUuid: String?,
    /** Set once the step exists on the server. */
    val stepId: Long?,
    val sortIndex: Int,
    /** The media store item it came from, for photo suggestions ([D22]). */
    val assetId: String?,
    val fileName: String,
    val posterName: String?,
    val thumbnailName: String?,
    val mime: String,
    val durationMs: Long?,
    val caption: String?,
    val state: State = State.QUEUED,
    val attempts: Int = 0,
    /** Backoff after transient failures; null means "now". */
    val notBefore: Long? = null,
    val lastError: String? = null,
    val createdAt: Long,
) {
    enum class State {
        /** Waiting for its step to exist on the server, or for its turn. */
        QUEUED,
        /** Being sent right now. */
        UPLOADING,
        /** The server said no in a way a retry won't change (e.g. too large). */
        FAILED,
    }

    val isVideo get() = mime.startsWith("video/")
}

/** Library items that made it to a server – not suggested again. Per device on purpose. */
@Entity(tableName = "uploaded_asset", primaryKeys = ["accountId", "assetId"])
data class UploadedAsset(val accountId: String, val assetId: String, val photoId: Long, val uploadedAt: Long)

/** Library items the user doesn't want suggested ([D22]). */
@Entity(tableName = "ignored_asset", primaryKeys = ["accountId", "assetId"])
data class IgnoredAsset(val accountId: String, val assetId: String)

@Dao
interface QueueDao {
    @Insert
    suspend fun insert(step: PendingStep, uploads: List<PendingUpload>)

    @Insert
    suspend fun insert(uploads: List<PendingUpload>)

    @Update
    suspend fun update(step: PendingStep)

    @Update
    suspend fun update(upload: PendingUpload)

    @Query("SELECT * FROM pending_step WHERE serverStepId IS NULL ORDER BY createdAt")
    suspend fun stepsToCreate(): List<PendingStep>

    @Query("UPDATE pending_upload SET stepId = :stepId WHERE stepClientUuid = :clientUuid")
    suspend fun attach(clientUuid: String, stepId: Long)

    @Query("SELECT * FROM pending_upload WHERE state = 'QUEUED' AND stepId IS NOT NULL AND (notBefore IS NULL OR notBefore <= :now) ORDER BY createdAt, sortIndex")
    suspend fun dueUploads(now: Long): List<PendingUpload>

    /** When the next upload waiting out a backoff is due. */
    @Query("SELECT MIN(notBefore) FROM pending_upload WHERE state = 'QUEUED' AND notBefore > :now")
    suspend fun nextRetry(now: Long): Long?

    @Query("UPDATE pending_upload SET state = 'QUEUED' WHERE state = 'UPLOADING'")
    suspend fun resetInterrupted()

    @Query("SELECT * FROM pending_upload WHERE clientUuid = :id")
    suspend fun upload(id: String): PendingUpload?

    @Query("DELETE FROM pending_upload WHERE clientUuid = :id")
    suspend fun deleteUpload(id: String)

    @Query("SELECT * FROM pending_upload WHERE stepClientUuid = :clientUuid")
    suspend fun uploadsOfStep(clientUuid: String): List<PendingUpload>

    @Query("DELETE FROM pending_step WHERE clientUuid = :clientUuid")
    suspend fun deleteStep(clientUuid: String)

    /** Local steps whose uploads are all through: the server's copy takes over. */
    @Query("DELETE FROM pending_step WHERE serverStepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pending_upload WHERE pending_upload.stepClientUuid = pending_step.clientUuid)")
    suspend fun cleanUp()

    @Query("SELECT * FROM pending_upload WHERE accountId = :accountId AND (:tripId IS NULL OR tripId = :tripId)")
    suspend fun uploadsOf(accountId: String, tripId: Long?): List<PendingUpload>

    @Transaction
    suspend fun removeAll(accountId: String, tripId: Long?, assetsToo: Boolean) {
        deleteUploads(accountId, tripId)
        deleteSteps(accountId, tripId)
        if (assetsToo) {
            deleteUploadedAssets(accountId)
            deleteIgnoredAssets(accountId)
        }
    }

    @Query("DELETE FROM pending_upload WHERE accountId = :accountId AND (:tripId IS NULL OR tripId = :tripId)")
    suspend fun deleteUploads(accountId: String, tripId: Long?)

    @Query("DELETE FROM pending_step WHERE accountId = :accountId AND (:tripId IS NULL OR tripId = :tripId)")
    suspend fun deleteSteps(accountId: String, tripId: Long?)

    @Query("DELETE FROM uploaded_asset WHERE accountId = :accountId")
    suspend fun deleteUploadedAssets(accountId: String)

    @Query("DELETE FROM ignored_asset WHERE accountId = :accountId")
    suspend fun deleteIgnoredAssets(accountId: String)

    @Query("SELECT EXISTS(SELECT 1 FROM pending_step WHERE accountId = :accountId AND serverStepId IS NULL) OR EXISTS(SELECT 1 FROM pending_upload WHERE accountId = :accountId)")
    suspend fun hasPending(accountId: String): Boolean

    @Query("SELECT * FROM pending_step WHERE accountId = :accountId AND tripId = :tripId")
    fun observeSteps(accountId: String, tripId: Long): Flow<List<PendingStep>>

    @Query("SELECT * FROM pending_upload WHERE accountId = :accountId AND tripId = :tripId ORDER BY sortIndex")
    fun observeUploads(accountId: String, tripId: Long): Flow<List<PendingUpload>>

    @Query("SELECT * FROM pending_step WHERE serverStepId IS NULL ORDER BY createdAt")
    fun observeUnsentSteps(): Flow<List<PendingStep>>

    @Query("SELECT * FROM pending_upload ORDER BY createdAt, sortIndex")
    fun observeAllUploads(): Flow<List<PendingUpload>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun markUploaded(asset: UploadedAsset)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun ignore(assets: List<IgnoredAsset>)

    @Query("SELECT assetId FROM uploaded_asset WHERE accountId = :accountId UNION SELECT assetId FROM ignored_asset WHERE accountId = :accountId")
    suspend fun knownAssets(accountId: String): List<String>
}
