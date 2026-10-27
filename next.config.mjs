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
  serverExternalPackages: ["firebase-admin", "google-gax", "@grpc/grpc-js", "@google-cloud/firestore"],
  // @vladmandic/human exposes its Node build to the server compile pass; the in-browser detector must always use the ESM build.
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, "@vladmandic/human$": path.resolve("node_modules/@vladmandic/human/dist/human.esm.js") };
    return config;
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
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
