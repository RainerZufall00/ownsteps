/** Serializable shapes passed from server to client components. */

export type ViewPhoto = {
  id: number;
  width: number;
  height: number;
  placeholder: string | null;
  caption: string | null;
  /** For "video" the image sizes show the poster frame, the file sits next to them. */
  mediaType: "photo" | "video";
  durationMs: number | null;
};

export type ViewComment = {
  id: number;
  authorName: string;
  body: string;
  createdAt: number;
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
  comments: ViewComment[];
};

export type ViewTrip = {
  id: number;
  title: string;
  summary: string | null;
  /** ISO date ("2026-07-01"), set by hand – determines the first trip day. */
  startDate: string | null;
};

/** Only the fields needed for display – keeps storage_key, GPS & co. on the server. */
export function toViewPhoto(p: {
  id: number;
  width: number;
  height: number;
  placeholder: string | null;
  caption: string | null;
  mediaType: "photo" | "video";
  durationMs: number | null;
}): ViewPhoto {
  return {
    id: p.id,
    width: p.width,
    height: p.height,
    placeholder: p.placeholder,
    caption: p.caption,
    mediaType: p.mediaType,
    durationMs: p.durationMs,
  };
}

export function toViewStep(step: {
  id: number;
  title: string;
  body: string;
  lat: number | null;
  lon: number | null;
  placeName: string | null;
  occurredAt: number;
  photos: ViewPhoto[];
  comments?: ViewComment[];
}): ViewStep {
  return {
    id: step.id,
    title: step.title,
    body: step.body,
    lat: step.lat,
    lon: step.lon,
    placeName: step.placeName,
    occurredAt: step.occurredAt,
    photos: step.photos.map(toViewPhoto),
    comments: (step.comments ?? []).map((c) => ({
      id: c.id,
      authorName: c.authorName,
      body: c.body,
      createdAt: c.createdAt,
    })),
  };
}
