import type { ReactNode } from "react";

import { cx } from "@/components/ui/cx";
import { SectionHeading } from "@/components/ui/section-heading";

export function GuideSection({
  id,
  eyebrow,
  title,
  lede,
  children,
  className,
}: {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cx("scroll-mt-24", className)}>
      <SectionHeading id={`${id}-title`} eyebrow={eyebrow} title={title} lede={lede} className="mb-10 md:mb-14" />
      {children}
    </section>
  );
}

export function Specimen({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <div className={cx("flex min-w-0 flex-col gap-3", className)}>
      <h3 className="type-eyebrow text-ink-3">{label}</h3>
      {children}
    </div>
  );
}
