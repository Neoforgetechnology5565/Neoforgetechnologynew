"use client";
import { useState } from "react";
import { api } from "@/components/admin/api";
import { Card, PageTitle, useToast } from "@/components/admin/ui";

export default function Maintenance() {
  const [log, setLog] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
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
      {toast.el}
    </>
  );
}
