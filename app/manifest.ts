import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "XPACEBOX",
    short_name: "XPACEBOX",
    description: "Plataforma inteligente para gestão multiempresa.",
    start_url: "/",
    display: "standalone",
    background_color: "#09040d",
    theme_color: "#6f32d2",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
