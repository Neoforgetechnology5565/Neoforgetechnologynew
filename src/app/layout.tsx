import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContactWidget from "@/components/ContactWidget";
import Tracker from "@/components/Tracker";
import { getCategories, getContactSettings } from "@/lib/db";
import { siteUrl } from "@/lib/utils";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Neo Forge Technology — Software, AI, Automation & CAD/BIM Engineering", template: "%s | Neo Forge Technology" },
  description:
    "Neo Forge Technology builds intelligent software, computer vision and AI systems, CRM/HRM/ERP automation platforms and specialized CAD/BIM plugins for complex real-world workflows.",
  openGraph: { type: "website", siteName: "Neo Forge Technology", locale: "en_US" },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [contact, categories] = await Promise.all([getContactSettings(), getCategories()]);
  return (
    <html lang="en" className={GeistMono.variable} data-scroll-behavior="smooth">
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
        <Navbar categories={categories} />
        <main id="main">{children}</main>
        <Footer contact={contact} categories={categories} />
        <ContactWidget enabled={contact.chatEnabled} greeting={contact.chatGreeting} whatsapp={contact.whatsapp} email={contact.email} />
        <Tracker />
      </body>
    </html>
  );
}
