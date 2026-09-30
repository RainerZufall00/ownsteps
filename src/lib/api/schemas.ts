import "zod-openapi";
import { z } from "zod";

/**
 * Shapes of `/api/v1`. The response schemas document what the serializers
 * in `serialize.ts` produce (their types are derived from these), the request
 * schemas are parsed by the routes. Both feed the OpenAPI document, from
 * which the iOS app generates its client.
 */

const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();

// ── Responses ───────────────────────────────────────────────────────────

export const photoSchema = z
  .object({
    id: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
    /** Tiny JPEG as data URI for a blur-up while loading. */
    placeholder: z.string().nullable(),
    caption: z.string().nullable(),
    mediaType: z.enum(["photo", "video"]),
    durationMs: z.number().int().nullable(),
    takenAt: isoDateTime.nullable(),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
    clientUuid: z.string().nullable(),
  })
  .meta({
    id: "Photo",
    description:
      "A photo or video. Files: GET /api/v1/photos/{id}/{thumb|medium|large|video}.",
  });

export const commentSchema = z
  .object({
    id: z.number().int(),
    stepId: z.number().int(),
    authorName: z.string(),
    body: z.string(),
    createdAt: isoDateTime,
  })
  .meta({ id: "Comment" });

export const stepSchema = z
  .object({
    id: z.number().int(),
    tripId: z.number().int(),
    clientUuid: z.string().nullable(),
    body: z.string(),
    placeName: z.string().nullable(),
    countryCode: z.string().nullable(),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
    occurredAt: isoDateTime,
    updatedAt: isoDateTime,
    photos: z.array(photoSchema),
    comments: z.array(commentSchema),
  })
  .meta({
    id: "Step",
    description: "Steps are returned oldest first, like the data model; the app reverses for display.",
  });

export const shareSchema = z
  .object({
    enabled: z.boolean(),
    /** The trip's share link – also the invite link for readers. */
    url: z.string(),
    hasPassword: z.boolean(),
  })
  .meta({ id: "Share", description: "Only included for authors." });

export const tripSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    summary: z.string().nullable(),
    startDate: isoDate.nullable(),
    endDate: isoDate.nullable(),
    coverPhotoId: z.number().int().nullable(),
    stepCount: z.number().int(),
    photoCount: z.number().int(),
    firstStepAt: isoDateTime.nullable(),
    lastStepAt: isoDateTime.nullable(),
    updatedAt: isoDateTime,
    share: shareSchema.optional(),
  })
  .meta({ id: "Trip" });

export const tripDetailSchema = tripSchema
  .extend({ steps: z.array(stepSchema) })
  .meta({ id: "TripDetail" });

export const tripListSchema = z
  .object({ items: z.array(tripSchema), nextCursor: z.string().nullable() })
  .meta({ id: "TripList" });

export const userSchema = z
  .object({ id: z.number().int(), name: z.string(), email: z.string() })
  .meta({ id: "User" });

export const viewerSchema = z
  .object({
    id: z.number().int(),
    tripId: z.number().int(),
    name: z.string(),
    deviceName: z.string().nullable(),
    createdAt: isoDateTime,
    lastSeenAt: isoDateTime.nullable(),
  })
  .meta({ id: "Viewer" });

export const viewerListSchema = z
  .object({ items: z.array(viewerSchema), nextCursor: z.string().nullable() })
  .meta({ id: "ViewerList" });

export const meSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("author"), user: userSchema }),
    z.object({ kind: z.literal("viewer"), viewer: viewerSchema }),
  ])
  .meta({ id: "Me" });

export const authorTokenSchema = z
  .object({ token: z.string(), user: userSchema })
  .meta({ id: "AuthorToken" });

export const viewerTokenSchema = z
  .object({ token: z.string(), viewer: viewerSchema, trip: tripSchema })
  .meta({ id: "ViewerToken" });

export const changeSchema = z
  .object({
    seq: z.number().int(),
    tripId: z.number().int(),
    entity: z.enum(["trip", "step", "photo", "comment"]),
    entityId: z.number().int(),
    /** Deleting a trip or step implies its children. */
    op: z.enum(["upsert", "delete"]),
    at: isoDateTime,
  })
  .meta({ id: "Change" });

export const changeFeedSchema = z
  .object({
    /** Pass as `since` next time. */
    cursor: z.number().int(),
    hasMore: z.boolean(),
    changes: z.array(changeSchema),
  })
  .meta({ id: "ChangeFeed" });

