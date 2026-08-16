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
  /** Style-URL des Proxys oder – ohne MapTiler-Key – ein fertiges Style-Objekt. */
  mapStyle: string | StyleSpecification;
  activeStepId?: number | null;
  onSelect?: (stepId: number) => void;
  /** Im Editor: Tippen auf die Karte setzt den Ort des Beitrags. */
  onMapClick?: (lat: number, lon: number) => void;
  className?: string;
  /** Karte in der Übersicht: keine Bedienung, nur Anschauen. */
  static?: boolean;
  /**
   * Ob die Karte dem Inhalt folgen soll. In der Timeline ja – dort wandert
   * die Ansicht mit den Stationen mit. Im Editor nur beim ersten Mal: Wer
   * dort gerade einen Ort sucht, will nicht bei jedem Klick zurückgesetzt
   * werden.
   */
  autoFit?: boolean;
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
    img.src = `/api/photos/${step.coverPhotoId}/thumb`;
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<number, Marker>>(new Map());
  // Merkt sich, auf welche Punkte die Ansicht zuletzt ausgerichtet wurde.
  const lastFitRef = useRef<string | null>(null);
  // In Callbacks von MapLibre soll immer der aktuelle Handler landen.
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

    // Fehler beim Laden von Style oder Kacheln sonst still verschluckt.
    map.on("error", (event) => {
      console.error("[Karte]", event.error?.message ?? event.error);
    });

    // Der Container wechselt auf dem Handy zwischen sichtbar und versteckt –
    // ohne resize() bliebe die Karte auf der alten Größe stehen.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // Karte einmal aufbauen; Daten werden in den Effekten darunter gepflegt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marker und Route aktualisieren, wenn sich die Stationen ändern.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Marker sind gewöhnliche DOM-Elemente und brauchen kein geladenes Style –
    // sie erscheinen deshalb auch dann, wenn die Kacheln nicht durchkommen.
    const seen = new Set<number>();
    steps.forEach((step, index) => {
      seen.add(step.id);
      const existing = markersRef.current.get(step.id);
      if (existing) {
        existing.setLngLat([step.lon, step.lat]);
        return;
      }
      const marker = new Marker({
        element: buildMarker(step, index, step.id === activeStepId, (id) =>
          onSelectRef.current?.(id),
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

    // Die Kamera nur bewegen, wenn sich die Punkte wirklich geändert haben –
    // sonst springt die Ansicht bei jedem Tastendruck im Formular zurück.
    const signature = steps.map((s) => `${s.id}@${s.lat},${s.lon}`).join("|");
    const darfFolgen = autoFit || lastFitRef.current === null;

    if (steps.length > 0 && darfFolgen && signature !== lastFitRef.current) {
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

    // Die Routenlinie ist ein Style-Layer und kann erst dazu, wenn das Style steht.
    const syncRoute = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource("route") as GeoJSONSource | undefined;
      if (source) {
        source.setData(routeGeoJson(steps));
        return;
      }
      map.addSource("route", { type: "geojson", data: routeGeoJson(steps) });
      // Zwei Linien übereinander: ein dunkler Saum trägt die weiße Route auch
      // über hellem Gelände, ohne dass eine Signalfarbe nötig wäre.
      map.addLayer({
        id: "route-saum",
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
    // Je nachdem, wie weit das Style beim Rendern war, greift das eine oder
    // das andere Ereignis – syncRoute darf deshalb mehrfach laufen.
    map.on("load", syncRoute);
    map.on("styledata", syncRoute);
    return () => {
      map.off("load", syncRoute);
      map.off("styledata", syncRoute);
    };
  }, [steps, activeStepId]);

  // Aktive Station hervorheben und sanft anfahren.
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
