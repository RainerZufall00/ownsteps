/**
 * Every limit on what users enter or upload, in one place. Deliberately
 * without `server-only`: the forms check the same values in the browser
 * already, and texts show them (see `LIMIT_PARAMS`) – so a limit is changed
 * here and nowhere else.
 *
 * Uploads are streamed to disk (`parseMultipart`) and videos moved into place,
 * so the video limit is about disk space and upload time, not memory. Images
 * are read whole for sharp – 25 MB at most.
 */
const MB = 1024 * 1024;

const MAX_IMAGE_MB = 25;
const MAX_VIDEO_MB = 400;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * MB;
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * MB;

/** Image formats the server decodes; also the cover picker's `accept`. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/tiff",
] as const;

export const COMMENT_MAX_LENGTH = 1500;
export const NAME_MAX_LENGTH = 60;
export const CAPTION_MAX_LENGTH = 500;
export const TRIP_TITLE_MAX_LENGTH = 120;
export const TRIP_SUMMARY_MAX_LENGTH = 500;
export const PASSWORD_MIN_LENGTH = 10;
/** Guessing is braked (services/share.ts), but 4 digits were still too few. */
export const SHARE_PASSWORD_MIN_LENGTH = 8;
/** Steps one request may report as seen (web beacon and app alike). */
export const VIEW_BATCH_MAX = 100;

/** Placeholders every UI text may use, e.g. "at least {passwordMin} characters". */
export const LIMIT_PARAMS = {
  maxImageMb: MAX_IMAGE_MB,
  maxVideoMb: MAX_VIDEO_MB,
  passwordMin: PASSWORD_MIN_LENGTH,
  sharePasswordMin: SHARE_PASSWORD_MIN_LENGTH,
};
