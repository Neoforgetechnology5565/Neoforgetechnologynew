"use client";
import { usePathname } from "next/navigation";
import Footer from "./Footer";
import type { ContactSettings } from "@/lib/types";

/** The admin area has its own chrome; hide the public footer there. Footer itself stays free of any admin link. */
export default function FooterGate({ contact }: { contact: ContactSettings }) {
  return usePathname().startsWith("/admin") ? null : <Footer contact={contact} />;
}
