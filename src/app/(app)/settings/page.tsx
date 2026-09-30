import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { formatDateShort } from "@/lib/format";
import { listApiTokens } from "@/lib/tokens";
import { OIDC_BUTTON_LABEL, oidcEnabled } from "@/lib/oidc";
import { logoutAction, revokeDeviceAction } from "./actions";
import AddUserForm from "./AddUserForm";
import PasswordForm from "./PasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const accounts = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      oidcSubject: users.oidcSubject,
    })
    .from(users);
  const devices = user ? await listApiTokens(user.id) : [];

  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-5">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            d="m15 5-7 7 7 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        Alle Reisen
      </Link>

      <h1 className="text-[26px] font-bold leading-tight tracking-tight">
        Einstellungen
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">
        Angemeldet als {user?.name} ({user?.email})
      </p>

      <section className="card mt-6 p-6">
        <h2 className="mb-1 text-lg font-semibold">Wer schreiben darf</h2>
        <p className="mb-4 text-[15px] text-ink-soft">
          Alle Accounts hier haben dieselben Rechte und arbeiten gemeinsam an
          allen Reisen.
        </p>

        <ul className="mb-5 space-y-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {account.name}
                </span>
                <span className="block truncate text-[13px] text-ink-soft">
                  {account.email}
                </span>
              </span>
              {account.oidcSubject && (
                <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
                  {OIDC_BUTTON_LABEL}
                </span>
              )}
            </li>
          ))}
        </ul>

        <AddUserForm />
      </section>

      {oidcEnabled && (
        <section className="card mt-5 p-6">
          <h2 className="text-lg font-semibold">Anmeldung über {OIDC_BUTTON_LABEL}</h2>
          <p className="mt-1.5 text-[15px] text-ink-soft">
            Ist aktiv. Wer sich dort anmeldet und dieselbe E-Mail-Adresse nutzt,
            landet automatisch im passenden Account.
          </p>
        </section>
      )}

      <section className="card mt-5 p-6">
        <h2 className="text-lg font-semibold">Angemeldete Geräte</h2>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Wo du in der OwnSteps-App angemeldet bist. Abmelden wirkt sofort –
          etwa wenn ein Handy verloren gegangen ist.
        </p>
        {devices.length === 0 ? (
          <p className="mt-4 text-[15px] text-ink-faint">Noch keine.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {devices.map((device) => (
              <li
                key={device.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{device.deviceName}</span>
                  <span className="block truncate text-[13px] text-ink-soft">
                    angemeldet am {formatDateShort(device.createdAt)}
                    {device.lastUsedAt
                      ? ` · zuletzt aktiv ${formatDateShort(device.lastUsedAt)}`
                      : ""}
                  </span>
                </span>
                <form action={revokeDeviceAction}>
                  <input type="hidden" name="tokenId" value={device.id} />
                  <button
                    type="submit"
                    className="shrink-0 text-sm font-semibold text-ink-soft transition hover:text-accent"
                  >
                    Abmelden
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-5 p-6">
        <h2 className="mb-4 text-lg font-semibold">Passwort ändern</h2>
        <PasswordForm hasPassword={Boolean(user?.passwordHash)} />
      </section>

      <form action={logoutAction} className="mt-5">
        <button type="submit" className="btn btn-secondary w-full">
          Abmelden
        </button>
      </form>
    </main>
  );
}
