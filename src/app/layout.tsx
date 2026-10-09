import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContactWidget from "@/components/ContactWidget";
import Tracker from "@/components/Tracker";
import { iconUrl } from "@/lib/cloudinary";
import { getBranding, getCategories, getContactSettings } from "@/lib/db";
import { siteUrl } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { icon } = await getBranding();
  return { ...baseMetadata, ...(icon ? { icons: { icon: [{ url: iconUrl(icon, 32), sizes: "32x32", type: "image/png" }, { url: iconUrl(icon, 192), sizes: "192x192", type: "image/png" }], apple: [{ url: iconUrl(icon, 180), sizes: "180x180" }] } } : {}) };
}

const baseMetadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Neo Forge Technology — Software, AI, Automation & CAD/BIM Engineering", template: "%s | Neo Forge Technology" },
  description:
    "Neo Forge Technology builds intelligent software, computer vision and AI systems, CRM/HRM/ERP automation platforms and specialized CAD/BIM plugins for complex real-world workflows.",
  openGraph: { type: "website", siteName: "Neo Forge Technology", locale: "en_US" },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [contact, categories, branding] = await Promise.all([getContactSettings(), getCategories(), getBranding()]);
  return (
    <html lang="en" className={GeistMono.variable} data-scroll-behavior="smooth">
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
        <Navbar categories={categories} branding={branding} />
        <main id="main">{children}</main>
        <Footer contact={contact} categories={categories} branding={branding} />
        <ContactWidget enabled={contact.chatEnabled} greeting={contact.chatGreeting} whatsapp={contact.whatsapp} email={contact.email} />
        <Tracker />
      </body>
    </html>
  );
}
