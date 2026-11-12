// Test-only entry: mounts the real analytics dashboard component. Never served by the app; Playwright injects it at /__t/page.
import { createRoot } from "react-dom/client";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";

(window as unknown as Record<string, unknown>).__mountAnalytics = () => createRoot(document.getElementById("root")!).render(<AnalyticsDashboard />);
