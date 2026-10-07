import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Header from "@/components/Header";
import ChatWidget from "@/components/ChatWidget";
import Tracker from "@/components/Tracker";
import FooterGate from "@/components/FooterGate";
import { getContactSettings } from "@/lib/db";
import { siteUrl } from "@/lib/utils";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Neo Forge Technology — Software, AI, Automation & CAD/BIM Engineering", template: "%s | Neo Forge Technology" },
  description:
    "Neo Forge Technology builds intelligent software, computer vision and AI systems, CRM/HRM/ERP automation platforms and specialized CAD/BIM plugins for complex real-world workflows.",
  openGraph: { type: "website", siteName: "Neo Forge Technology", locale: "en_US" },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { themeColor: "#06080c", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const contact = await getContactSettings();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:bg-forge focus:px-3 focus:py-2 focus:text-ink-950">Skip to content</a>
        <Header />
        <main id="main">{children}</main>
        <FooterGate contact={contact} />
        <ChatWidget enabled={contact.chatEnabled} greeting={contact.chatGreeting} whatsapp={contact.whatsapp} />
        <Tracker />
      </body>
    </html>
  );
}

