"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/text";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/limits";
import type { UploadResult } from "@/lib/view-types";
import { extractPoster } from "@/lib/video-poster";

type Progress = {
  done: number;
  total: number;
  /** Share of the current file sent so far, 0…1. */
  current: number;
  /** Shown instead of the counter, e.g. while a video is prepared. */
  hint?: string;
};

/** The upload failed on the way, not at the server. */
class ConnectionLost extends Error {}

/** One file to `/api/upload`, with progress – `fetch` can't report that. */
function send(body: FormData, onProgress: (fraction: number) => void) {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let answer: (UploadResult & { error?: never }) | { error?: string } | null = null;
      try {
        answer = JSON.parse(xhr.responseText);
      } catch {
        // E.g. a proxy's error page.
      }
      if (xhr.status >= 200 && xhr.status < 300 && answer && "photos" in answer) {
        resolve(answer);
      } else {
        reject(new Error(answer?.error || `HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new ConnectionLost());
    xhr.send(body);
  });
}

/**
 * The editor's uploads. Files go out one by one: that keeps memory use on
 * the VPS small and shows honest progress along the way. `onUploaded` gets
 * each file's result.
 */
export function useMediaUpload(stepId: number, onUploaded: (result: UploadResult) => void) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const report = (...lines: string[]) => setProblems((current) => [...current, ...lines]);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setProblems([]);
    const total = files.length;
    setProgress({ done: 0, total, current: 0 });

    for (const [index, file] of files.entries()) {
      try {
        const isVideo = file.type.startsWith("video/");
        const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (file.size > limit) {
          // Catch it before uploading: otherwise a hundred megabytes travel
          // over the network only for the server to reject them.
          report(
            fill(t.stepEditor.tooLarge, {
              name: file.name,
              size: Math.round(file.size / 1024 / 1024),
              limit: Math.round(limit / 1024 / 1024),
            }),
          );
          continue;
        }

        const body = new FormData();
        body.append("stepId", String(stepId));
        body.append("files", file);

        if (isVideo) {
          // The poster frame takes a moment – without a hint this looks like a
          // hang, because the progress bar is still at zero.
          setProgress({ done: index, total, current: 0, hint: t.stepEditor.preparingVideo });
          const { poster, durationMs } = await extractPoster(file);
          body.append("poster0", poster);
          body.append("duration0", String(durationMs));
        }

        const result = await send(body, (current) => setProgress({ done: index, total, current }));
        report(...result.failed.map((f) => `${f.name}: ${f.reason}`));
        onUploaded(result);
      } catch (error) {
        const reason =
          error instanceof ConnectionLost
            ? t.stepEditor.connectionLost
            : error instanceof Error
              ? error.message
              : t.stepEditor.uploadFailed;
        report(`${file.name}: ${reason}`);
      } finally {
        setProgress({ done: index + 1, total, current: 0 });
      }
    }

    setProgress(null);
  }

  const percent = progress
    ? Math.round(((progress.done + progress.current) / progress.total) * 100)
    : 0;

  return { upload, progress, percent, problems };
}
