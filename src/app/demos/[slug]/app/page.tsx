import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RevitDashboard from "@/components/demos/RevitDashboard";
import { DEMO_MAP } from "@/lib/demos";

type Params = { params: Promise<{ slug: string }> };
const APPS: Record<string, () => React.JSX.Element> = { "revit-bim-automation-dashboard": RevitDashboard };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const d = DEMO_MAP[(await params).slug];
  return d ? { title: `${d.title} (interactive demo)`, robots: { index: false }, alternates: { canonical: `/demos/${d.slug}` } } : {};
}

export default async function DemoApp({ params }: Params) {
  const slug = (await params).slug;
  const App = APPS[slug];
  if (!App) notFound();
  return <App />;
}
