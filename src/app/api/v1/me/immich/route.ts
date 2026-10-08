import { handle, json, noContent, readJson } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { immichConnectSchema } from "@/lib/api/schemas";
import { connectImmich, disconnectImmich, immichConnectionInfo } from "@/lib/export/immich";
import { getI18n } from "@/lib/i18n/server";
import { parseInput } from "@/lib/schemas";
import { getUserById } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The author's Immich connection, for sending trips there – the same one
 * the web settings manage.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const { user } = await requireAuthor(request);
    const { locale, t } = await getI18n();
    return json(await immichConnectionInfo(user, locale, t));
  });
}

export async function PUT(request: Request) {
  return handle(async () => {
    const { user } = await requireAuthor(request);
    const input = parseInput(immichConnectSchema, await readJson(request));
    await connectImmich(user, input);
    const { locale, t } = await getI18n();
    // Read again: the principal's copy predates the stored key.
    return json(await immichConnectionInfo((await getUserById(user.id))!, locale, t));
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    const { user } = await requireAuthor(request);
    await disconnectImmich(user);
    return noContent();
  });
}
