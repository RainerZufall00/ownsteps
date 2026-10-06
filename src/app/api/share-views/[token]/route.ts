import { cookies } from "next/headers";
import { stepViewsSchema } from "@/lib/api/schemas";
import { cookieOptions } from "@/lib/cookies";
import { randomToken } from "@/lib/crypto";
import { getTripByShareToken, resolveTripAccess } from "@/lib/share";
import { recordStepViews, webViewer } from "@/lib/views";

export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "ownsteps_visitor";
const VISITOR_TTL_S = 60 * 60 * 24 * 365;

/**
 * The share page reports the steps a visitor has read (`useStepViews`). Like
 * the media of a shared trip, the token in the path is the credential, and a
 * password-protected trip must be unlocked. A signed-in author looking at
 * their own link isn't counted. Visitors are told apart by a random cookie –
 * no account, no IP address.
 *
 * Only JSON is accepted: a cross-site form can't send it without a CORS
 * preflight, so other pages can't inflate the numbers from a visitor's
 * browser.
 */
export async function POST(request: Request, context: RouteContext<"/api/share-views/[token]">) {
  const { token } = await context.params;
  const trip = await getTripByShareToken(token);
  if (!trip) return new Response("Not found", { status: 404 });

  const access = await resolveTripAccess(trip, token);
  if (access.kind === "owner") return new Response(null, { status: 204 });
  if (access.kind !== "guest") return new Response("Forbidden", { status: 403 });

  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }
  const parsed = stepViewsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad Request", { status: 400 });

  const store = await cookies();
  let visitor = store.get(VISITOR_COOKIE)?.value;
  if (!visitor || !/^[\w-]{20,64}$/.test(visitor)) {
    visitor = randomToken(18);
    store.set(VISITOR_COOKIE, visitor, cookieOptions(VISITOR_TTL_S));
  }
  await recordStepViews(trip.id, parsed.data.stepIds, webViewer(visitor));
  return new Response(null, { status: 204 });
}
