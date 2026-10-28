import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CctvPlatform from "@/components/demos/cctv/CctvPlatform";
import FootPlatform from "@/components/demos/foot/FootPlatform";
import PpeApp from "@/components/ppe/PpeApp";
import VehicleApp from "@/components/vehicle/VehicleApp";
import { CV_MAP } from "@/lib/cv-demos";
import { getBranding } from "@/lib/db";

type Params = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const d = CV_MAP[(await params).slug];
  return d ? { title: `${d.title} (interactive demo)`, robots: { index: false }, alternates: { canonical: `/ai-demos/${d.slug}` } } : {};
}
export default async function CvDemoApp({ params }: Params) {
  const slug = (await params).slug;
  if (slug === "ai-shoe-foot-measurement-fitting") return <FootPlatform branding={await getBranding()} />;
  if (slug === "vehicle-detection-tracking-counting") return <VehicleApp branding={await getBranding()} serviceUrl={process.env.VEHICLE_API_URL?.replace(/\/$/, "") || null} />;
  if (slug === "ai-factory-workforce-ppe-compliance") return <PpeApp branding={await getBranding()} serviceUrl={process.env.PPE_API_URL?.replace(/\/$/, "") || null} />;
  if (slug !== "ai-cctv-intelligence-security-analytics") notFound();
  return <CctvPlatform branding={await getBranding()} />;
}
