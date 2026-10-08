import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ProjectView, { projectMetadata } from "@/components/ProjectView";
import { getProject } from "@/lib/db";
import { projectHref } from "@/lib/paths";

type Params = { params: Promise<{ division: string; subcategory: string; project: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { division, project } = await params;
  const p = await getProject(division, project);
  return p ? projectMetadata(p) : {};
}

export default async function Page({ params }: Params) {
  const { division, subcategory, project } = await params;
  const p = await getProject(division, project);
  if (!p) notFound();
  if (p.categorySlug !== subcategory) redirect(projectHref(p)); // keep one canonical URL per project
  return <ProjectView p={p} />;
}
