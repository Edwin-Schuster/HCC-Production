import type { MetadataRoute } from "next";

/** Lets phones install the app to the home screen; it opens full screen like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HCC Production",
    short_name: "HCC Prod",
    description: "SOPs, projects, roster and gear for the production team.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08090a",
    theme_color: "#08090a",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
