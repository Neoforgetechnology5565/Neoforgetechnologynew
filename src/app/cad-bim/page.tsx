import type { Metadata } from "next";
import DivisionPage, { divisionMetadata } from "@/components/DivisionPage";

export const metadata: Metadata = divisionMetadata("cad-bim");
export default function Page() {
  return <DivisionPage slug="cad-bim" />;
}
