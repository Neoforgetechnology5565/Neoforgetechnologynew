"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { Card, useToast } from "@/components/admin/ui";
import { enablePush, pushSupported } from "@/lib/push-client";

interface S { settings: { enabled: boolean; email: boolean; push: boolean; minGapMinutes: number; newVisitorsOnly: boolean }; lastAlertAt: number | null; pending: number; emailConfigured: boolean; emailTo: string; pushConfigured: boolean; devices: number }
const GAPS: [number, string][] = [[1, "1 minute"], [5, "5 minutes"], [10, "10 minutes"], [15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [240, "4 hours"]];

/** Configure "someone is on your website" alerts: email and/or push to this device, working even when the admin is closed. */
export default function AlertsPanel() {
  const [s, setS] = useState<S | null>(null), [form, setForm] = useState<S["settings"] | null>(null), [dirty, setDirty] = useState(false), [test, setTest] = useState<Record<string, string> | null>(null), [busy, setBusy] = useState(false);
  const toast = useToast();
  const load = useCallback(() => api<S>("/api/admin/analytics/alerts").then((x) => { setS(x); setForm(x.settings); setDirty(false); }).catch(toast.err), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  if (!s || !form) return <p className="text-paper/50">Loading…</p>;
  const set = (p: Partial<S["settings"]>) => { setForm({ ...form, ...p }); setDirty(true); };
  async function save() { setBusy(true); try { setS(await api<S>("/api/admin/analytics/alerts", "PUT", form)); setDirty(false); toast.ok("Alert settings saved"); } catch (e) { toast.err(e); } finally { setBusy(false); } }
  async function device() {
    setBusy(true);
    try { const sub = await enablePush(); await api("/api/admin/analytics/alerts/subscribe", "POST", sub); toast.ok("This device will now receive visitor alerts"); await load(); } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  async function noDevice() {
    setBusy(true);
    try { const reg = await navigator.serviceWorker.getRegistration("/sw.js"), sub = await reg?.pushManager.getSubscription(); if (sub) { await api("/api/admin/analytics/alerts/subscribe", "DELETE", { endpoint: sub.endpoint }); await sub.unsubscribe(); } toast.ok("This device was removed"); await load(); } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  async function sendTest() { setBusy(true); try { setTest(await api<Record<string, string>>("/api/admin/analytics/alerts/test", "POST")); } catch (e) { toast.err(e); } finally { setBusy(false); } }
  const Check = ({ on, label, id, children }: { on: boolean; label: string; id: string; children?: React.ReactNode }) => <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={on} onChange={(e) => set(id === "enabled" ? { enabled: e.target.checked } : id === "email" ? { email: e.target.checked } : id === "push" ? { push: e.target.checked } : { newVisitorsOnly: e.target.checked })} data-testid={`al-${id}`} /><span>{label}{children}</span></label>;
  return (
    <div className="space-y-4" data-testid="alerts">
      <Card>
        <h2 className="font-semibold">Visitor alerts</h2>
        <p className="mt-1 text-sm text-paper/60">Get a message when someone starts a visit on your website, even when you are not logged in and the admin is closed. Sent from the server, so it works while you are away.</p>
        <div className="mt-4 space-y-3">
          <Check id="enabled" on={form.enabled} label="Send me visitor alerts" />
          <Check id="email" on={form.email} label="By email"><span className="block text-xs text-paper/50" data-testid="al-email-status">{s.emailConfigured ? `Sent to ${s.emailTo || "your notification address"}.` : "Email is not set up yet: add SMTP_HOST, SMTP_USER and SMTP_PASS (and NOTIFY_TO) in Vercel, then redeploy."}</span></Check>
          <Check id="push" on={form.push} label="By push notification to my phone or computer"><span className="block text-xs text-paper/50" data-testid="al-push-status">{!s.pushConfigured ? "Push is not set up yet: generate VAPID keys in Admin → Maintenance, add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel, then redeploy." : `${s.devices} device${s.devices === 1 ? "" : "s"} enabled.`}</span></Check>
          {s.pushConfigured && <div className="ml-6 flex flex-wrap gap-2"><button type="button" className="btn-primary !py-2" onClick={device} disabled={busy || !pushSupported()} data-testid="al-device-on">Enable on this device</button><button type="button" className="btn-ghost !py-2" onClick={noDevice} disabled={busy || !pushSupported()} data-testid="al-device-off">Remove this device</button>{!pushSupported() && <span className="self-center text-xs text-amber-300">This browser cannot receive push notifications.</span>}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">At most one alert every<select className="field mt-1" value={form.minGapMinutes} onChange={(e) => set({ minGapMinutes: Number(e.target.value) })} data-testid="al-gap">{GAPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><span className="mt-1 block text-xs text-paper/50">Visits in between are counted and reported in the next alert.</span></label>
            <div className="pt-6"><Check id="new" on={form.newVisitorsOnly} label="Only for first-time visitors" /></div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2"><button type="button" className="btn-primary !py-2" onClick={save} disabled={busy || !dirty} data-testid="al-save">Save</button><button type="button" className="btn-ghost !py-2" onClick={sendTest} disabled={busy || dirty} data-testid="al-test">Send a test alert</button></div>
        {dirty && <p className="mt-2 text-xs text-amber-300">Save your changes before sending a test.</p>}
        {test && <ul className="mt-3 space-y-1 text-sm" data-testid="al-test-result">{Object.entries(test).map(([k, v]) => <li key={k}><b>{k}:</b> {v}</li>)}</ul>}
        <p className="mt-4 text-xs text-paper/50" data-testid="al-last">{s.lastAlertAt ? `Last alert sent ${new Date(s.lastAlertAt).toLocaleString()}${s.pending ? `, ${s.pending} visit${s.pending === 1 ? "" : "s"} since` : ""}.` : "No alert has been sent yet."}</p>
      </Card>
      <Card><h3 className="font-semibold">Good to know</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-paper/70">
          <li>An alert is sent when a visit starts. It is based on the same statistics as the rest of this page, so it only fires for visitors who accepted statistics (not those who declined or send Do-Not-Track).</li>
          <li>The alert says where the visitor appears to be (approximate, estimated from their network), where they came from and which page they opened. It never names or identifies anyone.</li>
          <li>Push needs permission on each device. iPhones only deliver web push to sites added to the Home Screen; email works on every device.</li>
          <li>You can switch alerts off here at any time. Opening the admin does not matter: alerts are sent by the server.</li>
        </ul></Card>
      {toast.el}
    </div>
  );
}
