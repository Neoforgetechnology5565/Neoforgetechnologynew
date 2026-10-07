import type { Metadata } from "next";
import DivisionPage, { divisionMetadata } from "@/components/DivisionPage";

export const metadata: Metadata = divisionMetadata("computer-vision");
export default function Page() {
  return <DivisionPage slug="computer-vision" />;
}
