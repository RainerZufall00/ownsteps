/**
 * Obergrenzen für Uploads. Bewusst ohne `server-only`: Der Editor prüft damit
 * schon im Browser, damit eine zu große Datei nicht erst nach Minuten am
 * Server scheitert.
 *
 * Die Grenze fürs Video ist keine Willkür, sondern Speicher: `/api/upload`
 * liest die Datei am Stück in den Arbeitsspeicher (einmal beim Zerlegen des
 * Formulars, einmal als Buffer). Ein 400-MB-Video braucht auf dem Server also
 * kurzzeitig rund ein Gigabyte. Wer mehr will, braucht zuerst mehr RAM.
 */
export const MAX_BILD_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 400 * 1024 * 1024;
