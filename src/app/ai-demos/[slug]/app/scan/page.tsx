import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import ScanApp from "@/components/demos/foot/ScanApp";

const SLUG = "ai-shoe-foot-measurement-fitting";
export const metadata: Metadata = { title: "Foot scanner (phone)", robots: { index: false, follow: false }, manifest: "/foot.webmanifest", referrer: "no-referrer", appleWebApp: { capable: true, title: "Foot scanner", statusBarStyle: "black-translucent" } };
export const viewport: Viewport = { themeColor: "#0c0a09", width: "device-width", initialScale: 1 };
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  if ((await params).slug !== SLUG) notFound();
  return <ScanApp />;
}
