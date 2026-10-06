import "server-only";

import { z } from "zod";
import { createDocument, type ZodOpenApiOperationObject } from "zod-openapi";
import packageJson from "../../../package.json";
import {
  authorTokenSchema,
  changeFeedSchema,
  commentCreateSchema,
  commentSchema,
  coverUploadSchema,
  infoSchema,
  meSchema,
  mediaUploadSchema,
  oidcExchangeSchema,
  photoPatchSchema,
  photoSchema,
  problemSchema,
  redeemSchema,
  stepCreateSchema,
  stepPatchSchema,
  stepSchema,
  stepViewsSchema,
  tokenRequestSchema,
  tripCreateSchema,
  tripDetailSchema,
  tripListSchema,
  tripPatchSchema,
  tripSchema,
  viewerListSchema,
  viewerTokenSchema,
} from "./schemas";

/**
 * The OpenAPI description of `/api/v1`, served at `/api/v1/openapi.json`.
 * The iOS app generates its client from it (swift-openapi-generator), so a
 * route that isn't listed here doesn't exist for the app.
 */

const secured = [{ bearer: [] }];

const problems = {
  default: {
    description: "Error (RFC 9457 problem details, `code` is stable)",
    content: { "application/problem+json": { schema: problemSchema } },
  },
} as const;

function jsonBody(schema: z.ZodType) {
  return { required: true, content: { "application/json": { schema } } };
}

function multipartBody(schema: z.ZodType) {
  return { required: true, content: { "multipart/form-data": { schema } } };
}

