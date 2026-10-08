import type { Metadata } from "next";
import ChatSession from "@/components/ChatSession";
import { getContactSettings } from "@/lib/db";

export const metadata: Metadata = {
  title: "Live Chat",
  description: "Chat directly with the Neo Forge Technology team about your AI, automation or CAD/BIM project.",
  alternates: { canonical: "/live-chat" },
};

export default async function LiveChat() {
  const c = await getContactSettings();
  return (
    <div>
      <section className="bg-slate-950 py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Live Chat</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Chat with Neo Forge Technology</h1>
          <p className="mt-4 max-w-2xl text-slate-300">
            {c.chatEnabled ? "Tell us about your project and share images or PDFs directly — no account needed." : "Live chat is currently unavailable. Please use the Contact page or WhatsApp."}
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {c.chatEnabled ? (
          <div className="mx-auto flex h-[70vh] min-h-[28rem] max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <ChatSession greeting={c.chatGreeting} active className="flex-1" />
          </div>
        ) : (
          <p className="mx-auto max-w-xl rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">Chat is switched off right now.</p>
        )}
      </section>
    </div>
  );
}
