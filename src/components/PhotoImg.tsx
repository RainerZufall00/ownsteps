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
 * The variants are precomputed as WebP, hence no next/image. The tiny
 * placeholder sits underneath as background and fills the area until the
 * actual image has loaded – without any JavaScript.
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
