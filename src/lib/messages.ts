import type { ErrorCode } from "./errors";

/**
 * User-facing texts for the error codes. German for now; this is the spot the
 * UI translation (roadmap phase 6) will hook into.
 */
const MESSAGES: Record<ErrorCode, string> = {
  not_signed_in: "Nicht angemeldet",
  trip_not_found: "Reise nicht gefunden.",
  step_not_found: "Beitrag nicht gefunden.",
  photo_not_found: "Foto nicht gefunden.",
  share_link_invalid: "Dieser Link ist nicht mehr gültig.",
  trip_not_shared: "Diese Reise ist nicht freigegeben.",
  trip_title_required: "Die Reise braucht einen Namen.",
  trip_dates_reversed: "Das Ende der Reise liegt vor ihrem Beginn.",
  date_invalid: "Bitte ein gültiges Datum angeben.",
  trip_delete_confirmation: "Zum Löschen bitte „{title}“ genau so eintippen.",
  step_empty: "Bitte einen Ort, Text oder ein Foto hinzufügen.",
  share_password_too_short: "Das Passwort braucht mindestens 8 Zeichen.",
  share_password_wrong: "Das Passwort stimmt nicht.",
  email_invalid: "Bitte eine gültige E-Mail angeben.",
  email_taken: "Diese E-Mail-Adresse wird bereits verwendet.",
  password_too_short: "Das Passwort braucht mindestens 10 Zeichen.",
  current_password_wrong: "Das aktuelle Passwort stimmt nicht.",
  account_exists: "Es existiert bereits ein Account.",
  credentials_missing: "Bitte E-Mail und Passwort eingeben.",
  credentials_invalid: "E-Mail oder Passwort stimmt nicht.",
  comment_name_missing: "Bitte einen Namen angeben.",
  comment_name_too_long: "Der Name ist zu lang.",
  comment_empty: "Der Kommentar ist leer.",
  comment_too_long: "Der Kommentar ist zu lang.",
  comment_rate_limited: "Bitte einen Moment warten und dann erneut senden.",
  no_file: "Keine Datei erhalten",
  image_too_large: "Datei ist größer als 25 MB.",
  video_too_large: "Video ist größer als 400 MB.",
  unsupported_format: "Kein unterstütztes Format.",
  poster_missing: "Vorschaubild fehlt – Video konnte nicht gelesen werden.",
  media_unprocessable:
    "Bild konnte nicht verarbeitet werden (bei iPhone-Fotos hilft das Format „Maximale Kompatibilität“).",
  invalid_request: "Ungültige Anfrage",
  author_only: "Nur für angemeldete Autoren.",
  auth_code_invalid: "Die Anmeldung ist abgelaufen. Bitte erneut versuchen.",
  password_login_disabled: "Die Anmeldung mit Passwort ist abgeschaltet.",
  oidc_disabled: "Die Anmeldung über OIDC ist nicht eingerichtet.",
  too_many_attempts: "Zu viele Versuche. Bitte einen Moment warten.",
  comment_not_found: "Kommentar nicht gefunden.",
  viewer_not_found: "Lesegerät nicht gefunden.",
};

export function messageFor(code: ErrorCode, params: Record<string, string> = {}) {
  return MESSAGES[code].replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? "");
}
