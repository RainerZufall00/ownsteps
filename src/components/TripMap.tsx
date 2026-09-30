"use client";

import {
  GeolocateControl,
  LngLatBounds,
  MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMediaBase } from "./media-context";

export type MapStep = {
  id: number;
  title: string;
  lat: number;
  lon: number;
  occurredAt: number;
  coverPhotoId: number | null;
};

type Props = {
  steps: MapStep[];
  /** The proxy's style URL or – without a MapTiler key – a ready-made style object. */
  mapStyle: string | StyleSpecification;
  activeStepId?: number | null;
  onSelect?: (stepId: number) => void;
  /** In the editor: tapping the map sets the step's place. */
  onMapClick?: (lat: number, lon: number) => void;
  className?: string;
  /** Map in the overview: no interaction, just looking. */
  static?: boolean;
  /**
   * Whether the map should follow the content. In the timeline yes – the view
   * moves along with the steps there. In the editor only the first time:
   * someone searching for a place doesn't want to be reset on every click.
   */
  autoFit?: boolean;
  /**
   * Fly to a specific spot – e.g. after a place search hit. Triggered via
   * `key`, so the same spot can be targeted again.
   */
  focusPoint?: { lat: number; lon: number; key: number } | null;
};

function routeGeoJson(steps: MapStep[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features:
      steps.length > 1
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: steps.map((s) => [s.lon, s.lat]),
              },
            },
          ]
        : [],
  };
}

function buildMarker(
  step: MapStep,
  index: number,
  isActive: boolean,
  mediaBase: string,
  onSelect?: (id: number) => void,
) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "ownsteps-marker";
  el.setAttribute("aria-label", step.title || `Station ${index + 1}`);
  el.dataset.stepId = String(step.id);
  el.dataset.active = String(isActive);

  if (step.coverPhotoId) {
    const img = document.createElement("img");
    img.src = `${mediaBase}/${step.coverPhotoId}/thumb`;
    img.alt = "";
    img.loading = "lazy";
    el.appendChild(img);
  } else {
    const span = document.createElement("span");
    span.textContent = String(index + 1);
    el.appendChild(span);
  }

  if (onSelect) {
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect(step.id);
    });
  } else {
    el.style.cursor = "default";
  }

  return el;
}

export default function TripMap({
  steps,
  mapStyle,
  activeStepId,
  onSelect,
  onMapClick,
  className,
  static: isStatic = false,
  autoFit = true,
  focusPoint = null,
}: Props) {
  const mediaBase = useMediaBase();
  const mediaBaseRef = useRef(mediaBase);
  mediaBaseRef.current = mediaBase;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<number, Marker>>(new Map());
  // Remembers which points the view was last fitted to.
  const lastFitRef = useRef<string | null>(null);
  // MapLibre callbacks should always reach the current handler.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyle,
      center: steps.length > 0 ? [steps[0].lon, steps[0].lat] : [10, 48],
      zoom: steps.length > 0 ? 6 : 2,
      attributionControl: { compact: true },
      interactive: !isStatic,
    });
    mapRef.current = map;

    if (!isStatic) {
      map.addControl(
        new NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.addControl(
        new GeolocateControl({ trackUserLocation: false }),
        "top-right",
      );
    }

    map.on("click", (event) => {
      onMapClickRef.current?.(event.lngLat.lat, event.lngLat.lng);
    });

    // Errors loading the style or tiles would otherwise be swallowed silently.
    map.on("error", (event) => {
      console.error("[map]", event.error?.message ?? event.error);
    });

    // On phones the container toggles between visible and hidden – without
    // resize() the map would keep its old size.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // Build the map once; data is maintained in the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers and route when the steps change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Markers are plain DOM elements and need no loaded style – so they show
    // up even when the tiles don't get through.
    const seen = new Set<number>();
    steps.forEach((step, index) => {
      seen.add(step.id);
      const existing = markersRef.current.get(step.id);
      if (existing) {
        existing.setLngLat([step.lon, step.lat]);
        return;
      }
      const marker = new Marker({
        element: buildMarker(
          step,
          index,
          step.id === activeStepId,
          mediaBaseRef.current,
          (id) => onSelectRef.current?.(id),
        ),
        anchor: "bottom",
      })
        .setLngLat([step.lon, step.lat])
        .addTo(map);
      markersRef.current.set(step.id, marker);
    });

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Only move the camera when the points really changed – otherwise the view
    // jumps back on every keystroke in the form.
    const signature = steps.map((s) => `${s.id}@${s.lat},${s.lon}`).join("|");
    const mayFollow = autoFit || lastFitRef.current === null;

    if (steps.length > 0 && mayFollow && signature !== lastFitRef.current) {
      lastFitRef.current = signature;
      if (steps.length === 1) {
        map.jumpTo({ center: [steps[0].lon, steps[0].lat], zoom: 9 });
      } else {
        const bounds = steps.reduce(
          (acc, s) => acc.extend([s.lon, s.lat]),
          new LngLatBounds(
            [steps[0].lon, steps[0].lat],
            [steps[0].lon, steps[0].lat],
          ),
        );
        map.fitBounds(bounds, {
          padding: { top: 60, bottom: 60, left: 40, right: 40 },
          maxZoom: 11,
          duration: 0,
        });
      }
    }

    // The route line is a style layer and can only be added once the style is ready.
    const syncRoute = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource("route") as GeoJSONSource | undefined;
      if (source) {
        source.setData(routeGeoJson(steps));
        return;
      }
      map.addSource("route", { type: "geojson", data: routeGeoJson(steps) });
      // Two lines on top of each other: a dark casing carries the white route
      // even over bright terrain without needing a signal color.
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#000000",
          "line-opacity": 0.35,
          "line-width": 7,
          "line-blur": 1,
        },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": 3.5,
        },
      });
    };

    syncRoute();
    // Depending on how far the style was when rendering, one event or the
    // other fires – so syncRoute may run several times.
    map.on("load", syncRoute);
    map.on("styledata", syncRoute);
    return () => {
      map.off("load", syncRoute);
      map.off("styledata", syncRoute);
    };
  }, [steps, activeStepId]);

  // Fly to a spot on request (place search in the editor).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPoint) return;
    map.easeTo({
      center: [focusPoint.lon, focusPoint.lat],
      zoom: Math.max(map.getZoom(), 11),
      duration: 700,
    });
    // Only the counter decides, otherwise every render would fly again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPoint?.key]);

  // Highlight the active step and ease towards it.
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      marker.getElement().dataset.active = String(id === activeStepId);
    }
    const map = mapRef.current;
    const active = steps.find((s) => s.id === activeStepId);
    if (map && active && !isStatic) {
      map.easeTo({
        center: [active.lon, active.lat],
        duration: 600,
        zoom: Math.max(map.getZoom(), 7),
      });
    }
  }, [activeStepId, steps, isStatic]);

  return <div ref={containerRef} className={className} />;
}
