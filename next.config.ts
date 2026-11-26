import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating "N" dev badge; compile and runtime errors still show.
  devIndicators: false,
  // Let phones on the same network use the dev server (iPhone hotspot and home Wi-Fi addresses).
  allowedDevOrigins: ["172.20.10.*", "192.168.*.*"],
  // pdf.js loads its worker from a path next to its own files, so it must not be bundled.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
