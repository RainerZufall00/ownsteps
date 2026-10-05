/**
 * Poster frames for video uploads, made in the browser – it can decode the
 * video anyway, and that keeps ffmpeg out of the Docker image. Browser-only.
 */

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((settle) => canvas.toBlob(settle, "image/jpeg", quality));
}

/** Plain fallback image in case none can be extracted from the video. */
async function fallbackPoster() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#2a2622";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 64px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Video", canvas.width / 2, canvas.height / 2 + 22);
  }
  const blob = await canvasToJpeg(canvas, 0.8);
  return new File([blob ?? new Blob()], "poster.jpg", { type: "image/jpeg" });
}

/**
 * Grabs a poster frame and the length from a video.
 *
 * The order matters: first wait for the metadata, then seek to a position.
 * Waiting for `loadeddata` led nowhere, because with `preload="metadata"` no
 * image data is loaded at all – the upload then ran into a timeout without
 * ever starting.
 */
export async function extractPoster(file: File): Promise<{ poster: File; durationMs: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  const waitFor = (eventName: string, limit: number) =>
    new Promise<boolean>((settle) => {
      const timer = window.setTimeout(() => settle(false), limit);
      video.addEventListener(
        eventName,
        () => {
          window.clearTimeout(timer);
          settle(true);
        },
        { once: true },
      );
      video.addEventListener(
        "error",
        () => {
          window.clearTimeout(timer);
          settle(false);
        },
        { once: true },
      );
    });

  try {
    const hasMetadata = await waitFor("loadedmetadata", 20000);
    const durationMs =
      hasMetadata && Number.isFinite(video.duration)
        ? Math.round(video.duration * 1000)
        : 0;

    if (hasMetadata && video.videoWidth > 0) {
      // Seek in a bit – the first frame is often black. The browser loads
      // exactly the section needed for that.
      const seekTime = Number.isFinite(video.duration)
        ? Math.min(1, video.duration / 3)
        : 0;
      video.currentTime = seekTime;
      await waitFor("seeked", 10000);

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas
        .getContext("2d")
        ?.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await canvasToJpeg(canvas, 0.85);
      if (blob && blob.size > 0) {
        return {
          poster: new File([blob], "poster.jpg", { type: "image/jpeg" }),
          durationMs,
        };
      }
    }

    // No poster frame possible (e.g. with a codec the browser can't
    // decode). The video should be uploaded anyway.
    console.warn("[upload] No poster frame from the video, using fallback");
    return { poster: await fallbackPoster(), durationMs };
  } finally {
    URL.revokeObjectURL(url);
  }
}
