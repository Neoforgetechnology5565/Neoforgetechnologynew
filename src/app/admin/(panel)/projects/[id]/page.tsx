import ProjectEditor from "@/components/admin/ProjectEditor";
export default async function EditProject({ params }: { params: Promise<{ id: string }> }) {
  return <ProjectEditor id={(await params).id} />;
}
