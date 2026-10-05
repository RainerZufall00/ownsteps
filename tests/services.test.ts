import { describe, expect, it } from "vitest";
import type { Trip } from "@/db/schema";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { createSession, createUser, getCurrentUser } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { messageFor } from "@/lib/messages";
import type { TripAccess } from "@/lib/share";
import { getStep, getTrip } from "@/lib/trips";
import { authenticate, changePassword, createFirstAccount } from "@/lib/services/accounts";
import { postComment } from "@/lib/services/comments";
import { addMediaToStep, type IncomingMedia } from "@/lib/services/media";
import { saveStep, startStep } from "@/lib/services/steps";
import {
  createTripFor,
  deleteTripConfirmed,
  setCoverPhoto,
  updateSharing,
} from "@/lib/services/trips";
import { makeJpeg } from "./helpers/exif";

async function author() {
  return createUser({ email: "a@example.com", name: "A", password: "long enough pw" });
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy(
    (error) => error instanceof ServiceError && error.code === code,
  );
}

function jpegFile(name: string, data: Buffer, type = "image/jpeg"): IncomingMedia {
  return { name, type, size: data.length, read: async () => data };
}

describe("trips", () => {
  it("validates title and date range", async () => {
    const user = await author();
    await expectCode(createTripFor(user.id, { title: "  " }), "trip_title_required");
    await expectCode(
      createTripFor(user.id, { title: "X", startDate: "2026-07-20", endDate: "2026-07-01" }),
      "trip_dates_reversed",
    );
    await expectCode(
      createTripFor(user.id, { title: "X", startDate: "01.07.2026" }),
      "date_invalid",
    );
    const trip = await createTripFor(user.id, {
      title: " Norway ",
      summary: "",
      startDate: "2026-07-01",
      endDate: "",
    });
    expect(trip).toMatchObject({ title: "Norway", summary: null, endDate: null });
  });

  it("only deletes after the exact title was typed", async () => {
    const user = await author();
    const trip = await createTripFor(user.id, { title: "Norway" });
    await expect(deleteTripConfirmed(trip.id, "norway")).rejects.toSatisfy(
      (error) =>
        error instanceof ServiceError &&
        messageFor(error.code, error.params).includes("„Norway“"),
    );
    await deleteTripConfirmed(trip.id, " Norway ");
    expect(await getTrip(trip.id)).toBeNull();
  });

  it("refuses another trip's photo as cover", async () => {
    const user = await author();
    const norway = await createTripFor(user.id, { title: "Norway" });
    const iceland = await createTripFor(user.id, { title: "Iceland" });
    const step = await startStep(iceland.id, user.id);
    const { photos } = await addMediaToStep(step.id, [
      jpegFile("a.jpg", await makeJpeg(200, 100)),
    ]);
    await expectCode(setCoverPhoto(norway.id, photos[0].id), "photo_not_found");
    await setCoverPhoto(iceland.id, photos[0].id);
    expect((await getTrip(iceland.id))?.coverPhotoId).toBe(photos[0].id);
  });

  it("sets, keeps and removes the share password", async () => {
    const user = await author();
    const trip = await createTripFor(user.id, { title: "Norway" });
    await expectCode(
      updateSharing(trip.id, { enabled: true, password: "fjord" }),
      "share_password_too_short",
    );
    await updateSharing(trip.id, { enabled: true, password: "fjordland" });
    const hash = (await getTrip(trip.id))!.sharePasswordHash;
    expect(hash).toBeTruthy();

    // An empty password field keeps the current one.
    await updateSharing(trip.id, { enabled: true, password: "" });
    expect((await getTrip(trip.id))!.sharePasswordHash).toBe(hash);

    await updateSharing(trip.id, { enabled: false, removePassword: true });
    expect(await getTrip(trip.id)).toMatchObject({
      shareEnabled: false,
      sharePasswordHash: null,
    });
  });
});

