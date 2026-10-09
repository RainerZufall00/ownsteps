package de.ownsteps.app.api

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import java.time.Instant
import java.time.OffsetDateTime

/**
 * The parts of `/api/v1` (see the server's `openapi.json`) the app uses.
 * Unknown fields are ignored – the API is only ever extended ([D13]) – and
 * nulls are left out when sending, so a `null` in a patch keeps the value
 * on the server while `""` clears it.
 */
val ApiJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
}

/** ISO-8601 with milliseconds and a zone ("…T08:30:00.000Z"), as the server writes it. */
object InstantSerializer : KSerializer<Instant> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("Instant", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: Instant) = encoder.encodeString(value.toString())
    override fun deserialize(decoder: Decoder): Instant = OffsetDateTime.parse(decoder.decodeString()).toInstant()
}

typealias Timestamp = @Serializable(InstantSerializer::class) Instant

@Serializable
data class Info(
    val name: String,
    val version: String,
    val apiVersion: Int,
    val minAppVersion: String,
    val setupComplete: Boolean,
    val timeZone: String,
    val auth: AuthMethods,
    val features: List<String> = emptyList(),
)

@Serializable
data class AuthMethods(val password: Boolean, val oidc: Boolean, val oidcLabel: String? = null)

@Serializable
data class User(val id: Long, val name: String, val email: String)

@Serializable
data class AuthorToken(val token: String, val user: User)

/** Only included for authors. */
@Serializable
data class Share(val enabled: Boolean, val url: String, val hasPassword: Boolean)

@Serializable
enum class MediaType {
    @SerialName("photo") PHOTO,
    @SerialName("video") VIDEO,
}

/** A photo or video. Files: `GET /api/v1/photos/{id}/{variant}`. */
@Serializable
data class Photo(
    val id: Long,
    val width: Int,
    val height: Int,
    val placeholder: String? = null,
    val caption: String? = null,
    val mediaType: MediaType = MediaType.PHOTO,
    val durationMs: Long? = null,
    val takenAt: Timestamp? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val clientUuid: String? = null,
    val fileKey: String,
) {
    val isVideo get() = mediaType == MediaType.VIDEO
}

/** The sizes the server keeps per photo; for videos the images show the poster frame. */
enum class Variant(val path: String) {
    /** 480 px – grids and map markers. */
    THUMB("thumb"),
    /** 1280 px – cards; kept for offline reading ([D22]). */
    MEDIUM("medium"),
    /** 2400 px – full screen. */
    LARGE("large"),
    VIDEO("video"),
}

@Serializable
data class Trip(
    val id: Long,
    val title: String,
    val summary: String? = null,
    /** Calendar days ("2026-07-01") in the server's time zone. */
    val startDate: String? = null,
    val endDate: String? = null,
    val coverPhotoId: Long? = null,
    val stepCount: Int = 0,
    val photoCount: Int = 0,
    val firstStepAt: Timestamp? = null,
    val lastStepAt: Timestamp? = null,
    val updatedAt: Timestamp,
    val share: Share? = null,
    val cover: Photo? = null,
)

/**
 * A trip with its steps, oldest first ([E13]). On the wire it's one flat
 * object; here the trip part is a plain [Trip], so lists, forms and the
 * trip screen share one type instead of copying fields between two.
 */
@Serializable(TripDetailSerializer::class)
data class TripDetail(val trip: Trip, val steps: List<Step>) {
    val id get() = trip.id
}

object TripDetailSerializer : KSerializer<TripDetail> {
    override val descriptor: SerialDescriptor = JsonObject.serializer().descriptor

    override fun deserialize(decoder: Decoder): TripDetail {
        val json = (decoder as JsonDecoder).json
        val element = decoder.decodeJsonElement().jsonObject
        return TripDetail(
            trip = json.decodeFromJsonElement(Trip.serializer(), element),
            steps = element["steps"]?.let { json.decodeFromJsonElement(StepList, it) } ?: emptyList(),
        )
    }

    override fun serialize(encoder: Encoder, value: TripDetail) {
        val json = (encoder as JsonEncoder).json
        val trip = json.encodeToJsonElement(Trip.serializer(), value.trip).jsonObject
        encoder.encodeJsonElement(buildJsonObject {
            trip.forEach { (key, element) -> put(key, element) }
            put("steps", json.encodeToJsonElement(StepList, value.steps))
        })
    }

    private val StepList = kotlinx.serialization.builtins.ListSerializer(Step.serializer())
}

@Serializable
data class Step(
    val id: Long,
    val tripId: Long,
    val clientUuid: String? = null,
    val body: String = "",
    val placeName: String? = null,
    val countryCode: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val occurredAt: Timestamp,
    val updatedAt: Timestamp,
    val photos: List<Photo> = emptyList(),
    val comments: List<Comment> = emptyList(),
    /** Authors only: how many readers saw the step ([D28]). */
    val viewCount: Int? = null,
) {
    val hasPlace get() = lat != null && lon != null
}

@Serializable
data class Comment(val id: Long, val stepId: Long, val authorName: String, val body: String, val createdAt: Timestamp)

@Serializable
data class Viewer(
    val id: Long,
    val tripId: Long,
    val name: String,
    val deviceName: String? = null,
    val createdAt: Timestamp,
    val lastSeenAt: Timestamp? = null,
)

@Serializable
data class ViewerToken(val token: String, val viewer: Viewer, val trip: Trip)

@Serializable
data class ImmichConnection(
    val connected: Boolean,
    val url: String? = null,
    val name: String? = null,
    val problem: String? = null,
)

@Serializable
data class ImmichStatus(
    val connected: Boolean,
    val state: State = State.IDLE,
    val done: Int = 0,
    val total: Int = 0,
    val albumUrl: String? = null,
    val error: String? = null,
) {
    @Serializable
    enum class State {
        @SerialName("idle") IDLE,
        @SerialName("running") RUNNING,
        @SerialName("done") DONE,
        @SerialName("failed") FAILED,
    }
}

@Serializable
data class ChangeFeed(val cursor: Long, val hasMore: Boolean, val changes: List<Change>) {
    /** Only which trip changed matters – it's fetched again as a whole. */
    @Serializable
    data class Change(val tripId: Long)
}

@Serializable
data class Page<T>(val items: List<T>)

@Serializable
internal data class ProblemBody(val code: String)

// Request bodies

@Serializable
internal data class TokenRequest(val email: String, val password: String, val deviceName: String)

@Serializable
internal data class OidcExchange(val code: String, val codeVerifier: String)

/** Creating a trip (title required) or patching it (everything optional). */
@Serializable
data class TripFields(
    val title: String? = null,
    val summary: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val shareEnabled: Boolean? = null,
)

@Serializable
internal data class StepCreate(
    val clientUuid: String,
    val body: String,
    val placeName: String?,
    val lat: Double?,
    val lon: Double?,
    val occurredAt: Timestamp,
    val publish: Boolean,
)

@Serializable
data class StepPatch(
    val body: String? = null,
    val placeName: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    /** Swaps only the day; the server keeps the time of day ([E14]). */
    val occurredDate: String? = null,
)

@Serializable
internal data class CommentCreate(val body: String)

@Serializable
internal data class PhotoPatch(val caption: String)

@Serializable
internal data class Redeem(val shareLink: String, val password: String?, val name: String, val deviceName: String)

@Serializable
internal data class StepViews(val stepIds: List<Long>)

@Serializable
internal data class ImmichConnect(val url: String, val apiKey: String)

@Serializable
internal data class CreatedMedia(val photo: Created)

@Serializable
internal data class Created(val id: Long)
