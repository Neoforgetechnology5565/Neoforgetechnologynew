import Link from "next/link";
import { getContactSettings, getLegal } from "@/lib/db";
import { Markdown } from "@/lib/markdown";

/** Renders the editable Privacy Policy / Terms (Admin → Site content → Legal). */
export default async function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const [legal, c] = await Promise.all([getLegal(), getContactSettings()]);
  const text = legal[kind]
    .replaceAll("{{company}}", "Neo Forge Technology")
    .replaceAll("{{email}}", c.email || "our contact page")
    .replaceAll("{{phone}}", c.phone ? ` · ${c.phone}` : "");
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <p className="text-sm text-stone-500"><Link href="/" className="hover:text-blue-600">Home</Link> / {kind === "privacy" ? "Privacy Policy" : "Terms"}</p>
      <h1 className="mt-4 font-display text-4xl font-semibold text-stone-900">{kind === "privacy" ? "Privacy Policy" : "Terms of Use"}</h1>
      {legal.updated && <p className="mt-2 text-sm text-stone-500">Last updated: {legal.updated}</p>}
      <div className="mt-8"><Markdown source={text} /></div>
      <p className="mt-10 text-sm text-stone-500">Questions? <Link href="/contact" className="text-blue-600 hover:underline">Contact us</Link>.</p>
    </div>
  );
}
