import Link from "next/link";
import PhotoImg from "@/components/PhotoImg";
import { formatTripRange, pluralize } from "@/lib/format";
import { toViewPhoto } from "@/lib/view-types";
import { listTrips } from "@/lib/trips";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const trips = await listTrips();

  return (
    <main className="mx-auto max-w-5xl px-4 pb-28 pt-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">
            Deine Reisen
          </h1>
          <p className="mt-1 text-[15px] text-ink-soft">
            {trips.length === 0
              ? "Noch nichts unterwegs."
              : pluralize(trips.length, "Reise", "Reisen")}
          </p>
        </div>
        <Link href="/trips/new" className="btn btn-secondary hidden sm:inline-flex">
          Neue Reise
        </Link>
      </div>

      {trips.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-3xl">
            🧭
          </div>
          <h2 className="mt-5 text-lg font-semibold">Die erste Reise wartet</h2>
          <p className="mt-2 max-w-xs text-[15px] text-ink-soft">
            Lege eine Reise an, lade unterwegs Fotos hoch und teile den Link mit
            Familie und Freunden.
          </p>
          <Link href="/trips/new" className="btn btn-primary mt-6">
            Reise anlegen
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link
                href={`/trips/${trip.id}`}
                className="card group block overflow-hidden transition hover:shadow-float"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-surface-muted">
                  {trip.coverPhoto ? (
                    <PhotoImg
                      photo={toViewPhoto(trip.coverPhoto)}
                      variant="medium"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                      sizes="(max-width: 640px) 100vw, 480px"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-4xl opacity-40">
                      🗺️
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent p-4 pt-12">
                    <h2 className="text-lg font-bold leading-snug text-white drop-shadow-sm">
                      {trip.title}
                    </h2>
                    <p className="mt-0.5 text-[13px] font-medium text-white/85">
                      {formatTripRange(trip, trip.firstStepAt, trip.lastStepAt)}
                    </p>
                  </div>
                  {trip.shareEnabled && (
                    <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                      geteilt
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 px-4 py-3 text-[13px] text-ink-soft">
                  <span>{pluralize(trip.stepCount, "Station", "Stationen")}</span>
                  <span className="h-1 w-1 rounded-full bg-ink-faint" />
                  <span>{pluralize(trip.photoCount, "Foto", "Fotos")}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Always within reach on phones. */}
      <Link
        href="/trips/new"
        className="fixed bottom-6 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink shadow-float transition active:scale-95 sm:hidden"
        aria-label="Neue Reise"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </Link>
    </main>
  );
}
