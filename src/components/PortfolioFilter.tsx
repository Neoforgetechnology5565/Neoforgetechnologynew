"use client";
import { useState } from "react";
import type { Project } from "@/lib/types";
import ProjectCard from "./ProjectCard";

export default function PortfolioFilter({ projects, categories }: { projects: Project[]; categories: { id: string; name: string }[] }) {
  const [cat, setCat] = useState("");
  const shown = cat ? projects.filter((p) => p.categoryId === cat) : projects;
  const used = categories.filter((c) => projects.some((p) => p.categoryId === c.id));
  return (
    <>
      {used.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by sub-category">
          {[{ id: "", name: "All" }, ...used].map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${cat === c.id ? "border-blue-600 bg-blue-600 text-white" : "border-stone-300 text-stone-700 hover:border-blue-600 hover:text-blue-600"}`}>{c.name}</button>
          ))}
        </div>
      )}
      {shown.length ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{shown.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-500">No published projects here yet.</p>
      )}
    </>
  );
}
