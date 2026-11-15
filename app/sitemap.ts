import type { MetadataRoute } from "next";

import { INDEXED_PATHS, SITE_URL } from "./site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXED_PATHS.map((path) => ({ url: new URL(path, SITE_URL).toString() }));
}
