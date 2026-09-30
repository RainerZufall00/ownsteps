import "server-only";

import { ServiceError, type ErrorCode, ERROR_STATUS } from "@/lib/errors";

/**
 * HTTP plumbing for `/api/v1`. Errors go out as `application/problem+json`
 * (RFC 9457) with a stable `type` per error code, so the app can translate
 * them; `title` is an English hint for developers, not UI text.
 */

export const PROBLEM_TYPE_PREFIX = "urn:ownsteps:problem:";

function titleFor(code: ErrorCode) {
  const text = code.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function problem(code: ErrorCode, detail?: string) {
  return new Response(
    JSON.stringify({
      type: `${PROBLEM_TYPE_PREFIX}${code}`,
      title: titleFor(code),
      status: ERROR_STATUS[code],
      code,
      ...(detail ? { detail } : {}),
    }),
    {
      status: ERROR_STATUS[code],
      headers: { "Content-Type": "application/problem+json" },
    },
  );
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
    return new Response(
      JSON.stringify({
        type: `${PROBLEM_TYPE_PREFIX}internal`,
        title: "Internal server error",
        status: 500,
        code: "internal",
      }),
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
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
