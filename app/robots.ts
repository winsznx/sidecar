import type { MetadataRoute } from "next";

import { SITE_URL } from "./site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/dev/" },
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
  };
}
