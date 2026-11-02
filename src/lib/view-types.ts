import type { Comment, Photo, Step, Trip } from "@/db/schema";

/**
 * Serializable shapes passed from server to client components, and the
 * mappers that make them. Only the fields needed for display – storage_key,
 * GPS & co. stay on the server.
 */

export type ViewPhoto = Pick<
  Photo,
  "id" | "width" | "height" | "placeholder" | "caption" | "durationMs"
> & {
  /** For "video" the image sizes show the poster frame, the file sits next to them. */
  mediaType: "photo" | "video";
};

export type ViewComment = Pick<Comment, "id" | "authorName" | "body" | "createdAt" | "parentId"> & {
  /** Written with an author's account, not by a guest or reader. */
  fromAuthor: boolean;
};

/** The row a `ViewComment` is made from. */
type CommentRow = Omit<ViewComment, "fromAuthor"> & Pick<Comment, "userId">;

export type ViewStep = Pick<Step, "id" | "body" | "lat" | "lon" | "placeName" | "occurredAt"> & {
  photos: ViewPhoto[];
  comments: ViewComment[];
};

export type ViewTrip = Pick<Trip, "id" | "title" | "summary"> & {
  /** ISO date ("2026-07-01"), set by hand – determines the first trip day. */
  startDate: string | null;
  /** ISO date, set by hand – the end of the date range ([E14]). */
  endDate: string | null;
};

/** A place search hit (`/api/geocode/search`). */
export type PlaceHit = { id: string; name: string; lat: number; lon: number };

/** A looked-up place name (`/api/geocode`). */
export type PlaceInfo = { placeName: string | null; countryCode: string | null };

/** What `/api/upload` answers the web editor. */
export type UploadResult = {
  photos: ViewPhoto[];
  /** Files that didn't make it, with the reason in the user's language. */
  failed: { name: string; reason: string }[];
  /** What the step took over from the media. */
  derived: {
    lat: number | null;
    lon: number | null;
    occurredAt: number | null;
    placeName: string | null;
  };
};

export function toViewPhoto(photo: ViewPhoto): ViewPhoto {
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    placeholder: photo.placeholder,
    caption: photo.caption,
    mediaType: photo.mediaType,
    durationMs: photo.durationMs,
  };
}

export function toViewComment(comment: CommentRow): ViewComment {
  return {
    id: comment.id,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt,
    parentId: comment.parentId,
    fromAuthor: comment.userId !== null,
  };
}

/** Each comment with its answers. An answer whose comment is gone stands alone. */
export function commentThreads(comments: ViewComment[]) {
  const ids = new Set(comments.map((comment) => comment.id));
  const isAnswer = (comment: ViewComment) =>
    comment.parentId !== null && ids.has(comment.parentId);
  return comments
    .filter((comment) => !isAnswer(comment))
    .map((comment) => ({
      comment,
      answers: comments.filter((other) => isAnswer(other) && other.parentId === comment.id),
    }));
}

export function toViewStep(
  step: Omit<ViewStep, "comments"> & { comments?: CommentRow[] },
): ViewStep {
  return {
    id: step.id,
    body: step.body,
    lat: step.lat,
    lon: step.lon,
    placeName: step.placeName,
    occurredAt: step.occurredAt,
    photos: step.photos.map(toViewPhoto),
    comments: (step.comments ?? []).map(toViewComment),
  };
}

export function toViewTrip(trip: ViewTrip): ViewTrip {
  return {
    id: trip.id,
    title: trip.title,
    summary: trip.summary,
    startDate: trip.startDate,
    endDate: trip.endDate,
  };
}
