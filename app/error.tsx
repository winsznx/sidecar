"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";

import { Button, buttonClassName } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";

interface ErrorPageProps {
  error: unknown;
  retry: () => void;
}

function errorDigest(error: unknown): string | null {
  if (error instanceof Error && "digest" in error && typeof error.digest === "string") return error.digest;
  return null;
}

/**
 * Renders without the site chrome on purpose: the header reads the chain and the wallet, and if
 * that is what threw, drawing it again here would throw again.
 */
export default function ErrorPage({ error, retry }: ErrorPageProps): ReactNode {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = errorDigest(error);

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center px-4 py-14 md:px-8">
      <SectionHeading
        as="h1"
        size="display"
        eyebrow="Error"
        title="This page stopped before it finished."
        lede="Something on this page failed while it rendered. Trying again reloads its data. If you had just placed an order, check its receipt before placing it again."
      />
      {digest !== null ? <p className="mt-4 type-eyebrow text-ink-3">Reference {digest}</p> : null}
      <div className="mt-10 flex flex-wrap gap-3">
        <Button onClick={retry}>Try again</Button>
        <Link href="/" className={buttonClassName({ variant: "ghost" })}>
          Back to the start
        </Link>
      </div>
    </main>
  );
}
