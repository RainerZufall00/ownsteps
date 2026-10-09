package de.ownsteps.app.data

import de.ownsteps.app.api.Photo
import de.ownsteps.app.api.Step
import de.ownsteps.app.api.TripDetail
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlin.math.abs

/** Dates the way the web shows them: in the server's time zone, trip days counted from the start ([E14]). */
data class TripCalendar(val zone: ZoneId) {
    /** "2026-07-01" as the start of that day in the server's zone – not UTC midnight, which shifts the day. */
    fun startOfDay(calendarDay: String?): Instant? =
        calendarDay?.let { runCatching { LocalDate.parse(it) }.getOrNull() }?.atStartOfDay(zone)?.toInstant()

    /** The inverse: the calendar day an instant falls on there. */
    fun calendarDay(instant: Instant): String = localDate(instant).toString()

    fun localDate(instant: Instant): LocalDate = instant.atZone(zone).toLocalDate()

    /** Day 1 is the trip's start; a step on the start day is day 1. */
    fun tripDay(of: Instant, start: Instant): Int =
        ChronoUnit.DAYS.between(localDate(start), localDate(of)).toInt() + 1

    /** Where day counting starts: the entered start date, else the first step. */
    fun tripStart(startDate: String?, firstStepAt: Instant?): Instant? = startOfDay(startDate) ?: firstStepAt

    fun isSameDay(a: Instant, b: Instant) = localDate(a) == localDate(b)
}

/**
 * What background refresh tells the user about ([D16]): readers hear about
 * new steps, authors about comments from others. Decided by comparing the
 * trip as the device last saw it with the fresh copy – the change feed
 * doesn't say who did something, and edits shouldn't ring.
 */
object TripNews {
    data class Item(val kind: Kind, val tripId: Long, val stepId: Long, val title: String, val body: String)

    enum class Kind { STEP, COMMENT }

    fun items(old: TripDetail?, new: TripDetail, reader: Boolean, ownName: String): List<Item> {
        // Never seen before: nothing to compare with, so nothing is "new".
        old ?: return emptyList()
        val title = new.trip.title
        if (reader) {
            val known = old.steps.map(Step::id).toSet()
            return new.steps.filter { it.id !in known }.map { step ->
                Item(Kind.STEP, new.id, step.id, step.placeName?.let { "$title · $it" } ?: title, excerpt(step.body))
            }
        }
        val known = old.steps.flatMap { it.comments }.map { it.id }.toSet()
        return new.steps.flatMap { step ->
            step.comments.filter { it.id !in known && it.authorName != ownName }.map {
                Item(Kind.COMMENT, new.id, step.id, "${it.authorName} · $title", excerpt(it.body))
            }
        }
    }

    fun excerpt(text: String, limit: Int = 180): String {
        val flat = text.lines().joinToString(" ")
        return if (flat.length > limit) flat.take(limit - 1) + "…" else flat
    }
}

/**
 * Library photos from a trip's period that aren't in the trip yet ([D22]).
 * The media store queries live in the app; this decides which count.
 */
object PhotoSuggestions {
    data class Candidate(
        val id: String,
        val takenAt: Instant,
        val width: Int,
        val height: Int,
        val durationMs: Long? = null,
    )

    /** How long after its last step a trip without an end date still collects photos. */
    val openEndGrace: Duration = Duration.ofDays(14)

    /**
     * The trip's period: the entered dates if any, else its steps ([E14]).
     * Without an end date it runs until now, at most two weeks past the last step.
     */
    fun window(
        startDate: String?,
        endDate: String?,
        firstStepAt: Instant?,
        lastStepAt: Instant?,
        calendar: TripCalendar,
        now: Instant,
    ): ClosedRange<Instant>? {
        val start = calendar.startOfDay(startDate)
            ?: firstStepAt?.let { calendar.startOfDay(calendar.calendarDay(it)) }
            ?: return null
        val end = calendar.startOfDay(endDate)?.let { calendar.localDate(it).plusDays(1).atStartOfDay(calendar.zone).toInstant() }
            ?: minOf(now, maxOf(lastStepAt ?: start, start).plus(openEndGrace))
        return if (end > start) start..end else null
    }

    /**
     * What's left after taking out [known] items – uploaded from this device
     * or dismissed – and what looks like a photo the server already has.
     */
    fun filter(candidates: List<Candidate>, known: Set<String>, serverPhotos: List<Photo>): List<Candidate> =
        candidates.filter { candidate -> candidate.id !in known && serverPhotos.none { isSameMedia(candidate, it) } }

    /**
     * Photos uploaded some other way aren't in `uploaded_asset`. They're
     * recognized by capture time plus size (photos) or length (videos). The
     * server reads EXIF time in its own zone ([E12]), so times may differ by
     * whole quarter hours of zone offset; the seconds must match.
     */
    fun isSameMedia(candidate: Candidate, photo: Photo): Boolean {
        val takenAt = photo.takenAt ?: return false
        val difference = abs(Duration.between(candidate.takenAt, takenAt).toMillis()) / 1000.0
        if (difference > 14 * 3600) return false
        val offByZone = difference % 900
        if (offByZone > 1.5 && offByZone < 898.5) return false
        if (photo.isVideo) {
            val ours = candidate.durationMs ?: return false
            val theirs = photo.durationMs ?: return false
            return abs(ours - theirs) <= 1000
        }
        return (candidate.width == photo.width && candidate.height == photo.height) ||
            (candidate.width == photo.height && candidate.height == photo.width)
    }
}
