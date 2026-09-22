export function GET() {
  return Response.json({
    id: "/xpace/app",
    name: "XPACE · Agenda",
    short_name: "XPACE",
    description: "Painel e chamada diária da escola XPACE.",
    start_url: "/xpace/app",
    scope: "/xpace/app",
    display: "standalone",
    background_color: "#20142c",
    theme_color: "#20142c",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
