const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Keep the Firebase Admin SDK and its gRPC stack out of the bundle (bundling them breaks on Vercel).
  serverExternalPackages: ["web-ifc", "firebase-admin", "google-gax", "@grpc/grpc-js", "@google-cloud/firestore"],
  // web-ifc loads its .wasm from node_modules at run time; file tracing cannot see that, so ship it with every route that reads IFC (otherwise ENOENT on Vercel).
  outputFileTracingIncludes: { "/api/bim/**/*": ["./node_modules/web-ifc/*.wasm"], "/api/bim/projects/[id]/*": ["./node_modules/web-ifc/*.wasm"] },
  // @vladmandic/human exposes its Node build to the server compile pass; the in-browser detector must always use the ESM build.
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, "@vladmandic/human$": path.resolve("node_modules/@vladmandic/human/dist/human.esm.js") };
    return config;
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  // Short, memorable entry points for the ML demos (samples 12-21); the real routes follow the portfolio's /ai-demos/<slug>/app pattern.
  async redirects() {
    return [
      { source: "/image-classification-demo", destination: "/ai-demos/ai-image-classification/app", permanent: false },
      { source: "/object-detection-demo", destination: "/ai-demos/ai-object-detection-video-analytics/app", permanent: false },
      { source: "/image-segmentation-demo", destination: "/ai-demos/ai-image-segmentation/app", permanent: false },
      { source: "/ocr-document-intelligence-demo", destination: "/ai-demos/ai-ocr-document-extraction/app", permanent: false },
      { source: "/image-anomaly-detection-demo", destination: "/ai-demos/ai-image-anomaly-detection/app", permanent: false },
      { source: "/time-series-forecasting-demo", destination: "/ai-demos/ai-time-series-forecasting/app", permanent: false },
      { source: "/predictive-maintenance-demo", destination: "/ai-demos/ai-predictive-maintenance/app", permanent: false },
      { source: "/human-pose-estimation-demo", destination: "/ai-demos/ai-human-pose-estimation/app", permanent: false },
      { source: "/semantic-document-search-demo", destination: "/ai-demos/ai-semantic-document-search/app", permanent: false },
      { source: "/product-recommendation-demo", destination: "/ai-demos/ai-product-recommendation/app", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The foot scanner needs the camera; every other page keeps camera=() from securityHeaders.
      { source: "/ai-demos/ai-shoe-foot-measurement-fitting/:path*", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};
export default nextConfig;
