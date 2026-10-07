"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { Card, Field, PageTitle, lines, useToast } from "@/components/admin/ui";
import type { AboutContent, ContactSettings, HomeContent, Project } from "@/lib/types";

type Tab = "home" | "about" | "contact";

export default function Content() {
  const [tab, setTab] = useState<Tab>("home");
  const [home, setHome] = useState<HomeContent | null>(null);
  const [about, setAbout] = useState<(Omit<AboutContent, "capabilities"> & { capabilities: string }) | null>(null);
  const [contact, setContact] = useState<ContactSettings | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const toast = useToast();

  useEffect(() => {
    api<{ item: HomeContent }>("/api/admin/content/home").then((r) => setHome(r.item)).catch(toast.err);
    api<{ item: AboutContent }>("/api/admin/content/about").then((r) => setAbout({ ...r.item, capabilities: r.item.capabilities.join("\n") })).catch(toast.err);
    api<{ item: ContactSettings }>("/api/admin/content/contact").then((r) => setContact(r.item)).catch(toast.err);
    api<{ items: Project[] }>("/api/admin/projects").then((r) => setProjects(r.items.filter((p) => p.status === "published"))).catch(toast.err);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const put = (key: Tab, body: object) => api(`/api/admin/content/${key}`, "PUT", body).then(() => toast.ok("Saved — live on the site")).catch(toast.err);
  const tabs: [Tab, string][] = [["home", "Homepage"], ["about", "About"], ["contact", "Contact & chat"]];

  return (
    <>
      <PageTitle title="Site content" />
      <div className="mb-5 flex gap-2">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`border px-4 py-2 text-sm ${tab === k ? "border-forge bg-forge text-ink-950" : "border-paper/25"}`}>{l}</button>)}</div>

      {tab === "home" && home && (
        <Card className="grid gap-4">
          <Field label="Eyebrow"><input className="field" value={home.heroEyebrow} onChange={(e) => setHome({ ...home, heroEyebrow: e.target.value })} /></Field>
          <Field label="Hero heading"><input className="field" value={home.heroHeading} onChange={(e) => setHome({ ...home, heroHeading: e.target.value })} /></Field>
          <Field label="Hero description"><textarea rows={3} className="field" value={home.heroDescription} onChange={(e) => setHome({ ...home, heroDescription: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary CTA text"><input className="field" value={home.primaryCta} onChange={(e) => setHome({ ...home, primaryCta: e.target.value })} /></Field>
            <Field label="Secondary CTA text"><input className="field" value={home.secondaryCta} onChange={(e) => setHome({ ...home, secondaryCta: e.target.value })} /></Field>
          </div>
          <fieldset><legend className="label">Core capabilities (hero strip)</legend>
            <div className="space-y-3">{home.capabilities.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
                <input aria-label="Title" className="field" value={c.title} onChange={(e) => setHome({ ...home, capabilities: home.capabilities.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                <input aria-label="Text" className="field" value={c.body} onChange={(e) => setHome({ ...home, capabilities: home.capabilities.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} />
                <button className="text-xs text-red-400" onClick={() => setHome({ ...home, capabilities: home.capabilities.filter((_, j) => j !== i) })}>Remove</button>
              </div>))}
              {home.capabilities.length < 9 && <button className="text-sm text-forge" onClick={() => setHome({ ...home, capabilities: [...home.capabilities, { title: "", body: "" }] })}>+ Add capability</button>}
            </div>
          </fieldset>
          <fieldset><legend className="label">Featured projects (leave all unticked to use projects marked “Featured”)</legend>
            <div className="max-h-56 space-y-1 overflow-y-auto border border-paper/15 p-3">
              {projects.length === 0 && <p className="text-sm text-paper/50">Publish a project first.</p>}
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={home.featuredProjectIds.includes(p.id)} onChange={(e) => setHome({ ...home, featuredProjectIds: e.target.checked ? [...home.featuredProjectIds, p.id] : home.featuredProjectIds.filter((x) => x !== p.id) })} />{p.title}</label>
              ))}
            </div>
          </fieldset>
          <div><button className="btn-primary !py-2" onClick={() => put("home", home)}>Save homepage</button></div>
        </Card>
      )}

      {tab === "about" && about && (
        <Card className="grid gap-4">
          <Field label="Headline"><input className="field" value={about.headline} onChange={(e) => setAbout({ ...about, headline: e.target.value })} /></Field>
          <Field label="Company description"><textarea rows={4} className="field" value={about.description} onChange={(e) => setAbout({ ...about, description: e.target.value })} /></Field>
          <Field label="Approach"><textarea rows={4} className="field" value={about.approach} onChange={(e) => setAbout({ ...about, approach: e.target.value })} /></Field>
          <Field label="Capabilities" hint="One per line"><textarea rows={8} className="field" value={about.capabilities} onChange={(e) => setAbout({ ...about, capabilities: e.target.value })} /></Field>
          <p className="text-xs text-paper/45">FAQs are managed under “FAQs”.</p>
          <div><button className="btn-primary !py-2" onClick={() => put("about", { ...about, capabilities: lines(about.capabilities) })}>Save About</button></div>
        </Card>
      )}

      {tab === "contact" && contact && (
        <Card className="grid gap-4 sm:grid-cols-2">
          {(["email", "phone", "whatsapp", "location", "linkedin", "github", "x", "youtube"] as const).map((k) => (
            <Field key={k} label={k === "whatsapp" ? "WhatsApp number (digits with country code, e.g. 15551234567)" : k === "x" ? "X / Twitter URL" : k[0].toUpperCase() + k.slice(1) + (["linkedin", "github", "youtube"].includes(k) ? " URL" : "")}>
              <input className="field" value={contact[k]} onChange={(e) => setContact({ ...contact, [k]: e.target.value })} />
            </Field>
          ))}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={contact.chatEnabled} onChange={(e) => setContact({ ...contact, chatEnabled: e.target.checked })} /> Enable live chat widget</label>
          <div className="sm:col-span-2"><Field label="Chat greeting"><input className="field" value={contact.chatGreeting} onChange={(e) => setContact({ ...contact, chatGreeting: e.target.value })} /></Field></div>
          <p className="text-xs text-paper/45 sm:col-span-2">If a WhatsApp number is set, a WhatsApp button appears next to the chat button (and is shown alone if live chat is disabled).</p>
          <div className="sm:col-span-2"><button className="btn-primary !py-2" onClick={() => put("contact", contact)}>Save contact settings</button></div>
        </Card>
      )}
      {toast.el}
    </>
  );
}
