package de.ownsteps.app

import de.ownsteps.app.data.PendingStep
import de.ownsteps.app.data.PendingUpload
import de.ownsteps.app.data.PendingUpload.State
import de.ownsteps.app.data.UploadOverview
import de.ownsteps.app.data.UploadStatus.Phase
import de.ownsteps.app.data.UploadStatusTracker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UploadStatusTest {
    private fun upload(id: String, state: State = State.QUEUED, error: String? = null, trip: Long = 7, stepUuid: String? = null) = PendingUpload(
        clientUuid = id, accountId = "acc", tripId = trip, stepClientUuid = stepUuid, stepId = if (stepUuid == null) 1 else null,
        sortIndex = 0, assetId = null, fileName = "$id.jpg", posterName = null, thumbnailName = null, mime = "image/jpeg",
        durationMs = null, caption = null, state = state, lastError = error, createdAt = 0,
    )

    private fun step(id: String = "s", error: String? = null, trip: Long = 9) = PendingStep(
        clientUuid = id, accountId = "acc", tripId = trip, body = "Hi", placeName = null, lat = null, lon = null,
        occurredAt = 0, publish = true, lastError = error, createdAt = 0,
    )

    @Test fun `shows nothing for an empty queue`() {
        assertNull(UploadStatusTracker().status(UploadOverview(), emptyMap(), now = 0))
    }

    @Test fun `counts finished uploads across the batch`() {
        val tracker = UploadStatusTracker()
        val first = tracker.status(UploadOverview(uploads = listOf(upload("a", State.UPLOADING), upload("b"), upload("c"))), mapOf("a" to 0.5f), now = 0)!!
        assertEquals(Phase.UPLOADING, first.phase)
        assertEquals(0 to 3, first.done to first.total)
        assertEquals(0.5f / 3, first.fraction, 0.001f)

        // "a" reached the server and left the queue; "b" runs.
        val second = tracker.status(UploadOverview(uploads = listOf(upload("b", State.UPLOADING), upload("c"))), mapOf("b" to 0.2f), now = 0)!!
        assertEquals(1 to 3, second.done to second.total)
        assertEquals(1.2f / 3, second.fraction, 0.001f)
        assertEquals("acc" to 7L, second.accountId to second.tripId)
    }

    @Test fun `calls fully sent uploads processing`() {
        val status = UploadStatusTracker().status(UploadOverview(uploads = listOf(upload("a", State.UPLOADING))), mapOf("a" to 1f), now = 0)
        assertEquals(Phase.PROCESSING, status?.phase)
    }

    @Test fun `waits for a connection after a failed try or while offline`() {
        assertEquals(Phase.WAITING_FOR_CONNECTION, UploadStatusTracker().status(UploadOverview(uploads = listOf(upload("a", error = "network"))), emptyMap(), now = 0)?.phase)
        val running = UploadOverview(listOf(step()), listOf(upload("a", State.UPLOADING)))
        assertEquals(Phase.WAITING_FOR_CONNECTION, UploadStatusTracker().status(running, mapOf("a" to 0.3f), online = false, now = 0)?.phase)
    }

    @Test fun `sends the step before its media`() {
        val status = UploadStatusTracker().status(UploadOverview(listOf(step()), listOf(upload("a", stepUuid = "s"))), emptyMap(), now = 0)
        assertEquals(Phase.SENDING_STEP, status?.phase)
    }

    @Test fun `counts a turned-down step as failed`() {
        // Its media can't go anywhere and mustn't look like a running batch.
        val status = UploadStatusTracker().status(UploadOverview(listOf(step(error = "trip_not_found")), listOf(upload("a", trip = 9, stepUuid = "s"))), emptyMap(), now = 0)
        assertEquals(Phase.FAILED, status?.phase)
        assertEquals(1, status?.failed)
        assertEquals(9L, status?.tripId)
    }

    @Test fun `shows finished briefly then nothing`() {
        val tracker = UploadStatusTracker()
        tracker.status(UploadOverview(uploads = listOf(upload("a", State.UPLOADING))), mapOf("a" to 1f), now = 0)
        val done = tracker.status(UploadOverview(), emptyMap(), now = 1_000)
        assertEquals(Phase.FINISHED, done?.phase)
        assertEquals(1, done?.done)
        // A progress update in between doesn't cut it short.
        assertEquals(Phase.FINISHED, tracker.status(UploadOverview(), emptyMap(), now = 2_000)?.phase)
        assertNull(tracker.status(UploadOverview(), emptyMap(), now = 1_000 + UploadStatusTracker.FINISHED_MS))
    }

    @Test fun `keeps showing failures until they are handled`() {
        val tracker = UploadStatusTracker()
        val status = tracker.status(UploadOverview(uploads = listOf(upload("a", State.FAILED, trip = 3))), emptyMap(), now = 0)
        assertEquals(Phase.FAILED, status?.phase)
        assertEquals(3L, status?.tripId)
        // Failed ones don't count towards the next batch.
        val next = tracker.status(UploadOverview(uploads = listOf(upload("a", State.FAILED), upload("b", State.UPLOADING))), emptyMap(), now = 0)
        assertEquals(Phase.UPLOADING, next?.phase)
        assertEquals(1, next?.total)
        assertEquals(1, next?.failed)
    }
}
