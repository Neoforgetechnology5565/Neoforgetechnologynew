import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Neo Forge Technology collects, uses and protects personal information on this website.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return <LegalPage kind="privacy" />;
}
