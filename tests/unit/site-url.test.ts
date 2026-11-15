import { describe, expect, it } from "vitest";

import { resolveSiteUrl } from "@/app/site-url";

describe("resolveSiteUrl", () => {
  it("prefers the explicit site URL over the Vercel production domain", () => {
    // #given both variables are set
    const env = { NEXT_PUBLIC_SITE_URL: "https://sidecar.example", VERCEL_PROJECT_PRODUCTION_URL: "sidecar.vercel.app" };

    // #when
    const url = resolveSiteUrl(env);

    // #then
    expect(url.origin).toBe("https://sidecar.example");
  });

  it("adds https to the scheme-less Vercel production domain", () => {
    // #given only Vercel's variable, which carries no scheme
    const env = { VERCEL_PROJECT_PRODUCTION_URL: "sidecar.vercel.app" };

    // #when
    const url = resolveSiteUrl(env);

    // #then
    expect(url.origin).toBe("https://sidecar.vercel.app");
  });

  it("skips blank and unparseable values and falls back to localhost", () => {
    // #given a whitespace site URL and a host that cannot form a URL
    const env = { NEXT_PUBLIC_SITE_URL: "   ", VERCEL_PROJECT_PRODUCTION_URL: "bad host" };

    // #when
    const url = resolveSiteUrl(env);

    // #then
    expect(url.origin).toBe("http://localhost:3000");
  });

  it("falls back to localhost when nothing is set", () => {
    // #given / #when
    const url = resolveSiteUrl({});

    // #then
    expect(url.origin).toBe("http://localhost:3000");
  });
});
