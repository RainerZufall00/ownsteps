import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import LanguageSwitch from "@/components/LanguageSwitch";
import ListRow, { RowAction } from "@/components/ListRow";
import { getCurrentUser, listUsers } from "@/lib/auth";
import { formatDateShort } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/text";
import { listApiTokens } from "@/lib/tokens";
import { OIDC_BUTTON_LABEL, oidcEnabled } from "@/lib/oidc";
import { immichAccount } from "@/lib/export/immich";
import { messageFor } from "@/lib/messages";
import { disconnectImmichAction, logoutAction, revokeDeviceAction } from "./actions";
import AddUserForm from "./AddUserForm";
import ImmichForm from "./ImmichForm";
import PasswordForm from "./PasswordForm";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.settings.title };
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const { locale, t } = await getI18n();
  const accounts = await listUsers();
  const devices = user ? await listApiTokens(user.id) : [];
  const immich = user ? await immichAccount(user) : null;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-5">
      <BackLink href="/" className="mb-5">
        {t.common.allTrips}
      </BackLink>

      <h1 className="text-[26px] font-bold leading-tight tracking-tight">
        {t.settings.title}
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">
        {fill(t.settings.signedInAs, { name: user?.name ?? "", email: user?.email ?? "" })}
      </p>

      <section className="card mt-6 p-6">
        <h2 className="mb-1 text-lg font-semibold">{t.settings.accountsHeading}</h2>
        <p className="mb-4 text-[15px] text-ink-soft">
          {t.settings.accountsText}
        </p>

        <ul className="mb-5 space-y-2">
          {accounts.map((account) => (
            <ListRow key={account.id} title={account.name} detail={account.email}>
              {account.oidcSubject && (
                <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
                  {OIDC_BUTTON_LABEL}
                </span>
              )}
            </ListRow>
          ))}
        </ul>

        <AddUserForm />
      </section>

      {oidcEnabled && (
        <section className="card mt-5 p-6">
          <h2 className="text-lg font-semibold">
            {fill(t.settings.oidcHeading, { provider: OIDC_BUTTON_LABEL })}
          </h2>
          <p className="mt-1.5 text-[15px] text-ink-soft">
            {t.settings.oidcText}
          </p>
        </section>
      )}

      <section className="card mt-5 p-6">
        <h2 className="text-lg font-semibold">{t.settings.devicesHeading}</h2>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          {t.settings.devicesText}
        </p>
        {devices.length === 0 ? (
          <p className="mt-4 text-[15px] text-ink-faint">{t.settings.noDevices}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {devices.map((device) => (
              <ListRow
                key={device.id}
                title={device.deviceName}
                detail={
                  fill(t.settings.deviceSince, { date: formatDateShort(device.createdAt, locale) }) +
                  (device.lastUsedAt
                    ? fill(t.settings.deviceLastUsed, {
                        date: formatDateShort(device.lastUsedAt, locale),
                      })
                    : "")
                }
              >
                <RowAction action={revokeDeviceAction} name="tokenId" value={device.id}>
                  {t.settings.signOutDevice}
                </RowAction>
              </ListRow>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-5 p-6">
        <h2 className="text-lg font-semibold">{t.immich.heading}</h2>
        <p className="mb-4 mt-1.5 text-[15px] text-ink-soft">{t.immich.text}</p>
        {immich && !immich.problem ? (
          <div className="space-y-3">
            <p className="text-[15px] font-medium text-sea">
              {fill(t.immich.connected, { url: immich.url, name: immich.name })}
            </p>
            <p className="text-[13px] text-ink-faint">{t.immich.keyStored}</p>
            <form action={disconnectImmichAction}>
              <button type="submit" className="btn btn-ghost px-4 py-2 text-sm">
                {t.immich.disconnect}
              </button>
            </form>
          </div>
        ) : (
          <>
            {immich?.problem && (
              <p className="mb-4 text-sm font-medium text-accent">{messageFor(locale, immich.problem)}</p>
            )}
            <ImmichForm url={immich?.url} />
          </>
        )}
      </section>

      <section className="card mt-5 p-6">
        <h2 className="mb-4 text-lg font-semibold">{t.settings.passwordHeading}</h2>
        <PasswordForm hasPassword={Boolean(user?.passwordHash)} />
      </section>

      <section className="card mt-5 p-6">
        <h2 className="text-lg font-semibold">{t.common.language}</h2>
        <p className="mt-1.5 text-[15px] text-ink-soft">{t.settings.languageText}</p>
        <LanguageSwitch className="mt-4" />
      </section>

      <form action={logoutAction} className="mt-5">
        <button type="submit" className="btn btn-secondary w-full">
          {t.settings.signOut}
        </button>
      </form>
    </main>
  );
}
