"use client";

import { useState } from "react";
import { formatMediaDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/text";
import type { ViewPhoto } from "@/lib/view-types";
import { PlayIcon } from "./icons";
import Lightbox from "./Lightbox";
import PhotoImg from "./PhotoImg";

/**
 * Lays out the photos depending on their count: a single image gets the full
 * width, several arrange themselves into a grid.
 */
export default function PhotoGrid({
  photos,
  priority = false,
}: {
  photos: ViewPhoto[];
  priority?: boolean;
}) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const { t } = useI18n();
  if (photos.length === 0) return null;

  const visible = photos.slice(0, 4);
  const hidden = photos.length - visible.length;
  const single = photos.length === 1;

  return (
    <>
      <div
        className={
          single
            ? "overflow-hidden rounded-2xl"
            : "grid grid-cols-2 gap-1.5 overflow-hidden rounded-2xl"
        }
      >
        {visible.map((photo, index) => {
          // With three photos the first one gets the whole top row.
          const wide = photos.length === 3 && index === 0;
          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => setOpenAt(index)}
              className={`group relative overflow-hidden bg-surface-muted ${
                wide ? "col-span-2" : ""
              } ${single ? "" : "aspect-square"}`}
              aria-label={fill(t.timeline.openPhoto, { index: index + 1, count: photos.length })}
            >
              <PhotoImg
                photo={photo}
                variant={single ? "medium" : "thumb"}
                priority={priority && index === 0}
                className={
                  single
                    ? "max-h-[70vh] w-full object-cover"
                    : "h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]"
                }
                sizes={single ? "(max-width: 768px) 100vw, 640px" : "300px"}
              />
              {photo.mediaType === "video" && (
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-black/45 backdrop-blur-sm">
                    <PlayIcon className="ml-0.5 h-5 w-5 fill-white" />
                  </span>
                  {photo.durationMs ? (
                    <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                      {formatMediaDuration(photo.durationMs)}
                    </span>
                  ) : null}
                </span>
              )}

              {hidden > 0 && index === visible.length - 1 && (
                <span className="absolute inset-0 grid place-items-center bg-black/45 text-xl font-bold text-white">
                  +{hidden}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {openAt !== null && (
        <Lightbox
          photos={photos}
          startIndex={openAt}
          onClose={() => setOpenAt(null)}
        />
      )}
    </>
  );
}
