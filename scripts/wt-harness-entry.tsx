// Test-only entry: mounts the real admin stage component. Never served by the app; Playwright injects it at /__wt/page (see wt-harness.mjs).
import { createRoot, type Root } from "react-dom/client";
import Manager from "@/components/admin/walkthrough/Manager";
import WalkthroughStage from "@/components/admin/walkthrough/Stage";
import { configFor } from "@/lib/walkthrough/defaults";
import { listDemos } from "@/lib/walkthrough/registry";
import type { WtConfig } from "@/lib/walkthrough/schema";

let root: Root | null = null;
(window as unknown as Record<string, unknown>).__wtMount = (key: string, opts: { config?: WtConfig; fast?: boolean; autoStart?: "auto" | "manual"; startAt?: number } = {}) => {
  const d = listDemos().find((x) => x.key === key)!, c: WtConfig = opts.config ?? configFor(d).config;
  if (opts.fast) { c.introMs = 1500; c.steps.forEach((s) => { s.durationMs = 1000; }); }
  root?.unmount(); const el = document.getElementById("root")!; root = createRoot(el);
  root.render(<WalkthroughStage demoPath={d.appPath} demoTitle={d.title} config={c} height="800px" autoStart={opts.autoStart} startAt={opts.startAt} />);
};
(window as unknown as Record<string, unknown>).__wtKeys = () => listDemos().map((d) => d.key);
(window as unknown as Record<string, unknown>).__wtConfig = (key: string) => { const d = listDemos().find((x) => x.key === key)!; return configFor(d); };
(window as unknown as Record<string, unknown>).__wtList = () => listDemos().map((d) => { const c = configFor(d); return { entry: d, record: { key: d.key, config: c.config, source: "default", quality: c.quality } }; });
(window as unknown as Record<string, unknown>).__wtMountManager = () => { root?.unmount(); root = createRoot(document.getElementById("root")!); root.render(<Manager />); };
