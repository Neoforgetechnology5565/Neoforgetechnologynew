import type { Metadata } from "next";
import { Chips, CtaBand, SectionHead } from "@/components/Blocks";
import { TECH_GROUPS } from "@/lib/divisions";

export const metadata: Metadata = {
  title: "Technology",
  description: "Technologies and platforms relevant to Neo Forge Technology's AI / computer vision, software and CAD/BIM engineering work.",
  alternates: { canonical: "/technology" },
};

export default function Technology() {
  return (
    <>
      <section className="container-x py-16 sm:py-24">
        <SectionHead eyebrow="Technology" title="Relevant technologies and capabilities.">These are the technologies and platforms we work with across our divisions. Every project uses the subset that fits its requirements — this is not a claim that each is used on every engagement.</SectionHead>
        <div className="mt-12 space-y-12">
          {TECH_GROUPS.map((g) => (<div key={g.title} className="grid gap-4 border-t border-paper/15 pt-6 lg:grid-cols-[14rem_1fr]"><h2 className="font-mono text-sm uppercase tracking-widest text-forge">{g.title}</h2><Chips items={g.items} /></div>))}
        </div>
      </section>
      <CtaBand title="Not sure which stack fits?" sub="Describe the problem — we'll recommend an approach, not a product." />
    </>
  );
}
