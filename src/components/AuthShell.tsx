import type { ReactNode } from "react";
import LanguageSwitch from "./LanguageSwitch";
import Logo from "./Logo";

/**
 * The centered card of the pages before anyone is in: sign-in, initial setup
 * and a password-protected share link.
 */
export default function AuthShell({
  title,
  intro,
  notice,
  children,
}: {
  title: ReactNode;
  intro: ReactNode;
  /** Shown above the card, e.g. why the last sign-in failed. */
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-11 w-11 text-accent" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-[15px] text-ink-soft">{intro}</p>
        </div>

        {notice && (
          <p className="mb-5 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent">{notice}</p>
        )}

        <div className="card p-6">{children}</div>

        <div className="mt-6 flex justify-center">
          <LanguageSwitch />
        </div>
      </div>
    </main>
  );
}
