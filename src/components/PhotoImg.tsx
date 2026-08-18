"use client";

import type { ViewPhoto } from "@/lib/view-types";
import { useMediaBase } from "./media-context";

type Props = {
  photo: ViewPhoto;
  variant?: "thumb" | "medium" | "large";
  alt?: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
};

/**
 * Die Varianten sind bereits als WebP vorgerechnet, deshalb kein next/image.
 * Der winzige EXIF-Platzhalter liegt als Hintergrund darunter und füllt die
 * Fläche, bis das eigentliche Bild geladen ist – ganz ohne JavaScript.
 */
export default function PhotoImg({
  photo,
  variant = "medium",
  alt = "",
  className,
  priority = false,
  sizes,
}: Props) {
  const base = useMediaBase();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${base}/${photo.id}/${variant}`}
      alt={alt}
      width={photo.width}
      height={photo.height}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : undefined}
      className={className}
      style={
        photo.placeholder
          ? {
              backgroundImage: `url(${photo.placeholder})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    />
  );
}
