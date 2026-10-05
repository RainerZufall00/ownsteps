import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { countUsers } from "@/lib/auth";
import { SITE_NAME } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/text";
import SetupForm from "./SetupForm";

// Without this the page would be prerendered at build time with the account
// state of that moment baked in – initial setup would lead nowhere.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.setup.title };
}

export default async function SetupPage() {
  // As soon as an account exists, this page is closed.
  if ((await countUsers()) > 0) redirect("/login");
  const { t } = await getI18n();

  return (
    <AuthShell title={fill(t.setup.welcome, { site: SITE_NAME })} intro={t.setup.intro}>
      <SetupForm />
    </AuthShell>
  );
}
