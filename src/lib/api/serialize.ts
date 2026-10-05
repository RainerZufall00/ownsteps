import "server-only";

import { createHash } from "node:crypto";

import type { Change, Comment, Photo, Trip, User, ViewerDevice } from "@/db/schema";
import { summarizeSteps, type StepWithPhotos, type TripStats } from "@/lib/trips";
import { toIso } from "./http";
import type {
  ChangeDto,
  CommentDto,
  PhotoDto,
  StepDto,
  TripDetailDto,
  TripDto,
  UserDto,
  ViewerDto,
} from "./schemas";

/**
 * Database rows → API shapes. Like `view-types.ts` for the web UI, only what
 * clients need leaves the server: no storage keys, no password hashes, and
 * share settings only for authors.
 */

export function photoDto(photo: Photo): PhotoDto {
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    placeholder: photo.placeholder,
    caption: photo.caption,
    mediaType: photo.mediaType,
    durationMs: photo.durationMs,
    takenAt: toIso(photo.takenAt),
    lat: photo.lat,
    lon: photo.lon,
    clientUuid: photo.clientUuid,
    fileKey: fileKey(photo.storageKey),
  };
}

/**
 * Stands for the photo's files: new with every upload, so a client can cache
 * by it even when a restored server hands out the same photo ID again. A
 * hash, because the storage key is a folder name on the server's disk.
 */
function fileKey(storageKey: string) {
  return createHash("sha256").update(storageKey).digest("hex").slice(0, 16);
}

export function commentDto(comment: Comment): CommentDto {
  return {
    id: comment.id,
    stepId: comment.stepId,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: toIso(comment.createdAt)!,
  };
}

export function stepDto(step: StepWithPhotos): StepDto {
  return {
    id: step.id,
    tripId: step.tripId,
    clientUuid: step.clientUuid,
    body: step.body,
    placeName: step.placeName,
    countryCode: step.countryCode,
    lat: step.lat,
    lon: step.lon,
    occurredAt: toIso(step.occurredAt)!,
    updatedAt: toIso(step.updatedAt)!,
    photos: step.photos.map(photoDto),
    comments: step.comments.map(commentDto),
  };
}

export function tripDto(
  trip: Trip,
  stats: TripStats,
  share: { url: string } | null,
  cover: Photo | null,
): TripDto {
  return {
    id: trip.id,
    title: trip.title,
    summary: trip.summary,
    startDate: trip.startDate,
    endDate: trip.endDate,
    coverPhotoId: stats.coverPhotoId,
    stepCount: stats.stepCount,
    photoCount: stats.photoCount,
    firstStepAt: toIso(stats.firstStepAt),
    lastStepAt: toIso(stats.lastStepAt),
    updatedAt: toIso(trip.updatedAt)!,
    ...(share
      ? {
          share: {
            enabled: trip.shareEnabled,
            url: share.url,
            hasPassword: Boolean(trip.sharePasswordHash),
          },
        }
      : {}),
    ...(cover ? { cover: photoDto(cover) } : {}),
  };
}

export function tripDetailDto(
  trip: Trip,
  steps: StepWithPhotos[],
  share: { url: string } | null,
  cover: Photo | null,
): TripDetailDto {
  return {
    ...tripDto(trip, summarizeSteps(trip, steps), share, cover),
    steps: steps.map(stepDto),
  };
}

export function userDto(user: User): UserDto {
  return { id: user.id, name: user.name, email: user.email };
}

export function viewerDto(device: ViewerDevice): ViewerDto {
  return {
    id: device.id,
    tripId: device.tripId,
    name: device.name,
    deviceName: device.deviceName,
    createdAt: toIso(device.createdAt)!,
    lastSeenAt: toIso(device.lastSeenAt),
  };
}

export function changeDto(change: Change): ChangeDto {
  return {
    seq: change.seq,
    tripId: change.tripId,
    entity: change.entity,
    entityId: change.entityId,
    op: change.op,
    at: toIso(change.createdAt)!,
  };
}
