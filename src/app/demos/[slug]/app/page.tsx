import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RevitDashboard from "@/components/demos/RevitDashboard";
import { DEMO_MAP } from "@/lib/demos";
import { getBranding } from "@/lib/db";
import type { Branding } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };
const APPS: Record<string, (p: { branding: Branding }) => React.JSX.Element> = { "revit-bim-automation-dashboard": RevitDashboard };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const d = DEMO_MAP[(await params).slug];
  return d ? { title: `${d.title} (interactive demo)`, robots: { index: false }, alternates: { canonical: `/demos/${d.slug}` } } : {};
}

export default async function DemoApp({ params }: Params) {
  const slug = (await params).slug;
  const App = APPS[slug];
  if (!App) notFound();
  return <App branding={await getBranding()} />;
}
