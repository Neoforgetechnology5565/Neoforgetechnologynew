"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { Card, PageTitle, useToast } from "@/components/admin/ui";

export default function Maintenance() {
  const [log, setLog] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [mail, setMail] = useState<{ configured: boolean; to: string; host: string } | null>(null);
  const [sending, setSending] = useState(false);
  useEffect(() => { api<{ configured: boolean; to: string; host: string }>("/api/admin/test-email").then(setMail).catch(() => {}); }, []);
  async function testMail() {
    setSending(true);
    try { const r = await api<{ to: string }>("/api/admin/test-email", "POST"); toast.ok(`Test email sent to ${r.to}`); } catch (e) { toast.err(e); }
    setSending(false);
  }
  const [push, setPush] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  useEffect(() => { api<{ configured: boolean }>("/api/admin/push-keys").then((r) => setPush(r.configured)).catch(() => {}); }, []);
  async function genKeys() {
    try { setKeys(await api<{ publicKey: string; privateKey: string }>("/api/admin/push-keys", "POST")); } catch (e) { toast.err(e); }
  }
  async function run() {
    setBusy(true);
    try { const r = await api<{ log: string[] }>("/api/admin/migrate", "POST"); setLog(r.log); toast.ok("Migrations complete"); } catch (e) { toast.err(e); }
    setBusy(false);
  }
  return (
    <>
      <PageTitle title="Maintenance" />
      <Card className="max-w-2xl">
        <h2 className="font-semibold">Data migrations</h2>
        <p className="mt-2 text-sm text-paper/65">Schema updates run automatically when an administrator opens this console. You can safely re-run them at any time: every step only creates or backfills what is missing and never overwrites your content.</p>
        <button className="btn-primary mt-4 !py-2" onClick={run} disabled={busy}>{busy ? "Running…" : "Run migrations now"}</button>
        {log && <pre className="mt-4 overflow-x-auto bg-ink-950 p-3 font-mono text-xs">{log.join("\n") || "Nothing to do."}</pre>}
      </Card>
      <Card className="mt-5 max-w-2xl">
        <h2 className="font-semibold">Email notifications</h2>
        <p className="mt-2 text-sm text-paper/65">When a visitor sends the contact form or starts a live chat, an email is sent to your mailbox (chat emails at most once every 10 minutes per conversation). Replying to an inquiry email goes straight to the visitor.</p>
        {mail?.configured ? (
          <p className="mt-3 text-sm">Status: <b className="text-signal-dim">Configured</b> via {mail.host}. Sending to <b>{mail.to || "—"}</b>.</p>
        ) : (
          <p className="mt-3 text-sm">Status: <b className="text-red-600">Not set up</b>. Add <code>SMTP_HOST</code>, <code>SMTP_USER</code> and <code>SMTP_PASS</code> in Vercel (see the setup steps), then redeploy.</p>
        )}
        <button className="btn-primary mt-4 !py-2" onClick={testMail} disabled={sending || !mail?.configured}>{sending ? "Sending…" : "Send a test email"}</button>
      </Card>
      <Card className="mt-5 max-w-2xl">
        <h2 className="font-semibold">Visitor notifications (phone &amp; browser)</h2>
        <p className="mt-2 text-sm text-paper/65">After a visitor starts a chat or sends an enquiry they can tap “Notify me on this device when you reply”. When you reply, their phone or browser shows a notification, even if the site is closed. This needs a one-time pair of keys.</p>
        <p className="mt-3 text-sm">Status: {push ? <b className="text-signal-dim">On</b> : <b className="text-red-600">Not set up</b>}</p>
        {!push && (
          <>
            <button className="btn-primary mt-4 !py-2" onClick={genKeys}>Generate my keys</button>
            {keys && (
              <div className="mt-4 space-y-3 text-sm">
                <p>In Vercel → Settings → Environment Variables, add these two (Production), then <b>Redeploy</b>. Copy them now: the private key is shown only here.</p>
                <p className="label">NEXT_PUBLIC_VAPID_PUBLIC_KEY</p><pre className="overflow-x-auto bg-ink-950 p-3 font-mono text-xs">{keys.publicKey}</pre>
                <p className="label">VAPID_PRIVATE_KEY</p><pre className="overflow-x-auto bg-ink-950 p-3 font-mono text-xs">{keys.privateKey}</pre>
              </div>
            )}
          </>
        )}
        <p className="mt-3 text-xs text-paper/50">On iPhone, notifications work only after the visitor adds the website to their Home Screen. Android and computers work in the browser.</p>
      </Card>
      {toast.el}
    </>
  );
}
