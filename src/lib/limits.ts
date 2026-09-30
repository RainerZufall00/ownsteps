/**
 * Upload limits. Deliberately without `server-only`: the editor checks them in
 * the browser already, so an oversized file doesn't fail at the server only
 * after minutes of uploading.
 *
 * The video limit isn't arbitrary but memory: `/api/upload` reads the file
 * into memory in one piece (once while parsing the form, once as a Buffer). A
 * 400 MB video therefore briefly needs about a gigabyte on the server. Anyone
 * wanting more needs more RAM first.
 */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 400 * 1024 * 1024;

export const COMMENT_MAX_LENGTH = 1500;
export const NAME_MAX_LENGTH = 60;
