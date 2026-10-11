import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SIS Esthetics Hair",
    short_name: "SIS Esthetics",
    description: "Запазете час в SIS Esthetics Hair",
    start_url: "/rezervacia",
    display: "standalone",
    background_color: "#faf6f1",
    theme_color: "#faf6f1",
    lang: "bg",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
