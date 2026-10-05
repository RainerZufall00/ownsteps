import { z } from "zod";
import { isErrorCode, ServiceError, type ErrorCode } from "./errors";
import {
  CAPTION_MAX_LENGTH,
  COMMENT_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SHARE_PASSWORD_MIN_LENGTH,
  TRIP_SUMMARY_MAX_LENGTH,
  TRIP_TITLE_MAX_LENGTH,
} from "./limits";

/**
 * Input schemas shared by Server Actions and the REST API. Each issue carries
 * an error code as its message, so a failed parse turns straight into a
 * `ServiceError`. Deliberately without `server-only`.
 */

/** Empty or whitespace-only strings count as "not given". */
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null);

/** Calendar date as `<input type="date">` sends it, or nothing. */
const optionalIsoDate = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null)
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    error: "date_invalid",
  });

/** A coordinate from a form field; anything unparsable counts as unset. */
const optionalCoordinate = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  });

/** A caption as stored: trimmed and capped; empty means none. */
export function normalizeCaption(text: string | null | undefined) {
  return text?.trim().slice(0, CAPTION_MAX_LENGTH) || null;
}

function datesInOrder(value: { startDate: string | null; endDate: string | null }) {
  return !(value.startDate && value.endDate && value.endDate < value.startDate);
}

export const tripInput = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, { error: "trip_title_required" })
      .max(TRIP_TITLE_MAX_LENGTH, { error: "trip_title_too_long" }),
    summary: optionalText.refine(
      (value) => value === null || value.length <= TRIP_SUMMARY_MAX_LENGTH,
      { error: "trip_summary_too_long" },
    ),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
  })
  .refine(datesInOrder, { error: "trip_dates_reversed" });

export type TripInput = z.infer<typeof tripInput>;

export const stepInput = z.object({
  body: z.string().trim().default(""),
  placeName: optionalText,
  /** Only the date is adjustable; the time of day stays as it was. */
  occurredDate: optionalIsoDate,
  lat: optionalCoordinate,
  lon: optionalCoordinate,
  /** Captions by photo ID; only photos listed here are touched. */
  captions: z
    .record(z.string(), z.string())
    .default({})
    .transform((captions) =>
      Object.fromEntries(
        Object.entries(captions).map(([id, text]) => [id, normalizeCaption(text) ?? ""]),
      ),
    ),
});

export type StepInput = z.infer<typeof stepInput>;

export const shareInput = z.object({
  enabled: z.boolean(),
  /** New password; empty keeps the current one. */
  password: z
    .string()
    .default("")
    .refine((value) => value === "" || value.length >= SHARE_PASSWORD_MIN_LENGTH, {
      error: "share_password_too_short",
    }),
  removePassword: z.boolean().default(false),
});

export type ShareInput = z.infer<typeof shareInput>;

/** The name a guest comments under – and a reader follows a trip under. */
export const authorNameInput = z
  .string()
  .trim()
  .min(2, { error: "comment_name_missing" })
  .max(NAME_MAX_LENGTH, { error: "comment_name_too_long" });

export const commentInput = z.object({
  authorName: authorNameInput,
  body: z
    .string()
    .trim()
    .min(1, { error: "comment_empty" })
    .max(COMMENT_MAX_LENGTH, { error: "comment_too_long" }),
});

export type CommentInput = z.infer<typeof commentInput>;

const newPassword = z.string().min(PASSWORD_MIN_LENGTH, { error: "password_too_short" });

export const newAccountInput = z.object({
  email: z
    .string()
    .trim()
    .refine((value) => value.includes("@"), { error: "email_invalid" }),
  name: optionalText,
  password: newPassword,
});

export type NewAccountInput = z.infer<typeof newAccountInput>;

export const passwordChangeInput = z.object({
  currentPassword: z.string().default(""),
  newPassword,
});

export const credentialsInput = z.object({
  email: z.string().min(1, { error: "credentials_missing" }),
  password: z.string().min(1, { error: "credentials_missing" }),
});

/**
 * Parses input or throws a `ServiceError` with the first issue's code.
 * Issues without a code of their own (wrong type, missing field) become
 * `invalid_request`.
 */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const message = result.error.issues[0]?.message;
  const code: ErrorCode = isErrorCode(message) ? message : "invalid_request";
  throw new ServiceError(code);
}
