import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import { getI18n } from "@/lib/i18n/server";
import NewTripForm from "./NewTripForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.newTrip.title };
}

export default async function NewTripPage() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <BackLink href="/" className="mb-5">
        {t.common.allTrips}
      </BackLink>

      <h1 className="text-[28px] font-bold leading-tight tracking-tight">
        {t.newTrip.title}
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">
        {t.newTrip.intro}
      </p>

      <div className="card mt-6 p-6">
        <NewTripForm />
      </div>
    </main>
  );
}
