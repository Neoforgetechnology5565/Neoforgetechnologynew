import type { Metadata } from "next";
import DemoCenter from "@/components/demos/DemoCenter";

export const metadata: Metadata = {
  title: "CAD/BIM Interactive Demo Center",
  description: "Try working demonstrations of CAD/BIM software Neo Forge Technology can build: Revit automation, AutoCAD, SketchUp, BricsCAD, BIM data, batch processing and engineering tools. Sample data only.",
  alternates: { canonical: "/portfolio/cad-bim" },
};

export default function Demos() {
  return <DemoCenter />;
}
