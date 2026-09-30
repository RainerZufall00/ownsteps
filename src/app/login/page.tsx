import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Logo from "@/components/Logo";
import { countUsers, getCurrentUser } from "@/lib/auth";
import { SITE_NAME } from "@/lib/env";
import { OIDC_BUTTON_LABEL, oidcEnabled } from "@/lib/oidc";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Anmelden" };

const ERRORS: Record<string, string> = {
  oidc_unreachable: "Der Anmelde-Dienst ist gerade nicht erreichbar.",
  oidc_expired: "Die Anmeldung hat zu lange gedauert. Bitte noch einmal.",
  oidc_state: "Die Anmeldung konnte nicht zugeordnet werden. Bitte noch einmal.",
  oidc_denied: "Die Anmeldung wurde abgebrochen.",
  oidc_not_allowed: "Dieser Account ist für OwnSteps nicht freigegeben.",
  oidc_failed: "Die Anmeldung ist fehlgeschlagen.",
  oidc_disabled: "Die Anmeldung über den Anbieter ist nicht aktiv.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  // Without an account the way leads through initial setup first.
  if ((await countUsers()) === 0 && !oidcEnabled) redirect("/setup");

  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : null;
  const nextTarget = typeof params.next === "string" ? params.next : "/";

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-11 w-11 text-accent" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{SITE_NAME}</h1>
          <p className="mt-2 text-[15px] text-ink-soft">
            Deine Reisen, deine Fotos, dein Server.
          </p>
        </div>

        {errorKey && (
          <p className="mb-5 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent">
            {ERRORS[errorKey] ?? "Die Anmeldung ist fehlgeschlagen."}
          </p>
        )}

        <div className="card p-6">
          {oidcEnabled && (
            <>
              <a
                className="btn btn-primary w-full"
                href={`/api/auth/oidc/start?next=${encodeURIComponent(nextTarget)}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Zm10-10V7a4 4 0 0 0-8 0v4h8Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Mit {OIDC_BUTTON_LABEL} anmelden
              </a>

              <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
                <span className="h-px flex-1 bg-line" />
                oder mit Passwort
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
