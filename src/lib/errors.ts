/**
 * Error codes shared by services, Server Actions and (later) the REST API.
 *
 * Services never produce user-facing text – they throw a code, and each
 * surface translates it: the web UI via `messages.ts`, the API as the `type`
 * of a problem+json response. Deliberately without `server-only`, so the
 * codes can travel to the client.
 */
export const ERROR_STATUS = {
  not_signed_in: 401,
  trip_not_found: 404,
  step_not_found: 404,
  photo_not_found: 404,
  share_link_invalid: 404,
  trip_not_shared: 403,
  trip_title_required: 400,
  trip_title_too_long: 400,
  trip_summary_too_long: 400,
  trip_dates_reversed: 400,
  date_invalid: 400,
  trip_delete_confirmation: 400,
  step_empty: 400,
  share_password_too_short: 400,
  share_password_wrong: 400,
  email_invalid: 400,
  email_taken: 409,
  password_too_short: 400,
  current_password_wrong: 400,
  account_exists: 409,
  credentials_missing: 400,
  credentials_invalid: 401,
  comment_name_missing: 400,
  comment_name_too_long: 400,
  comment_empty: 400,
  comment_too_long: 400,
  comment_rate_limited: 429,
  no_file: 400,
  image_too_large: 413,
  video_too_large: 413,
  unsupported_format: 415,
  poster_missing: 400,
  media_unprocessable: 422,
  invalid_request: 400,
  author_only: 403,
  auth_code_invalid: 400,
  password_login_disabled: 403,
  oidc_disabled: 404,
  too_many_attempts: 429,
  comment_not_found: 404,
  viewer_not_found: 404,
  immich_not_connected: 400,
  immich_url_invalid: 400,
  immich_unreachable: 502,
  immich_key_invalid: 400,
  immich_failed: 502,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class ServiceError extends Error {
  readonly code: ErrorCode;
  readonly params: Record<string, string>;

  constructor(code: ErrorCode, params: Record<string, string> = {}) {
    super(code);
    this.name = "ServiceError";
    this.code = code;
    this.params = params;
  }

  get status() {
    return ERROR_STATUS[this.code];
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && value in ERROR_STATUS;
}
