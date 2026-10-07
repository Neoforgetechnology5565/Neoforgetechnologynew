"use client";
import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";

let emulatorConnected = false;

export function clientAuth() {
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });
  const auth = getAuth(app);
  // Local development / CI against the Firebase Auth emulator (never set in production).
  const emu = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;
  if (emu && !emulatorConnected) {
    connectAuthEmulator(auth, emu, { disableWarnings: true });
    emulatorConnected = true;
  }
  return auth;
}
