"use client";

import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";

import { fontVariables } from "./fonts";
import "./globals.css";

interface GlobalErrorProps {
  error: unknown;
  retry: () => void;
}

/** Replaces the root layout when it throws, so it brings its own document, fonts and styles. */
export default function GlobalError({ error, retry }: GlobalErrorProps): ReactNode {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" data-surface="paper" className={fontVariables}>
      <body className="paper-grid min-h-dvh bg-canvas text-ink antialiased">
        <title>Something went wrong · Sidecar</title>
        <main id="main" className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center px-4 py-14 md:px-8">
          <SectionHeading
            as="h1"
            size="display"
            eyebrow="Error"
            title="Sidecar stopped before the page loaded."
            lede="Trying again reloads the page. If you had just placed an order, check its receipt before placing it again."
          />
          <div className="mt-10">
            <Button onClick={retry}>Try again</Button>
          </div>
        </main>
      </body>
    </html>
  );
}
