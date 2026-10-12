import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms that apply to your use of the Neo Forge Technology website.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return <LegalPage kind="terms" />;
}
