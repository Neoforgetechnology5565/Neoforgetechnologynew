import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth";
import { runMigrations } from "@/lib/migrations";
import AdminShell from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage(); // verifies signature, expiry, revocation and the admin claim
  await runMigrations().catch((e) => console.error("migration failed", e)); // idempotent; no-op once up to date
  return <AdminShell email={user.email}>{children}</AdminShell>;
}
