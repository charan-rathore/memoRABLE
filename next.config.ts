import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'wasm-unsafe-eval' lets the on-device search model (ONNX Runtime, WebAssembly) compile; no eval of JS.
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      // Connected repos are fetched by the browser straight from GitHub's API.
      "connect-src 'self' https://api.github.com",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // pdf.js ships ESM that Next otherwise tries to externalize incorrectly.
  serverExternalPackages: ["pdfjs-dist", "@huggingface/transformers", "onnxruntime-node"],
  webpack(config, { isServer }) {
    if (!isServer) {
      // Transformers.js runs in the browser on onnxruntime-web; its Node backends are never used there.
      config.resolve.alias = { ...config.resolve.alias, "onnxruntime-node": false, sharp: false };
    }
    return config;
  },
  // One front door: the daily workspace lives on the homepage, below the story.
  async redirects() {
    return [{ source: "/today", destination: "/#workspace", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
