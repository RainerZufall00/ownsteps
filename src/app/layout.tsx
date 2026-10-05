import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SITE_NAME } from "@/lib/env";
import { I18nProvider } from "@/lib/i18n/client";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Every page per request: the Content-Security-Policy carries a fresh nonce
// (src/proxy.ts), which a prerendered page couldn't have on its scripts.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
    description: t.meta.description,
    robots: { index: false, follow: false },
    appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // So the content reaches into the rounded corners on iPhones.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#14110f" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Client components read their texts from here; the server ones call
  // getI18n() themselves.
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={locale} dictionary={t}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
