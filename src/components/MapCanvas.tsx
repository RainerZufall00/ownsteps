"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type TripMap from "./TripMap";

export type { MapStep } from "./TripMap";

// MapLibre touches window on import and therefore must not run on the server.
const LazyMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse bg-surface-muted" />
  ),
});

export default function MapCanvas(props: ComponentProps<typeof TripMap>) {
  return <LazyMap {...props} />;
}
