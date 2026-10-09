package de.ownsteps.app

import de.ownsteps.app.api.Comment
import de.ownsteps.app.api.MediaType
import de.ownsteps.app.api.Photo
import de.ownsteps.app.api.Step
import de.ownsteps.app.api.Trip
import de.ownsteps.app.api.TripDetail
import de.ownsteps.app.data.PendingStep
import de.ownsteps.app.data.PendingUpload
import de.ownsteps.app.data.PhotoSuggestions
import de.ownsteps.app.data.TripCalendar
import de.ownsteps.app.data.TripNews
import de.ownsteps.app.data.UploadQueue
import de.ownsteps.app.media.VideoFacts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

private val berlin = TripCalendar(ZoneId.of("Europe/Berlin"))
private val t0 = Instant.parse("2026-07-01T08:00:00Z")

private fun step(id: Long, at: Instant = t0, comments: List<Comment> = emptyList(), place: String? = null) =
    Step(id = id, tripId = 1, body = "Text $id", placeName = place, occurredAt = at, updatedAt = at, comments = comments)

private fun trip(vararg steps: Step) = TripDetail(Trip(id = 1, title = "Norway", updatedAt = t0), steps.toList())

private fun comment(id: Long, author: String) = Comment(id, stepId = 1, authorName = author, body = "Nice", createdAt = t0)

class TripCalendarTest {
    @Test fun `calendar days are read in the server's zone`() {
        // 23:30 UTC is already the next day in Berlin.
        assertEquals("2026-07-02", berlin.calendarDay(Instant.parse("2026-07-01T23:30:00Z")))
        assertEquals(Instant.parse("2026-06-30T22:00:00Z"), berlin.startOfDay("2026-07-01"))
        assertNull(berlin.startOfDay("not a day"))
    }

    @Test fun `day one is the start day`() {
        val start = berlin.tripStart("2026-07-01", null)!!
        assertEquals(1, berlin.tripDay(Instant.parse("2026-07-01T21:00:00Z"), start))
        assertEquals(2, berlin.tripDay(Instant.parse("2026-07-01T22:30:00Z"), start))
        // Without a start date, the first step starts the count.
        assertEquals(t0, berlin.tripStart(null, t0))
    }
}

class TripNewsTest {
    @Test fun `nothing is new the first time`() = assertTrue(TripNews.items(null, trip(step(1)), reader = true, ownName = "A").isEmpty())

    @Test fun `readers hear about new steps`() {
        val news = TripNews.items(trip(step(1)), trip(step(1), step(2, place = "Bergen")), reader = true, ownName = "R")
        assertEquals(listOf(2L), news.map { it.stepId })
        assertEquals("Norway · Bergen", news.single().title)
    }

    @Test fun `authors hear about comments from others only`() {
        val old = trip(step(1, comments = listOf(comment(1, "Mia"))))
        val new = trip(step(1, comments = listOf(comment(1, "Mia"), comment(2, "Me"), comment(3, "Ben"))))
        assertEquals(listOf("Ben · Norway"), TripNews.items(old, new, reader = false, ownName = "Me").map { it.title })
    }

    @Test fun `excerpts are one line and short`() {
        assertEquals("a b", TripNews.excerpt("a\nb"))
        assertEquals(10, TripNews.excerpt("x".repeat(50), limit = 10).length)
    }
}

class PhotoSuggestionsTest {
    private fun photo(takenAt: Instant, width: Int = 4000, height: Int = 3000, type: MediaType = MediaType.PHOTO, duration: Long? = null) =
        Photo(id = 1, width = width, height = height, mediaType = type, durationMs = duration, takenAt = takenAt, fileKey = "k")

    @Test fun `the window runs from the start day to the end of the end day`() {
        val window = PhotoSuggestions.window("2026-07-01", "2026-07-03", null, null, berlin, Instant.parse("2026-08-01T00:00:00Z"))!!
        assertEquals(Instant.parse("2026-06-30T22:00:00Z"), window.start)
        assertEquals(Instant.parse("2026-07-03T22:00:00Z"), window.endInclusive)
    }

