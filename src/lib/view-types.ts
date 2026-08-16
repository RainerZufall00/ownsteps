/** Serialisierbare Formen, die von Server- an Client-Komponenten gehen. */

export type ViewPhoto = {
  id: number;
  width: number;
  height: number;
  placeholder: string | null;
};

export type ViewStep = {
  id: number;
  title: string;
  body: string;
  lat: number | null;
  lon: number | null;
  placeName: string | null;
  occurredAt: number;
  photos: ViewPhoto[];
};

export type ViewTrip = {
  id: number;
  title: string;
  summary: string | null;
};

export function toViewStep(step: {
  id: number;
  title: string;
  body: string;
  lat: number | null;
  lon: number | null;
  placeName: string | null;
  occurredAt: number;
  photos: ViewPhoto[];
}): ViewStep {
  return {
    id: step.id,
    title: step.title,
    body: step.body,
    lat: step.lat,
    lon: step.lon,
    placeName: step.placeName,
    occurredAt: step.occurredAt,
    photos: step.photos.map((p) => ({
      id: p.id,
      width: p.width,
      height: p.height,
      placeholder: p.placeholder,
    })),
  };
}
