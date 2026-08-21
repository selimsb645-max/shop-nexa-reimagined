import { createFileRoute } from "@tanstack/react-router";
import { generateSitemap } from "@/lib/sitemap.server";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { xml } = await generateSitemap();
          return new Response(xml, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=900, s-maxage=900",
            },
          });
        } catch (error) {
          console.error("[sitemap] Generation failed:", error);
          // Return a minimal valid sitemap with just static pages on error
          const fallbackXml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            "  <url><loc>https://shop-nexa.lovable.app/</loc><priority>1.0</priority></url>",
            "  <url><loc>https://shop-nexa.lovable.app/shop</loc><priority>0.9</priority></url>",
            "</urlset>",
          ].join("\n");
          return new Response(fallbackXml, {
            status: 503,
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "no-cache",
              "Retry-After": "300",
            },
          });
        }
      },
    },
  },
});
