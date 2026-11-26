import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "shalter",
    short_name: "shalter",
    description: "Social network and messenger",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0095f6",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
