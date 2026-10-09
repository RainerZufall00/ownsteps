package de.ownsteps.app.data

/** Everything still on its way to any server – what the app-wide upload indicator is computed from. */
data class UploadOverview(
    /** Steps written on the device that the server doesn't have yet. */
    val unsentSteps: List<PendingStep> = emptyList(),
    /** Every queued, running or failed upload, oldest first. */
    val uploads: List<PendingUpload> = emptyList(),
)

/** One line of state for the app-wide upload indicator. */
data class UploadStatus(
    val phase: Phase,
    /** Uploads finished since the queue was last empty. */
    val done: Int,
    /** [done] plus what's still queued or running (failed ones don't count). */
    val total: Int,
    /** 0…1 across [total], counting the running upload by its sent bytes. */
    val fraction: Float,
    /** Uploads and steps the server turned down. */
    val failed: Int,
    /** The trip a tap opens: the first failed one's, else the first pending one's. */
    val accountId: String?,
    val tripId: Long?,
) {
    enum class Phase {
        /** A step without media is waiting for the server to take it. */
        SENDING_STEP,
        /** Bytes are on their way. */
        UPLOADING,
        /** Everything is sent; the server is still resizing and storing it. */
        PROCESSING,
        /** The device is offline, or the last try of an upload found no connection. */
        WAITING_FOR_CONNECTION,
        /** Only steps and uploads that a retry won't fix by itself are left. */
        FAILED,
        /** The queue just emptied without failures; shown briefly. */
        FINISHED,
    }
}

/**
 * Turns the queue and the uploads' progress into an [UploadStatus], like the
 * iOS app's `UploadStatusTracker`.
 *
 * Rows disappear from the queue once the server has an upload, so "3/5"
 * needs memory: every upload seen since the queue was last empty counts
 * towards the total, and those gone since count as done.
 *
 * The queue marks steps and uploads differently: a step's `lastError` means
 * the server turned it down (offline tries leave no trace), an upload's means
 * its last try failed and it waits to try again.
 */
class UploadStatusTracker {
    private var seen = emptySet<String>()
    private var finishedUntil: Long? = null
    private var lastFinished: UploadStatus? = null

    /** The status to show now, or null for nothing. [progress] holds the sent fraction of running uploads by ID. */
    fun status(overview: UploadOverview, progress: Map<String, Float>, online: Boolean = true, now: Long): UploadStatus? {
        val failedSteps = overview.unsentSteps.filter { it.lastError != null }
        val pendingSteps = overview.unsentSteps.filter { it.lastError == null }
        val stuck = failedSteps.map { it.clientUuid }.toSet()
        val failed = overview.uploads.filter { it.state == PendingUpload.State.FAILED }
        // Media of a turned-down step can't go anywhere until it's handled.
        val active = overview.uploads.filter { it.state != PendingUpload.State.FAILED && it.stepClientUuid !in stuck }
        seen = seen + active.map { it.clientUuid }
        val done = (seen - overview.uploads.map { it.clientUuid }.toSet()).size
        val total = done + active.size
        val failures = failed.size + failedSteps.size
        val target = failed.firstOrNull()?.let { it.accountId to it.tripId }
            ?: failedSteps.firstOrNull()?.let { it.accountId to it.tripId }
            ?: active.firstOrNull()?.let { it.accountId to it.tripId }
            ?: pendingSteps.firstOrNull()?.let { it.accountId to it.tripId }

        fun make(phase: UploadStatus.Phase, fraction: Float = 0f) =
            UploadStatus(phase, done, total, fraction, failures, target?.first, target?.second)

        if (active.isNotEmpty() || pendingSteps.isNotEmpty()) {
            finishedUntil = null
            // A running upload just waits for the network too; say why nothing moves.
            if (!online) return make(UploadStatus.Phase.WAITING_FOR_CONNECTION)
            val running = active.filter { it.state == PendingUpload.State.UPLOADING }
            if (running.isNotEmpty()) {
                val sent = active.sumOf { (progress[it.clientUuid] ?: 0f).coerceAtMost(1f).toDouble() }
                val fraction = if (total > 0) ((done + sent) / total).toFloat() else 0f
                // Sent completely but no answer yet: the server is working on it.
                val sending = running.any { (progress[it.clientUuid] ?: 0f) < 1f }
                return make(if (sending) UploadStatus.Phase.UPLOADING else UploadStatus.Phase.PROCESSING, fraction)
            }
            if (active.any { it.lastError != null }) return make(UploadStatus.Phase.WAITING_FOR_CONNECTION)
            // Media of a step the server doesn't have yet waits for the step.
            if (active.isEmpty() || pendingSteps.isNotEmpty()) return make(UploadStatus.Phase.SENDING_STEP)
            return make(UploadStatus.Phase.UPLOADING, if (total > 0) done.toFloat() / total else 0f)
        }

        // Nothing left to do: the batch is over.
        if (failures > 0) {
            seen = emptySet()
            finishedUntil = null
            return make(UploadStatus.Phase.FAILED)
        }
        if (done > 0) {
            finishedUntil = now + FINISHED_MS
            lastFinished = make(UploadStatus.Phase.FINISHED, 1f)
            seen = emptySet()
        }
        finishedUntil?.let { if (now < it) return lastFinished }
        finishedUntil = null
        return null
    }

    companion object {
        /** How long "finished" stays up. */
        const val FINISHED_MS = 3_000L
    }
}
