import packageJson from "../../../../../package.json";
import { countUsers } from "@/lib/auth";
import { json } from "@/lib/api/http";
import type { InfoDto } from "@/lib/api/schemas";
import { PASSWORD_LOGIN, SITE_NAME } from "@/lib/env";
import { OIDC_BUTTON_LABEL, oidcEnabled } from "@/lib/oidc";

export const dynamic = "force-dynamic";

/**
 * Public: the app calls this first, to check the address really is an
 * OwnSteps server, which sign-in methods it offers and whether it's recent
 * enough ([D13]).
 */
export async function GET() {
  const info: InfoDto = {
    name: SITE_NAME,
    version: packageJson.version,
    apiVersion: 1,
    minAppVersion: "1.0.0",
    setupComplete: (await countUsers()) > 0,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    auth: {
      password: PASSWORD_LOGIN,
      oidc: oidcEnabled,
      oidcLabel: oidcEnabled ? OIDC_BUTTON_LABEL : null,
    },
    features: ["viewers", "changes", "idempotent-uploads", "step-views"],
  };
  return json(info);
}
