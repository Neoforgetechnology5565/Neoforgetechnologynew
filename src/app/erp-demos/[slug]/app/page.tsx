import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { ERP_MAP } from "@/lib/erp-demos";
import { getBranding } from "@/lib/db";
import type { Branding } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };
type AppComp = React.ComponentType<{ branding: Branding }>;
// One chunk per demo: a visitor only downloads the application they open.
const APPS: Record<string, AppComp> = {
  "crm-sales-pipeline": dynamic(() => import("@/components/biz/CrmApp")),
  "erp-finance-accounting": dynamic(() => import("@/components/biz/FinanceApp")),
  "hrm-employee-management": dynamic(() => import("@/components/biz/HrmApp")),
  "payroll-attendance-workforce": dynamic(() => import("@/components/biz/PayrollApp")),
  "inventory-warehouse-management": dynamic(() => import("@/components/biz/InventoryApp")),
  "procurement-purchase-orders": dynamic(() => import("@/components/biz/ProcurementApp")),
  "helpdesk-service-management": dynamic(() => import("@/components/biz/HelpdeskApp")),
  "marketing-automation-crm": dynamic(() => import("@/components/biz/MarketingApp")),
  "project-resource-management": dynamic(() => import("@/components/biz/ProjectsApp")),
  "executive-analytics-automation": dynamic(() => import("@/components/biz/ExecApp")),
};
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const d = ERP_MAP[(await params).slug];
  return d ? { title: `${d.title} (interactive demo)`, robots: { index: false }, alternates: { canonical: `/erp-demos/${d.slug}` } } : {};
}
export default async function ErpDemoApp({ params }: Params) {
  const slug = (await params).slug;
  const App = APPS[slug];
  if (!App) notFound();
  return <App branding={await getBranding()} />;
}