    @Test fun `an open trip collects until now, at most two weeks past the last step`() {
        val now = Instant.parse("2026-12-01T00:00:00Z")
        val window = PhotoSuggestions.window(null, null, t0, t0, berlin, now)!!
        assertEquals(t0.plus(PhotoSuggestions.openEndGrace), window.endInclusive)
        assertNull(PhotoSuggestions.window(null, null, null, null, berlin, now))
    }

    @Test fun `photos on the server are recognized across time zones`() {
        val candidate = PhotoSuggestions.Candidate("a", t0, 3000, 4000)
        // Two hours of zone offset, turned sideways: the same photo.
        assertTrue(PhotoSuggestions.isSameMedia(candidate, photo(t0.plusSeconds(7200))))
        // A few seconds off: a different photo.
        assertFalse(PhotoSuggestions.isSameMedia(candidate, photo(t0.plusSeconds(7))))
        assertFalse(PhotoSuggestions.isSameMedia(candidate, photo(t0, 100, 100)))
    }

    @Test fun `videos are matched by length`() {
        val candidate = PhotoSuggestions.Candidate("v", t0, 1920, 1080, durationMs = 12_300)
        assertTrue(PhotoSuggestions.isSameMedia(candidate, photo(t0, type = MediaType.VIDEO, duration = 12_000)))
        assertFalse(PhotoSuggestions.isSameMedia(candidate, photo(t0, type = MediaType.VIDEO, duration = 20_000)))
    }

    @Test fun `uploaded and dismissed items are left out`() {
        val candidates = listOf("a", "b", "c").map { PhotoSuggestions.Candidate(it, t0.plusSeconds(it[0].code * 100L), 10, 10) }
        assertEquals(listOf("c"), PhotoSuggestions.filter(candidates, setOf("a", "b"), emptyList()).map { it.id })
    }
}

class UploadQueueTest {
    private fun pendingStep(id: String, serverId: Long? = null, at: Long = 0) = PendingStep(
        clientUuid = id, accountId = "acc", tripId = 1, body = "", placeName = null, lat = null, lon = null,
        occurredAt = at, publish = false, serverStepId = serverId, createdAt = 0,
    )

    private fun upload(id: String, stepUuid: String?, stepId: Long?) = PendingUpload(
        clientUuid = id, accountId = "acc", tripId = 1, stepClientUuid = stepUuid, stepId = stepId, sortIndex = 0,
        assetId = null, fileName = "$id.jpg", posterName = null, thumbnailName = null, mime = "image/jpeg",
        durationMs = null, caption = null, createdAt = 0,
    )

    @Test fun `backs off up to an hour`() {
        assertEquals(30_000, UploadQueue.backoff(1))
        assertEquals(120_000, UploadQueue.backoff(3))
        assertEquals(3_600_000, UploadQueue.backoff(20))
    }

    @Test fun `local steps keep their uploads, server steps get theirs by ID`() {
        val snapshot = UploadQueue.snapshot(
            steps = listOf(pendingStep("old", at = 1), pendingStep("new", at = 2), pendingStep("sent", serverId = 9)),
            uploads = listOf(upload("u1", "new", null), upload("u2", "sent", 9), upload("u3", null, 5)),
        )
        assertEquals(listOf("new", "old"), snapshot.localSteps.map { it.step.clientUuid })
        assertEquals(listOf("u1"), snapshot.localSteps.first().uploads.map { it.clientUuid })
        assertEquals(setOf(9L, 5L), snapshot.uploadsByStepId.keys)
    }
}

class VideoFactsTest {
    @Test fun `reads ISO 6709 positions`() {
        assertEquals(60.3913 to 5.3221, VideoFacts.iso6709("+60.3913+005.3221+012.000/"))
        assertEquals(-33.8688 to 151.2093, VideoFacts.iso6709("-33.8688+151.2093/"))
        assertNull(VideoFacts.iso6709("+95.0+005.0/"))
    }
}
