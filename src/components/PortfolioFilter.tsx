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
              className={`border px-3 py-1.5 font-mono text-xs transition-colors ${cat === c.id ? "border-forge bg-forge text-white" : "border-paper/25 hover:border-forge"}`}>{c.name}</button>
          ))}
        </div>
      )}
      {shown.length ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{shown.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
      ) : (
        <p className="mt-8 border border-dashed border-paper/25 p-8 text-paper/60">No published projects here yet.</p>
      )}
    </>
  );
}
