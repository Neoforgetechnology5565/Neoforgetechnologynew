"use client";
import { useState } from "react";
import { sendEmailVerification, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { clientAuth } from "@/lib/firebase-client";

export default function Login() {
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setInfo(""); setBusy(true);
    const f = new FormData(e.currentTarget);
    const auth = clientAuth();
    try {
      const cred = await signInWithEmailAndPassword(auth, String(f.get("email")), String(f.get("password")));
      let idToken = await cred.user.getIdToken();
      let res = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
      let json = await res.json().catch(() => ({}));
      if (json.refresh) { // first sign-in just granted the admin claim; fetch a token that carries it
        idToken = await cred.user.getIdToken(true);
        res = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
        json = await res.json().catch(() => ({}));
      }
      if (res.ok) { window.location.href = "/admin"; return; }
      if (json.code === "unverified") {
        await sendEmailVerification(cred.user).catch(() => {});
        setInfo("Your email address must be verified before the first admin sign-in. We just sent a verification link — open it, then sign in again.");
      } else setError(json.error || "Sign-in failed");
      await signOut(auth);
    } catch {
      setError("Invalid email or password.");
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-950 p-5 grid-bg">
      <form onSubmit={submit} className="w-full max-w-sm border border-paper/20 bg-ink-900 p-8">
        <p className="eyebrow">Neo Forge</p>
        <h1 className="mt-2 text-2xl font-semibold">Administrator sign-in</h1>
        <div className="mt-6 space-y-4">
          <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="username" className="field" /></div>
          <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" className="field" /></div>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
        {info && <p role="status" className="mt-4 text-sm text-signal">{info}</p>}
        <button className="btn-primary mt-6 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