describe("steps", () => {
  it("refuses to save an empty step", async () => {
    const user = await author();
    const trip = await createTripFor(user.id, { title: "Norway" });
    const step = await startStep(trip.id, user.id);
    await expectCode(saveStep(step.id, { body: "  " }), "step_empty");
  });

  it("changes the date but keeps the time of day", async () => {
    const user = await author();
    const trip = await createTripFor(user.id, { title: "Norway" });
    const step = await startStep(trip.id, user.id);
    const before = new Date(step.occurredAt);

    await saveStep(step.id, { body: "Fjords", occurredDate: "2026-07-04" });
    const after = new Date((await getStep(step.id))!.occurredAt);
    expect([after.getFullYear(), after.getMonth(), after.getDate()]).toEqual([2026, 6, 4]);
    expect(after.getHours()).toBe(before.getHours());
    expect(after.getMinutes()).toBe(before.getMinutes());
  });

  it("saves captions only for the step's own photos", async () => {
    const user = await author();
    const trip = await createTripFor(user.id, { title: "Norway" });
    const step = await startStep(trip.id, user.id);
    const { photos } = await addMediaToStep(step.id, [
      jpegFile("a.jpg", await makeJpeg(200, 100)),
    ]);
    await saveStep(step.id, {
      body: "x",
      captions: { [photos[0].id]: "  Sunset  ", 999999: "foreign" },
    });
    expect((await getStep(step.id))!.photos[0].caption).toBe("Sunset");
  });
});

describe("media", () => {
  it("takes place and time from the first photo and publishes the step", async () => {
    const user = await author();
    const trip = await createTripFor(user.id, { title: "Norway" });
    const step = await startStep(trip.id, user.id);

    const result = await addMediaToStep(step.id, [
      jpegFile(
        "bergen.jpg",
        await makeJpeg(200, 100, {
          lat: 60.39,
          lon: 5.32,
          dateTimeOriginal: "2025:07:01 08:00:00",
        }),
      ),
    ]);

    expect(result.failed).toEqual([]);
    expect(result.derived.lat).toBeCloseTo(60.39, 3);
    const saved = (await getStep(step.id))!;
    expect(saved.published).toBe(true);
    expect(saved.occurredAt).toBe(new Date(2025, 6, 1, 8, 0, 0).getTime());
  });

  it("reports oversized, unsupported and poster-less files without aborting", async () => {
    const user = await author();
    const trip = await createTripFor(user.id, { title: "Norway" });
    const step = await startStep(trip.id, user.id);
    const tooBig: IncomingMedia = {
      name: "huge.jpg",
      type: "image/jpeg",
      size: 26 * 1024 * 1024,
      read: async () => {
        throw new Error("must not be read");
      },
    };

    const result = await addMediaToStep(step.id, [
      tooBig,
      jpegFile("doc.pdf", Buffer.from("%PDF"), "application/pdf"),
      { name: "clip.mp4", type: "video/mp4", size: 10, read: async () => Buffer.from("v") },
      jpegFile("ok.jpg", await makeJpeg(200, 100)),
    ]);

    expect(result.failed).toEqual([
      { name: "huge.jpg", code: "image_too_large" },
      { name: "doc.pdf", code: "unsupported_format" },
      { name: "clip.mp4", code: "poster_missing" },
    ]);
    expect(result.photos).toHaveLength(1);
  });
});

describe("comments", () => {
  async function commentable(access: TripAccess["kind"]) {
    const user = await author();
    const trip = await createTripFor(user.id, { title: "Norway" });
    const step = await startStep(trip.id, user.id);
    const resolveAccess = async (_trip: Trip) => ({ kind: access }) as TripAccess;
    return { trip, step, resolveAccess };
  }

  it("lets guests comment and trims the input", async () => {
    const { trip, step, resolveAccess } = await commentable("guest");
    const { comment } = await postComment({
      tripId: trip.id,
      stepId: step.id,
      raw: { authorName: "  Grandma ", body: " Beautiful! " },
      clientKey: "guest-1",
      resolveAccess,
    });
    expect(comment).toMatchObject({ authorName: "Grandma", body: "Beautiful!" });
  });

  it("refuses visitors without access", async () => {
    const { trip, step, resolveAccess } = await commentable("locked");
    await expectCode(
      postComment({
        tripId: trip.id,
        stepId: step.id,
        raw: { authorName: "Eve", body: "Hi" },
        clientKey: "eve",
        resolveAccess,
      }),
      "trip_not_shared",
    );
  });

  it("refuses steps of other trips", async () => {
    const { trip, step, resolveAccess } = await commentable("guest");
    const other = await createTripFor(trip.createdBy!, { title: "Iceland" });
    const foreignStep = await startStep(other.id, trip.createdBy!);
    expect(foreignStep.id).not.toBe(step.id);
    await expectCode(
      postComment({
        tripId: trip.id,
        stepId: foreignStep.id,
        raw: { authorName: "Eve", body: "Hi" },
        clientKey: "eve",
        resolveAccess,
      }),
      "step_not_found",
    );
  });

  it("brakes after five comments per minute and sender", async () => {
    const { trip, step, resolveAccess } = await commentable("guest");
    const send = () =>
      postComment({
        tripId: trip.id,
        stepId: step.id,
        raw: { authorName: "Spammer", body: "again" },
        clientKey: "spammer",
        resolveAccess,
      });
    for (let i = 0; i < 5; i++) await send();
    await expectCode(send(), "comment_rate_limited");
  });
});

