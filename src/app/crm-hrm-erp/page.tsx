import type { Metadata } from "next";
import DivisionPage, { divisionMetadata } from "@/components/DivisionPage";

export const metadata: Metadata = divisionMetadata("crm-hrm-erp");
export default function Page() {
  return <DivisionPage slug="crm-hrm-erp" />;
}
