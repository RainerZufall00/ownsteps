import { buildOpenApiDocument } from "@/lib/api/openapi";

export const dynamic = "force-dynamic";

/** Public: the API description the iOS client is generated from. */
export async function GET() {
  return Response.json(buildOpenApiDocument());
}
