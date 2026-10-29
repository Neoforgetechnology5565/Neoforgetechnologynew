"use client";
import { useEffect } from "react";
import { connectServer } from "@/lib/biz/db";

/** Connects the shared store to the business API when one is configured on the server (BIZ_API_URL). Renders nothing. */
export default function ErpSync({ url }: { url: string }) {
  useEffect(() => { if (url) connectServer(url); }, [url]);
  return null;
}
