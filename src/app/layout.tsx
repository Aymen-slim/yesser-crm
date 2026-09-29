import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/lib/locale";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: { default: "Yesser Studio", template: "%s · Yesser Studio" },
  description: "Wedding photography studio CRM",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={outfit.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
