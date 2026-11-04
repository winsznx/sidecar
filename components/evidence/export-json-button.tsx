"use client";

import { Download } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

export interface ExportJsonButtonProps {
  /** Builds the JSON text when clicked, so the export is of what is on screen at that moment. */
  build: () => string;
  fileName: string;
  label?: string;
  disabledReason?: string;
}

/** Offers sanitized JSON as a local download. Nothing is uploaded. */
export function ExportJsonButton({ build, fileName, label = "Download JSON", disabledReason }: ExportJsonButtonProps): ReactNode {
  const [status, setStatus] = useState<string>("");

  function handleClick(): void {
    try {
      const url = URL.createObjectURL(new Blob([build()], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
      // Revoke on the next task so the browser has started the download first.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus(`Download started: ${fileName}.`);
    } catch (error) {
      console.warn("Sidecar could not export the JSON record.", error);
      setStatus("The browser blocked the download.");
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        size="sm"
        leading={<Download aria-hidden="true" className="size-3.5" />}
        onClick={handleClick}
        disabledReason={disabledReason}
      >
        {label}
      </Button>
      <span role="status" className="text-caption text-ink-2">
        {status}
      </span>
    </span>
  );
}
