import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { C, adminListProjects } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";

type Counter = Record<string, number>;
const top = (c: Counter, n = 10) => Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);

export const GET = adminRoute(async () => {
  const db = adminDb();
  const days = 30;
  const ids = Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10));
  const [docs, totals, projects] = await Promise.all([
    db.getAll(...ids.map((id) => db.collection(C.daily).doc(id))),
    db.collection(C.totals).doc("all").get(),
    adminListProjects(),
  ]);
  const pages: Counter = {}, countries: Counter = {}, proj: Counter = {};
  const series = docs.map((d, i) => {
    const x = d.data() || {};
    for (const [k, v] of Object.entries((x.pages || {}) as Counter)) pages[k] = (pages[k] || 0) + v;
    for (const [k, v] of Object.entries((x.countries || {}) as Counter)) countries[k] = (countries[k] || 0) + v;
    for (const [k, v] of Object.entries((x.projects || {}) as Counter)) proj[k] = (proj[k] || 0) + v;
    return { day: ids[i], views: (x.views as number) || 0, visits: (x.visits as number) || 0 };
  });
  const titleOf = (k: string) => {
    const [division, slug] = k.split("~").filter(Boolean).slice(-2);
    return projects.find((p) => p.slug === slug && p.division === division)?.title || k.replaceAll("~", "/");
  };
  return NextResponse.json({
    totals: totals.data() || {},
    series,
    pages: top(pages).map(([k, v]) => [k === "~" ? "/" : k.replaceAll("~", "/"), v]),
    countries: top(countries),
    projects: top(proj).map(([k, v]) => [titleOf(k), v]),
  });
});
