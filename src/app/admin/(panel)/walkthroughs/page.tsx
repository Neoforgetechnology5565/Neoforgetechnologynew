import Manager from "@/components/admin/walkthrough/Manager";

/** Admin-only (the (panel) layout verifies the session and the admin claim before rendering; the API routes check again). */
export default function WalkthroughsPage() { return <Manager />; }
