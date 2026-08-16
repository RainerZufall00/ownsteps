import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Logo from "@/components/Logo";
import { countUsers } from "@/lib/auth";
import { SITE_NAME } from "@/lib/env";
import SetupForm from "./SetupForm";

// Ohne das würde die Seite beim Build vorgerendert und der dabei ermittelte
// Account-Stand fest eingebacken – die Ersteinrichtung liefe ins Leere.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ersteinrichtung" };

export default async function SetupPage() {
  // Sobald ein Account existiert, ist diese Seite dicht.
  if ((await countUsers()) > 0) redirect("/login");

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-11 w-11 text-accent" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            Willkommen bei {SITE_NAME}
          </h1>
          <p className="mt-2 text-[15px] text-ink-soft">
            Lege deinen Account an – danach ist diese Seite gesperrt.
          </p>
        </div>

        <div className="card p-6">
          <SetupForm />
        </div>
      </div>
    </main>
  );
}
