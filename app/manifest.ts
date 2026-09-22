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
      { src: "/xpacebox-system-icon.png", sizes: "1254x1254", type: "image/png" },
    ],
  };
}
