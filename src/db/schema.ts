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
  /** Leer bei Accounts, die ausschließlich über OIDC angelegt wurden. */
  passwordHash: text("password_hash"),
  /** `sub` aus dem ID-Token, stabil auch wenn sich die E-Mail ändert. */
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
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    lat: real("lat"),
    lon: real("lon"),
    placeName: text("place_name"),
    countryCode: text("country_code"),
    /** Zeitpunkt des Erlebnisses (unix ms) – bestimmt die Reihenfolge der Timeline. */
    occurredAt: integer("occurred_at").notNull(),
    /** Entwürfe entstehen beim Öffnen des Editors und tauchen erst nach dem Speichern auf. */
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
    /** Verzeichnisname unterhalb von uploads/, enthält die abgeleiteten Größen. */
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull().default(0),
    takenAt: integer("taken_at"),
    lat: real("lat"),
    lon: real("lon"),
    /** Winziges base64-JPEG als Platzhalter beim Laden. */
    placeholder: text("placeholder"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("photos_step_idx").on(t.stepId, t.sortOrder),
    index("photos_trip_idx").on(t.tripId),
  ],
);

export type User = typeof users.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type Step = typeof steps.$inferSelect;
export type Photo = typeof photos.$inferSelect;
