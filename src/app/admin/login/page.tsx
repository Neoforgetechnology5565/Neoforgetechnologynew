"use client";
import { useState } from "react";
import { GoogleAuthProvider, sendEmailVerification, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from "firebase/auth";
import { clientAuth } from "@/lib/firebase-client";

export default function Login() {
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  /** Exchange the Firebase user for the httpOnly admin session cookie. Authorisation is decided server-side. */
  async function finish(user: User) {
    const post = async (idToken: string) => {
      const res = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
      return { res, json: await res.json().catch(() => ({})) };
    };
    let { res, json } = await post(await user.getIdToken());
    if (json.refresh) { // first sign-in just granted the admin claim; fetch a token that carries it
      ({ res, json } = await post(await user.getIdToken(true)));
    }
    if (res.ok) { window.location.href = "/admin"; return; }
    if (json.code === "unverified") {
      await sendEmailVerification(user).catch(() => {});
      setInfo("Your email address must be verified before the first admin sign-in. We just sent a verification link — open it, then sign in again.");
    } else setError(json.error || "Sign-in failed");
    await signOut(clientAuth());
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setInfo(""); setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const cred = await signInWithEmailAndPassword(clientAuth(), String(f.get("email")), String(f.get("password")));
      await finish(cred.user);
    } catch {
      setError("Invalid email or password.");
    }
    setBusy(false);
  }

  async function google() {
    setError(""); setInfo(""); setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await signInWithPopup(clientAuth(), provider);
      await finish(cred.user);
    } catch (e) {
      const code = (e as { code?: string }).code || "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") setError("Google sign-in was cancelled.");
      else if (code === "auth/popup-blocked") setError("Your browser blocked the Google pop-up. Allow pop-ups for this site and try again.");
      else if (code === "auth/unauthorized-domain") setError("This domain isn't authorised in Firebase yet (Authentication → Settings → Authorized domains).");
      else if (code === "auth/operation-not-allowed") setError("Google sign-in isn't enabled in Firebase yet (Authentication → Sign-in method → Google).");
      else setError("Google sign-in failed.");
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-950 p-5 grid-bg">
      <div className="w-full max-w-sm border border-paper/20 bg-ink-900 p-8">
        <p className="eyebrow">Neo Forge</p>
        <h1 className="mt-2 text-2xl font-semibold">Administrator sign-in</h1>

        <button type="button" onClick={google} disabled={busy} className="btn-ghost mt-6 w-full gap-3">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-paper/40"><span className="h-px flex-1 bg-paper/15" />or<span className="h-px flex-1 bg-paper/15" /></div>

        <form onSubmit={submit}>
          <div className="space-y-4">
            <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="username" className="field" /></div>
            <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" className="field" /></div>
          </div>
          <button className="btn-primary mt-6 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        {info && <p role="status" className="mt-4 text-sm text-signal-dim">{info}</p>}
      </div>
    </div>
  );
}