describe("brakes", () => {
  it("locks an account after repeated failures, from any address", async () => {
    await author();
    for (let i = 0; i < 10; i++) {
      // A new address every time, as with a faked X-Forwarded-For.
      await expectCode(authenticate({ email: "a@example.com", password: "nope" }, `ip-${i}`), "credentials_invalid");
    }
    await expectCode(
      authenticate({ email: "a@example.com", password: "long enough pw" }, "ip-new"),
      "too_many_attempts",
    );
    // Other accounts aren't affected.
    await createUser({ email: "b@example.com", name: "B", password: "long enough pw" });
    expect((await authenticate({ email: "b@example.com", password: "long enough pw" }, "ip-new")).email).toBe(
      "b@example.com",
    );
  });

  it("brakes guessing a share password per trip", async () => {
    const { unlockShare } = await import("@/lib/services/share");
    const user = await author();
    const trip = await createTripFor(user.id, { title: "Norway" });
    await updateSharing(trip.id, { enabled: true, password: "fjordland" });
    const token = (await getTrip(trip.id))!.shareToken;

    for (let i = 0; i < 20; i++) {
      await expectCode(unlockShare(token, `guess-${i}`, `ip-${i}`), "share_password_wrong");
    }
    await expectCode(unlockShare(token, "fjordland", "ip-new"), "too_many_attempts");
  }, 30_000); // 20 bcrypt comparisons

  it("brakes one address however many accounts it tries", async () => {
    for (let i = 0; i < 10; i++) {
      await expectCode(authenticate({ email: `u${i}@example.com`, password: "nope" }, "one-ip"), "credentials_invalid");
    }
    await expectCode(authenticate({ email: "z@example.com", password: "nope" }, "one-ip"), "too_many_attempts");
  });
});

describe("accounts", () => {
  it("opens setup only while no account exists", async () => {
    await createFirstAccount({ email: "first@example.com", password: "long enough pw" });
    await expectCode(
      createFirstAccount({ email: "second@example.com", password: "long enough pw" }),
      "account_exists",
    );
  });

  it("gives no hint which part of the credentials was wrong", async () => {
    await author();
    await expectCode(authenticate({ email: "a@example.com", password: "nope" }, "client"), "credentials_invalid");
    await expectCode(authenticate({ email: "x@example.com", password: "nope" }, "client"), "credentials_invalid");
    await expectCode(authenticate({ email: "", password: "" }, "client"), "credentials_missing");
    expect((await authenticate({ email: "A@example.com", password: "long enough pw" }, "client")).email).toBe(
      "a@example.com",
    );
  });

  it("requires the current password to change it", async () => {
    const user = await author();
    await expectCode(
      changePassword(user, { currentPassword: "wrong", newPassword: "another long pw" }, "client"),
      "current_password_wrong",
    );
    await changePassword(
      user,
      { currentPassword: "long enough pw", newPassword: "another long pw" },
      "client",
    );
    await authenticate({ email: "a@example.com", password: "another long pw" }, "client");
  });

  it("brakes guessing the current password like a login", async () => {
    const user = await author();
    for (let attempt = 0; attempt < 10; attempt++) {
      await expectCode(
        changePassword(
          user,
          { currentPassword: "wrong", newPassword: "another long pw" },
          `client-${attempt}`,
        ),
        "current_password_wrong",
      );
    }
    // Even the right password from a fresh address waits now – and so does the login.
    await expectCode(
      changePassword(user, { currentPassword: "long enough pw", newPassword: "another long pw" }, "fresh"),
      "too_many_attempts",
    );
    await expectCode(
      authenticate({ email: "a@example.com", password: "long enough pw" }, "fresh"),
      "too_many_attempts",
    );
  });

  it("ends every other web session when the password changes", async () => {
    const user = await author();
    await createSession(user.id); // another browser
    await createSession(user.id); // this one – its cookie is in the jar now

    await changePassword(
      user,
      { currentPassword: "long enough pw", newPassword: "another long pw" },
      "client",
    );

    expect(await db.select().from(sessions)).toHaveLength(1);
    expect((await getCurrentUser())?.id).toBe(user.id);
  });
});