export const infoSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    apiVersion: z.literal(1),
    /** The oldest app version this server works with. */
    minAppVersion: z.string(),
    /** False until the first account exists – setup happens in the web UI. */
    setupComplete: z.boolean(),
    auth: z.object({
      password: z.boolean(),
      oidc: z.boolean(),
      oidcLabel: z.string().nullable(),
    }),
    features: z.array(z.string()),
  })
  .meta({ id: "Info" });

export const problemSchema = z
  .object({
    type: z.string().meta({ example: "urn:ownsteps:problem:trip_not_found" }),
    title: z.string(),
    status: z.number().int(),
    code: z.string(),
    detail: z.string().optional(),
  })
  .meta({ id: "Problem", description: "RFC 9457 problem details." });

// ── Requests ────────────────────────────────────────────────────────────

export const tokenRequestSchema = z
  .object({
    email: z.string(),
    password: z.string(),
    deviceName: z.string().max(100),
  })
  .meta({ id: "TokenRequest" });

export const oidcExchangeSchema = z
  .object({ code: z.string(), codeVerifier: z.string().min(43).max(128) })
  .meta({ id: "OidcExchange" });

export const tripCreateSchema = z
  .object({
    title: z.string(),
    summary: z.string().nullish(),
    startDate: isoDate.nullish(),
    endDate: isoDate.nullish(),
  })
  .meta({ id: "TripCreate" });

export const tripPatchSchema = z
  .object({
    title: z.string().optional(),
    summary: z.string().nullish(),
    startDate: isoDate.nullish(),
    endDate: isoDate.nullish(),
    /** Switch sharing on or off. The share password stays web-only. */
    shareEnabled: z.boolean().optional(),
  })
  .meta({ id: "TripPatch" });

export const stepCreateSchema = z
  .object({
    /** UUID chosen by the app; sending the same one again returns the existing step. */
    clientUuid: z.uuid().optional(),
    body: z.string().default(""),
    placeName: z.string().nullish(),
    lat: z.number().min(-90).max(90).nullish(),
    lon: z.number().min(-180).max(180).nullish(),
    occurredAt: isoDateTime.optional(),
    /** False keeps the step a draft until its first photo arrives. */
    publish: z.boolean().default(true),
  })
  .meta({ id: "StepCreate" });

export const stepPatchSchema = z
  .object({
    body: z.string().optional(),
    placeName: z.string().nullish(),
    lat: z.number().min(-90).max(90).nullish(),
    lon: z.number().min(-180).max(180).nullish(),
    /** Changes the date only; the time of day from the photos is kept. */
    occurredDate: isoDate.optional(),
  })
  .meta({ id: "StepPatch" });

export const photoPatchSchema = z
  .object({ caption: z.string().max(500).nullable() })
  .meta({ id: "PhotoPatch" });

export const commentCreateSchema = z
  .object({
    body: z.string(),
    /** Ignored – authors comment under their account name, viewers under theirs. */
    authorName: z.string().optional(),
  })
  .meta({ id: "CommentCreate" });

export const redeemSchema = z
  .object({
    /** The share link, or just its token. */
    shareLink: z.string(),
    password: z.string().optional(),
    /** Shown to the authors and used for comments. */
    name: z.string(),
    deviceName: z.string().max(100).optional(),
  })
  .meta({ id: "Redeem" });

export const mediaUploadSchema = z
  .object({
    file: z.string().meta({ format: "binary", description: "Photo or video, one per request." }),
    poster: z
      .string()
      .meta({ format: "binary", description: "Videos only: JPEG poster frame." })
      .optional(),
    durationMs: z.string().meta({ description: "Videos only: length in ms." }).optional(),
    clientUuid: z.string().meta({ description: "Makes retries idempotent." }).optional(),
  })
  .meta({ id: "MediaUpload" });

export const coverUploadSchema = z
  .object({ file: z.string().meta({ format: "binary" }) })
  .meta({ id: "CoverUpload" });

export type PhotoDto = z.infer<typeof photoSchema>;
export type CommentDto = z.infer<typeof commentSchema>;
export type StepDto = z.infer<typeof stepSchema>;
export type TripDto = z.infer<typeof tripSchema>;
export type TripDetailDto = z.infer<typeof tripDetailSchema>;
export type ViewerDto = z.infer<typeof viewerSchema>;
export type UserDto = z.infer<typeof userSchema>;
export type ChangeDto = z.infer<typeof changeSchema>;
export type InfoDto = z.infer<typeof infoSchema>;
