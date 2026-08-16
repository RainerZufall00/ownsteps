"use client";

import { useState } from "react";
import { formatMediaDuration } from "@/lib/format";
import type { ViewPhoto } from "@/lib/view-types";
import Lightbox from "./Lightbox";
import PhotoImg from "./PhotoImg";

/**
 * Legt die Fotos je nach Anzahl unterschiedlich an: ein einzelnes Bild
 * bekommt die volle Breite, mehrere ordnen sich zu einem Raster.
 */
export default function PhotoGrid({
  photos,
  priority = false,
}: {
  photos: ViewPhoto[];
  priority?: boolean;
}) {
  const [openAt, setOpenAt] = useState<number | null>(null);
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
          // Bei drei Fotos bekommt das erste die ganze obere Reihe.
          const wide = photos.length === 3 && index === 0;
          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => setOpenAt(index)}
              className={`group relative overflow-hidden bg-surface-muted ${
                wide ? "col-span-2" : ""
              } ${single ? "" : "aspect-square"}`}
              aria-label={`Foto ${index + 1} von ${photos.length} öffnen`}
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
                    <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-white">
                      <path d="M8 5.5v13l11-6.5z" />
                    </svg>
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
