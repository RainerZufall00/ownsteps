import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { LockIcon } from "@/components/icons";
import { countUsers, getCurrentUser } from "@/lib/auth";
import { PASSWORD_LOGIN, SITE_NAME } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/text";
import { OIDC_BUTTON_LABEL, oidcEnabled } from "@/lib/oidc";
import LoginForm from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.login.title };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  // Without an account the way leads through initial setup first.
  if ((await countUsers()) === 0 && !oidcEnabled) redirect("/setup");

  const { t } = await getI18n();
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : null;
  const nextTarget = typeof params.next === "string" ? params.next : "/";

  return (
    <AuthShell
      title={SITE_NAME}
      intro={t.login.tagline}
      notice={
        errorKey &&
        ((Object.hasOwn(t.login.errors, errorKey) && t.login.errors[errorKey]) || t.login.failed)
      }
    >
      {oidcEnabled && (
        <>
          <a
            className="btn btn-primary w-full"
            href={`/api/auth/oidc/start?next=${encodeURIComponent(nextTarget)}`}
          >
            <LockIcon />
            {fill(t.login.withProvider, { provider: OIDC_BUTTON_LABEL })}
          </a>

          {PASSWORD_LOGIN && (
            <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
              <span className="h-px flex-1 bg-line" />
              {t.login.orPassword}
              <span className="h-px flex-1 bg-line" />
            </div>
          )}
        </>
      )}

      {PASSWORD_LOGIN && <LoginForm />}
      {!PASSWORD_LOGIN && !oidcEnabled && (
        <p className="text-[15px] text-ink-soft">{t.login.nothingConfigured}</p>
      )}
    </AuthShell>
  );
}
