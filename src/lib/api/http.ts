import "server-only";

import { ServiceError, type ErrorCode, ERROR_STATUS } from "@/lib/errors";

/**
 * HTTP plumbing for `/api/v1`. Errors go out as `application/problem+json`
 * (RFC 9457) with a stable `type` per error code, so the app can translate
 * them; `title` is an English hint for developers, not UI text.
 */

const PROBLEM_TYPE_PREFIX = "urn:ownsteps:problem:";

function titleFor(code: ErrorCode) {
  const text = code.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function problemResponse(code: string, title: string, status: number, detail?: string) {
  return new Response(
    JSON.stringify({
      type: `${PROBLEM_TYPE_PREFIX}${code}`,
      title,
      status,
      code,
      ...(detail ? { detail } : {}),
    }),
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

export function problem(code: ErrorCode, detail?: string) {
  return problemResponse(code, titleFor(code), ERROR_STATUS[code], detail);
}

export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Runs a handler and turns `ServiceError`s into problem responses. Anything
 * else is a bug: logged, and answered with a generic 500.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ServiceError) return problem(error.code);
    console.error("[api] unexpected error", error);
    return problemResponse("internal", "Internal server error", 500);
  }
}

/** 204 – for deletes and other changes with nothing to report. */
export function noContent() {
  return new Response(null, { status: 204 });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ServiceError("invalid_request");
  }
}

/** Parses a numeric path segment; anything else can't exist. */
export function idParam(value: string, notFound: ErrorCode): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ServiceError(notFound);
  return id;
}

export function toIso(ms: number | null | undefined) {
  return ms === null || ms === undefined ? null : new Date(ms).toISOString();
}
