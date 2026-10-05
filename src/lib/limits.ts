/**
 * Upload limits. Deliberately without `server-only`: the editor checks them in
 * the browser already, so an oversized file doesn't fail at the server only
 * after minutes of uploading.
 *
 * Uploads are streamed to disk (`parseMultipart`) and videos moved into place,
 * so the video limit is about disk space and upload time, not memory. Images
 * are read whole for sharp – 25 MB at most.
 */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 400 * 1024 * 1024;

export const COMMENT_MAX_LENGTH = 1500;
export const NAME_MAX_LENGTH = 60;
