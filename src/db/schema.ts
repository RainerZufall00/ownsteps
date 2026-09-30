import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** Empty for accounts created exclusively via OIDC. */
  passwordHash: text("password_hash"),
  /** `sub` from the ID token, stable even if the email changes. */
  oidcSubject: text("oidc_subject").unique(),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at").notNull().default(now),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  summary: text("summary"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  coverPhotoId: integer("cover_photo_id"),
  shareToken: text("share_token").notNull().unique(),
  shareEnabled: integer("share_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  sharePasswordHash: text("share_password_hash"),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const steps = sqliteTable(
  "steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** Deprecated: the timeline shows the place as heading, not this text. */
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    lat: real("lat"),
    lon: real("lon"),
    placeName: text("place_name"),
    countryCode: text("country_code"),
    /** When it happened (unix ms) – determines the timeline order. */
    occurredAt: integer("occurred_at").notNull(),
    /** Drafts are created when the editor opens and only appear after saving. */
    published: integer("published", { mode: "boolean" })
      .notNull()
      .default(false),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [index("steps_trip_idx").on(t.tripId, t.occurredAt)],
);

export const photos = sqliteTable(
  "photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    stepId: integer("step_id").references(() => steps.id, {
      onDelete: "cascade",
    }),
    /** Directory name below uploads/, holds the derived sizes. */
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name"),
    /** Optional caption, shown in the fullscreen view. */
    caption: text("caption"),
    /** "photo" or "video" – for videos the image sizes are the poster frame. */
    mediaType: text("media_type", { enum: ["photo", "video"] })
      .notNull()
      .default("photo"),
    /** Videos only: length in milliseconds and the file's MIME type. */
    durationMs: integer("duration_ms"),
    videoMime: text("video_mime"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull().default(0),
    takenAt: integer("taken_at"),
    lat: real("lat"),
    lon: real("lon"),
    /** Tiny base64 JPEG used as placeholder while loading. */
    placeholder: text("placeholder"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("photos_step_idx").on(t.stepId, t.sortOrder),
    index("photos_trip_idx").on(t.tripId),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    stepId: integer("step_id")
      .notNull()
      .references(() => steps.id, { onDelete: "cascade" }),
    /** Freely chosen name – comments don't need an account. */
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("comments_step_idx").on(t.stepId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type Step = typeof steps.$inferSelect;
export type Photo = typeof photos.$inferSelect;
