import type { MetadataRoute } from "next";

// Icons are generated from app/icon.svg by scripts/generate-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lodestar",
    short_name: "Lodestar",
    description:
      "Find your direction. Research internships, fellowships and scholarships you actually qualify for, who to contact, and what to send.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#1b345e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
