import LandingPageView from "@/components/landing/LandingPageView";
import { LANDING_MAP } from "@/lib/landing-pages";
import { landingMetadata } from "@/lib/landing-seo";

const page = LANDING_MAP["ai-development"];
export const metadata = landingMetadata(page);
export default function Page() { return <LandingPageView page={page} />; }
