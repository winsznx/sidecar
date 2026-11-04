import type { ReactNode } from "react";

import { cx } from "@/components/ui/cx";
import { Divider } from "@/components/ui/divider";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SidecarGlyph } from "@/components/ui/sidecar-mark";

export interface RecordFrameProps {
  eyebrow: string;
  /** Right of the eyebrow, usually the record's provenance badge. */
  badge?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Identifiers under the title: hash, network. */
  meta?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  busy?: boolean;
  labelledBy: string;
}

/** The paper record: eyebrow, display title, identifiers, a ledger rule, inspection rows, a verdict footer. */
export function RecordFrame({ eyebrow, badge, title, lead, meta, footer, children, busy, labelledBy }: RecordFrameProps): ReactNode {
  return (
    <article
      aria-labelledby={labelledBy}
      aria-busy={busy || undefined}
      className="min-w-0 rounded-xl border border-line bg-raised shadow-card md:rounded-2xl"
    >
      <header className={cx("flex flex-col gap-5 px-5 pt-7 sm:px-8 md:px-12 md:pt-12", children === undefined && "pb-8")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow className="inline-flex items-center gap-2">
            <SidecarGlyph accent className="size-3.5 text-ink-2" />
            {eyebrow}
          </Eyebrow>
          {badge}
        </div>
        <h1 id={labelledBy} className="max-w-full type-hero text-section text-balance text-ink">
          {title}
        </h1>
        {lead !== undefined ? <div className="max-w-measure text-lead text-ink-2 md:text-title md:leading-relaxed">{lead}</div> : null}
        {meta !== undefined ? <div className="flex flex-col gap-2">{meta}</div> : null}
        <Divider variant="double" className="mt-3" />
      </header>
      {children !== undefined ? <div className="flex flex-col gap-12 px-5 py-8 sm:px-8 md:px-12 md:py-10">{children}</div> : null}
      {footer !== undefined ? (
        <footer className="flex flex-col items-start gap-5 border-t border-dashed border-line-strong px-5 py-6 sm:px-8 md:flex-row md:items-end md:justify-between md:px-12 md:py-8">
          {footer}
        </footer>
      ) : null}
    </article>
  );
}

/** A titled group of rows inside a record. */
export function RecordSection({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2">
        <h2 id={id} className="type-display text-heading text-ink">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
