"use client";

import { useMemo, useRef, useState } from "react";
import { PinIcon, LocateIcon } from "@/components/icons";
import MapCanvas from "@/components/MapCanvas";
import { useI18n } from "@/lib/i18n/client";
import type { MapStyleConfig } from "@/lib/map";
import type { PlaceHit, PlaceInfo } from "@/lib/view-types";

export type Place = { name: string; lat: number | null; lon: number | null };

/**
 * The step's place: a name with search suggestions, the device's location as
 * a lifeline, and a map to tap. Controlled – uploads set the place too.
 */
export default function PlaceField({
  place,
  onChange,
  mapStyle,
  markerPhotoId,
}: {
  place: Place;
  onChange: (place: Place) => void;
  mapStyle: MapStyleConfig;
  /** Shown in the marker. */
  markerPhotoId: number | null;
}) {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lon: number; key: number } | null>(
    null,
  );
  const searchTimer = useRef<number | undefined>(undefined);
  const { name, lat, lon } = place;

  /** Typing starts the search without firing on every keystroke. */
  function onNameInput(value: string) {
    onChange({ ...place, name: value });
    window.clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(value)}`);
        if (!response.ok) return;
        const data = (await response.json()) as { hits: PlaceHit[] };
        setSuggestions(data.hits ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  /** Adopt a suggestion: name, coordinates and map section. */
  function pick(hit: PlaceHit) {
    window.clearTimeout(searchTimer.current);
    onChange({ name: hit.name, lat: hit.lat, lon: hit.lon });
    setFocusPoint({ lat: hit.lat, lon: hit.lon, key: Date.now() });
    setSuggestions([]);
    setLocating(null);
  }

  /** A pin set on the map or by the device; the name follows if there's none. */
  async function pickPosition(nextLat: number, nextLon: number) {
    onChange({ name, lat: nextLat, lon: nextLon });
    setFocusPoint({ lat: nextLat, lon: nextLon, key: Date.now() });
    if (name.trim()) return;
    try {
      const response = await fetch(`/api/geocode?lat=${nextLat}&lon=${nextLon}`);
      if (!response.ok) return;
      const info = (await response.json()) as PlaceInfo;
      if (info.placeName) onChange({ name: info.placeName, lat: nextLat, lon: nextLon });
    } catch {
      // Without a place name the pin is set anyway.
    }
  }

  /**
   * Lifeline for photos without GPS – iOS strips the position when sharing,
   * depending on the route. Whoever is still on site simply takes it from the
   * device.
   */
  function takeDeviceLocation() {
    if (!navigator.geolocation) {
      setLocating(t.stepEditor.noGeolocation);
      return;
    }
    setLocating(t.stepEditor.locating);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(null);
        void pickPosition(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        setLocating(
          error.code === error.PERMISSION_DENIED
            ? t.stepEditor.locationDenied
            : t.stepEditor.locationFailed,
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  // Without a stable reference the map would get new data on every keystroke
  // and reset its view.
  const mapSteps = useMemo(
    () =>
      lat !== null && lon !== null
        ? [{ id: 0, label: t.stepEditor.thisStep, lat, lon, coverPhotoId: markerPhotoId }]
        : [],
    [lat, lon, markerPhotoId, t],
  );

  return (
    <div>
      <label className="label" htmlFor="placeName">
        {t.stepEditor.place}
      </label>

      <div className="relative">
        <input
          id="placeName"
          name="placeName"
          value={name}
          onChange={(event) => onNameInput(event.target.value)}
          autoComplete="off"
          className="field pr-10"
          placeholder={t.stepEditor.placePlaceholder}
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-faint">
            {t.stepEditor.searching}
          </span>
        )}

        {suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
            {suggestions.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => pick(hit)}
                  className="flex w-full items-start gap-2 px-4 py-2.5 text-left text-[15px] transition hover:bg-surface-muted"
                >
                  <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  {hit.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={takeDeviceLocation}
          className="btn btn-secondary px-4 py-2 text-sm"
        >
          <LocateIcon />
          {t.stepEditor.myLocation}
        </button>

        {lat !== null && (
          <button
            type="button"
            onClick={() => onChange({ name, lat: null, lon: null })}
            className="btn btn-ghost px-3 py-2 text-sm"
          >
            {t.stepEditor.removePlace}
          </button>
        )}

        <span className="text-[13px] text-ink-soft">
          {locating ??
            (lat === null ? t.stepEditor.noPlace : `${lat.toFixed(5)}, ${lon?.toFixed(5)}`)}
        </span>
      </div>

      <div className="relative mt-2 h-56 overflow-hidden rounded-2xl border border-line">
        <MapCanvas
          steps={mapSteps}
          mapStyle={mapStyle}
          onMapClick={pickPosition}
          autoFit={false}
          focusPoint={focusPoint}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
