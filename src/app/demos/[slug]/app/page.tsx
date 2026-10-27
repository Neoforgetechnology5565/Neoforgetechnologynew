import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RevitDashboard from "@/components/demos/RevitDashboard";
import CadStudio from "@/components/demos/CadStudio";
import SketchConfigurator from "@/components/demos/SketchConfigurator";
import DynamicComponents from "@/components/demos/DynamicComponents";
import BricsWorkbench from "@/components/demos/BricsWorkbench";
import BimExplorer from "@/components/demos/BimExplorer";
import BatchManager from "@/components/demos/BatchManager";
import CalcWorkbench from "@/components/demos/CalcWorkbench";
import QtoEstimator from "@/components/demos/QtoEstimator";
import { DEMO_MAP } from "@/lib/demos";
import { getBranding } from "@/lib/db";
import type { Branding } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };
const APPS: Record<string, (p: { branding: Branding }) => React.JSX.Element> = { "revit-bim-automation-dashboard": RevitDashboard, "autocad-drawing-automation-studio": CadStudio, "sketchup-parametric-model-configurator": SketchConfigurator, "sketchup-dynamic-components-builder": DynamicComponents, "bricscad-automation-workbench": BricsWorkbench, "bim-model-data-explorer": BimExplorer, "cad-batch-processing-manager": BatchManager, "engineering-calculation-workbench": CalcWorkbench, "bim-quantity-takeoff-cost-estimator": QtoEstimator };

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
