import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Plan3dApp from "@/components/bim/Plan3dApp";
import { SUITE_MAP } from "@/lib/bim/suite";
import { getBranding } from "@/lib/db";

type Params = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Params): Promise<Metadata> { const d = SUITE_MAP[(await params).slug]; return d ? { title: `${d.title} (application)`, robots: { index: false }, alternates: { canonical: `/cad-bim-suite/${d.slug}` } } : {}; }
export default async function App({ params }: Params) {
  const slug = (await params).slug; const d = SUITE_MAP[slug]; if (!d || d.status === "planned") notFound();
  const branding = await getBranding();
  if (slug === "plan-to-3d-building-model") return <Plan3dApp branding={branding} />;
  notFound();
}