function ok(schema: z.ZodType, description = "OK") {
  return { description, content: { "application/json": { schema } } };
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * zod-openapi writes a nullable field with a format (dates, bounded numbers)
 * as `anyOf: [{ type: "string", format }, { type: "null" }]`. Code generators
 * like swift-openapi-generator drop such fields entirely; the equivalent
 * `type: ["string", "null"]` works everywhere.
 */
function simplifyNullables(node: JsonValue): JsonValue {
  if (Array.isArray(node)) return node.map(simplifyNullables);
  if (node === null || typeof node !== "object") return node;

  const result: { [key: string]: JsonValue } = {};
  for (const [key, value] of Object.entries(node)) result[key] = simplifyNullables(value);

  const variants = result.anyOf;
  if (Array.isArray(variants) && variants.length === 2) {
    const nullIndex = variants.findIndex(
      (v) => v !== null && typeof v === "object" && !Array.isArray(v) && v.type === "null",
    );
    const other = variants[1 - nullIndex];
    if (
      nullIndex !== -1 &&
      other !== null &&
      typeof other === "object" &&
      !Array.isArray(other) &&
      typeof other.type === "string"
    ) {
      const { anyOf: _anyOf, ...rest } = result;
      return { ...other, ...rest, type: [other.type, "null"] };
    }
  }
  return result;
}

const noContent = { description: "No content" };

function op(operation: ZodOpenApiOperationObject): ZodOpenApiOperationObject {
  return { ...operation, responses: { ...operation.responses, ...problems } };
}

const idPath = (name: string) => z.object({ [name]: z.string() });

export function buildOpenApiDocument() {
  const document = createDocument({
    openapi: "3.1.0",
    info: {
      title: "OwnSteps API",
      version: packageJson.version,
      description:
        "API for the OwnSteps apps. Authors authenticate with a device token (`osa_…`), " +
        "readers with a viewer token (`osv_…`) for one trip. Only additive changes happen " +
        "within v1.",
    },
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer" },
      },
    },
    paths: {
      "/api/v1/info": {
        get: op({
          operationId: "getInfo",
          summary: "Server info, sign-in methods and features",
          responses: { "200": ok(infoSchema) },
        }),
      },
      "/api/v1/auth/token": {
        post: op({
          operationId: "createToken",
          summary: "Sign in with email and password",
          requestBody: jsonBody(tokenRequestSchema),
          responses: { "201": ok(authorTokenSchema, "Created") },
        }),
        delete: op({
          operationId: "revokeToken",
          summary: "Sign this device out",
          security: secured,
          responses: { "204": noContent },
        }),
      },
      "/api/v1/auth/oidc/start": {
        get: op({
          operationId: "startOidc",
          summary: "Start OIDC sign-in in a web authentication session",
          description:
            "Redirects to the identity provider. Ends at `ownsteps://auth?code=…&state=…` " +
            "(or `?error=…&state=…`).",
          requestParams: {
            query: z.object({
              code_challenge: z.string().meta({ description: "PKCE S256 challenge of the app" }),
              state: z.string().meta({ description: "Returned unchanged to the app" }),
              device_name: z.string().optional(),
            }),
          },
          responses: { "302": { description: "Redirect to the identity provider" } },
        }),
      },
      "/api/v1/auth/oidc/exchange": {
        post: op({
          operationId: "exchangeOidcCode",
          summary: "Trade the one-time code for a device token",
          requestBody: jsonBody(oidcExchangeSchema),
          responses: { "201": ok(authorTokenSchema, "Created") },
        }),
      },
      "/api/v1/me": {
        get: op({
          operationId: "getMe",
          summary: "Who the token belongs to",
          security: secured,
          responses: { "200": ok(meSchema) },
        }),
      },
      "/api/v1/trips": {
        get: op({
          operationId: "listTrips",
          summary: "Trips visible to the token",
          security: secured,
          responses: { "200": ok(tripListSchema) },
        }),
        post: op({
          operationId: "createTrip",
          summary: "Create a trip (authors)",
          security: secured,
          requestBody: jsonBody(tripCreateSchema),
          responses: { "201": ok(tripSchema, "Created") },
        }),
      },
      "/api/v1/trips/{tripId}": {
        get: op({
          operationId: "getTrip",
          summary: "A trip with its published steps, photos and comments",
          security: secured,
          requestParams: { path: idPath("tripId") },
          responses: { "200": ok(tripDetailSchema) },
        }),
        patch: op({
          operationId: "updateTrip",
          summary: "Change title, dates, summary or sharing (authors)",
          security: secured,
          requestParams: { path: idPath("tripId") },
          requestBody: jsonBody(tripPatchSchema),
          responses: { "200": ok(tripSchema) },
        }),
      },
      "/api/v1/trips/{tripId}/cover": {
        post: op({
          operationId: "uploadCover",
          summary: "Upload the trip's cover image (authors)",
          security: secured,
          requestParams: { path: idPath("tripId") },
          requestBody: multipartBody(coverUploadSchema),
          responses: { "201": ok(photoSchema, "Created") },
        }),
      },
      "/api/v1/trips/{tripId}/steps": {
        post: op({
          operationId: "createStep",
          summary: "Create a step, idempotent via clientUuid (authors)",
          security: secured,
          requestParams: { path: idPath("tripId") },
          requestBody: jsonBody(stepCreateSchema),
          responses: {
            "200": ok(stepSchema, "Already created earlier"),
            "201": ok(stepSchema, "Created"),
          },
        }),
      },
      "/api/v1/trips/{tripId}/viewers": {
        get: op({
          operationId: "listViewers",
          summary: "Readers following the trip in the app (authors)",
          security: secured,
          requestParams: { path: idPath("tripId") },
          responses: { "200": ok(viewerListSchema) },
        }),
        delete: op({
          operationId: "removeAllViewers",
          summary: "Remove every reader's device (authors)",
          security: secured,
          requestParams: { path: idPath("tripId") },
          responses: { "204": noContent },
        }),
      },
      "/api/v1/trips/{tripId}/views": {
        post: op({
          operationId: "recordViews",
          summary:
            "Report steps the reader has seen; counted once per device and step. Authors' views are not recorded.",
          security: secured,
          requestParams: { path: idPath("tripId") },
          requestBody: jsonBody(stepViewsSchema),
          responses: { "204": noContent },
        }),
      },
      "/api/v1/steps/{stepId}": {
        patch: op({
          operationId: "updateStep",
          summary: "Edit a step (authors)",
          security: secured,
          requestParams: { path: idPath("stepId") },
          requestBody: jsonBody(stepPatchSchema),
          responses: { "200": ok(stepSchema) },
        }),
        delete: op({
          operationId: "deleteStep",
          summary: "Delete a step with its photos (authors)",
          security: secured,
          requestParams: { path: idPath("stepId") },
          responses: { "204": noContent },
        }),
      },
      "/api/v1/steps/{stepId}/media": {
        post: op({
          operationId: "uploadMedia",
          summary: "Upload one photo or video, idempotent via clientUuid (authors)",
          security: secured,
          requestParams: { path: idPath("stepId") },
          requestBody: multipartBody(mediaUploadSchema),
          responses: {
            "201": ok(z.object({ photo: photoSchema, step: stepSchema }), "Created"),
          },
        }),
      },
      "/api/v1/steps/{stepId}/comments": {
        post: op({
          operationId: "createComment",
          summary: "Comment on a step",
          security: secured,
          requestParams: { path: idPath("stepId") },
          requestBody: jsonBody(commentCreateSchema),
          responses: { "201": ok(commentSchema, "Created") },
        }),
      },
      "/api/v1/photos/{photoId}": {
        patch: op({
          operationId: "updatePhoto",
          summary: "Change the caption (authors)",
          security: secured,
          requestParams: { path: idPath("photoId") },
          requestBody: jsonBody(photoPatchSchema),
          responses: { "200": ok(photoSchema) },
        }),
        delete: op({
          operationId: "deletePhoto",
          summary: "Delete a photo or video (authors)",
          security: secured,
          requestParams: { path: idPath("photoId") },
          responses: { "204": noContent },
        }),
      },
      "/api/v1/photos/{photoId}/{variant}": {
        get: op({
          operationId: "getPhotoFile",
          summary: "The image (WebP) or video file",
          security: secured,
          requestParams: {
            path: z.object({
              photoId: z.string(),
              variant: z.enum(["thumb", "medium", "large", "video"]),
            }),
          },
          responses: {
            "200": {
              description: "The file; videos support range requests",
              content: {
                "image/webp": { schema: z.string().meta({ format: "binary" }) },
                "video/*": { schema: z.string().meta({ format: "binary" }) },
              },
            },
          },
        }),
      },
      "/api/v1/comments/{commentId}": {
        delete: op({
          operationId: "deleteComment",
          summary: "Delete a comment (authors)",
          security: secured,
          requestParams: { path: idPath("commentId") },
          responses: { "204": noContent },
        }),
      },
      "/api/v1/viewers/redeem": {
        post: op({
          operationId: "redeemShareLink",
          summary: "Follow a trip as a reader via its share link",
          requestBody: jsonBody(redeemSchema),
          responses: { "201": ok(viewerTokenSchema, "Created") },
        }),
      },
      "/api/v1/viewers/me": {
        delete: op({
          operationId: "unfollowTrip",
          summary: "Stop following (viewer token)",
          security: secured,
          responses: { "204": noContent },
        }),
      },
      "/api/v1/viewers/{viewerId}": {
        delete: op({
          operationId: "removeViewer",
          summary: "Remove a reader's device (authors)",
          security: secured,
          requestParams: { path: idPath("viewerId") },
          responses: { "204": noContent },
        }),
      },
      "/api/v1/changes": {
        get: op({
          operationId: "getChanges",
          summary: "Changes since a cursor, for background refresh",
          security: secured,
          requestParams: {
            query: z.object({
              since: z.string().optional().meta({
                description: "Cursor from an earlier call; omit to get the current cursor",
              }),
            }),
          },
          responses: { "200": ok(changeFeedSchema) },
        }),
      },
    },
  });
  return simplifyNullables(document as unknown as JsonValue);
}
