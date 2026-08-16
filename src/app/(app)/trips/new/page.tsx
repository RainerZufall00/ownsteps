import type { Metadata } from "next";
import Link from "next/link";
import NewTripForm from "./NewTripForm";

export const metadata: Metadata = { title: "Neue Reise" };

export default function NewTripPage() {
  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-6">
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

      <h1 className="text-[28px] font-bold leading-tight tracking-tight">
        Neue Reise
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">
        Nur der Name ist nötig – alles andere entsteht unterwegs.
      </p>

      <div className="card mt-6 p-6">
        <NewTripForm />
      </div>
    </main>
  );
}
