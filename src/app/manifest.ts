import type { MetadataRoute } from "next";

/**
 * PWA manifest (design §12, §15) — makes the app installable on a phone, which
 * matters most for the kid capture path. Served at `/manifest.webmanifest`; Next
 * injects the `<link rel="manifest">` automatically because this file exists.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Family Chore Tracker",
    short_name: "Chores",
    description: "AI photo-based family chore verification.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2d6cd2",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
