package de.ownsteps.app.ui

import android.content.Context
import android.text.format.DateFormat
import android.text.format.DateUtils
import de.ownsteps.app.R
import de.ownsteps.app.api.ApiError
import de.ownsteps.app.api.OidcCallback
import de.ownsteps.app.api.ServerAddress
import de.ownsteps.app.api.Trip
import de.ownsteps.app.data.TripCalendar
import de.ownsteps.app.media.MediaPreparation
import de.ownsteps.app.media.Places
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Formatter
import java.util.Locale

/** Turns what went wrong into a sentence for the person holding the phone. */
object ErrorText {
    fun message(context: Context, error: Throwable): String = when (error) {
        is ServerAddress.Invalid -> context.getString(
            when (error.problem) {
                ServerAddress.Problem.EMPTY -> R.string.error_address_empty
                ServerAddress.Problem.INVALID -> R.string.error_address_invalid
                ServerAddress.Problem.INSECURE -> R.string.error_address_insecure
            },
        )
        is ApiError.NotOwnSteps -> context.getString(R.string.error_not_ownsteps)
        is ApiError.Incompatible -> context.getString(R.string.error_incompatible, error.serverVersion)
        is ApiError.Problem -> problem(context, error.code)
        is ApiError.Unexpected -> context.getString(R.string.error_unexpected, error.status)
        is OidcCallback.Problem.Mismatch -> context.getString(R.string.error_oidc_mismatch)
        is OidcCallback.Problem.Failed -> context.getString(
            when (error.reason) {
                "oidc_not_allowed" -> R.string.error_oidc_not_allowed
                "oidc_unverified" -> R.string.error_oidc_unverified
                "oidc_denied" -> R.string.error_oidc_denied
                else -> R.string.error_oidc_failed
            },
        )
        is MediaPreparation.Failed -> when (error.problem) {
            MediaPreparation.Problem.VIDEO_TOO_LARGE -> context.getString(R.string.error_video_too_large_compressed, MediaPreparation.MAX_VIDEO_BYTES.megabytes)
            MediaPreparation.Problem.UNREADABLE -> context.getString(R.string.error_media_unreadable)
        }
        is Places.Failed -> context.getString(
            if (error.problem == Places.Problem.DENIED) R.string.error_location_denied else R.string.error_location_unavailable,
        )
        is IOException -> context.getString(R.string.error_unreachable)
        else -> error.localizedMessage ?: error.toString()
    }

    /** The server's problem codes ([D12]) – and the upload queue's own – in words. */
    fun problem(context: Context, code: String, unknown: ((String) -> String)? = null): String {
        val resource = when (code) {
            "credentials_invalid" -> R.string.problem_credentials_invalid
            "credentials_missing" -> R.string.problem_credentials_missing
            "password_login_disabled" -> R.string.problem_password_login_disabled
            "too_many_attempts" -> R.string.problem_too_many_attempts
            "auth_code_invalid" -> R.string.problem_auth_code_invalid
            "not_signed_in" -> R.string.problem_not_signed_in
            "trip_not_found" -> R.string.problem_trip_not_found
            "trip_not_shared" -> R.string.problem_trip_not_shared
            "share_link_invalid" -> R.string.problem_share_link_invalid
            "share_password_wrong" -> R.string.problem_share_password_wrong
            "comment_name_missing" -> R.string.problem_comment_name_missing
            "comment_name_too_long" -> R.string.problem_comment_name_too_long
            "comment_empty" -> R.string.problem_comment_empty
            "comment_too_long" -> R.string.problem_comment_too_long
            "comment_rate_limited" -> R.string.problem_comment_rate_limited
            "comment_not_found" -> R.string.problem_comment_not_found
            "viewer_not_found" -> R.string.problem_viewer_not_found
            "step_not_found" -> R.string.problem_step_not_found
            "unsupported_format" -> R.string.problem_unsupported_format
            "media_unprocessable" -> R.string.problem_media_unprocessable
            "trip_title_too_long" -> R.string.problem_trip_title_too_long
            "trip_summary_too_long" -> R.string.problem_trip_summary_too_long
            "file_missing" -> R.string.problem_file_missing
            "http_413" -> R.string.problem_http_413
            "network" -> R.string.problem_network
            "image_too_large" -> return context.getString(R.string.problem_image_too_large, MediaPreparation.MAX_IMAGE_BYTES.megabytes)
            "video_too_large" -> return context.getString(R.string.problem_video_too_large, MediaPreparation.MAX_VIDEO_BYTES.megabytes)
            else -> return unknown?.invoke(code) ?: context.getString(R.string.problem_unknown, code)
        }
        return context.getString(resource)
    }

    /** Why an upload is stuck, from its `lastError`. */
    fun upload(context: Context, code: String) = problem(context, code) { context.getString(R.string.problem_upload_failed, it) }

    private val Long.megabytes get() = this / 1024 / 1024
}

/** Dates the way the web shows them, in the server's time zone ([E12]). */
object Dates {
    /** "Tuesday, 12 May" – or with the year. */
    fun day(instant: Instant, calendar: TripCalendar, withYear: Boolean = false): String {
        val locale = Locale.getDefault()
        val pattern = DateFormat.getBestDateTimePattern(locale, if (withYear) "EEEEdMMMMyyyy" else "EEEEdMMMM")
        return DateTimeFormatter.ofPattern(pattern, locale).withZone(calendar.zone).format(instant)
    }

    fun medium(instant: Instant, calendar: TripCalendar): String =
        DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withZone(calendar.zone).format(instant)

    /** "2–12 May 2026": entered dates win over the steps ([E14]). */
    fun tripRange(context: Context, trip: Trip, calendar: TripCalendar): String? {
        val start = calendar.startOfDay(trip.startDate) ?: trip.firstStepAt ?: return null
        val end = calendar.startOfDay(trip.endDate) ?: trip.lastStepAt ?: start
        val (from, to) = if (end < start) end to start else start to end
        if (calendar.isSameDay(from, to)) return medium(from, calendar)
        val flags = DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_YEAR or DateUtils.FORMAT_ABBREV_MONTH
        return DateUtils.formatDateRange(context, Formatter(StringBuilder(), Locale.getDefault()), from.toEpochMilli(), to.toEpochMilli(), flags, calendar.zone.id).toString()
    }

    /** "5 minutes ago". */
    fun relative(instant: Instant): String =
        DateUtils.getRelativeTimeSpanString(instant.toEpochMilli(), System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()
}
