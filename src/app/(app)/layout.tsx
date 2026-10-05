import Link from "next/link";
import { redirect } from "next/navigation";
import Logo from "@/components/Logo";
import { getCurrentUser } from "@/lib/auth";
import { SITE_NAME } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getI18n();

  const initials = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Logo className="h-6 w-6 text-accent" />
            <span className="tracking-tight">{SITE_NAME}</span>
          </Link>

          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-surface-muted"
            aria-label={t.common.settings}
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink">
                {initials}
              </span>
            )}
            <span className="hidden text-sm font-medium text-ink-soft sm:inline">
              {user.name}
            </span>
          </Link>
        </div>
      </header>

      <div className="flex-1">{children}</div>
    </>
  );
}
