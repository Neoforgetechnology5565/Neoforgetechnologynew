import type { Metadata } from "next";
import DemoCenter from "@/components/demos/DemoCenter";

export const metadata: Metadata = {
  title: "CAD/BIM Interactive Demo Center",
  description: "Try working demonstrations of CAD/BIM software we can build: Revit, AutoCAD, SketchUp and BricsCAD automation, BIM data and engineering tools. Sample data only.",
  alternates: { canonical: "/portfolio/cad-bim" },
};

export default function Demos() {
  return <DemoCenter />;
}
