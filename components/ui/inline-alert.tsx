import { CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "./cx";
import type { StatusTone } from "./types";

const TONE: Record<StatusTone, { icon: LucideIcon; box: string; iconClass: string }> = {
  neutral: { icon: Info, box: "border-line bg-raised shadow-raised", iconClass: "text-ink-2" },
  positive: { icon: CircleCheck, box: "border-positive/40 bg-positive-soft", iconClass: "text-positive" },
  warning: { icon: TriangleAlert, box: "border-warning/40 bg-warning-soft", iconClass: "text-warning" },
  danger: { icon: OctagonAlert, box: "border-danger/40 bg-danger-soft", iconClass: "text-danger" },
};

export interface InlineAlertProps {
  tone?: StatusTone;
  title: ReactNode;
  /** One or two sentences: what happened and what to do next. */
  children?: ReactNode;
  /** A single next step, e.g. a secondary Button. */
  action?: ReactNode;
  icon?: LucideIcon;
  /**
   * `assertive` for failures that appear after an action (role="alert"), `polite` for status
   * updates (role="status"), `off` for messages present on first paint.
   */
  announce?: "assertive" | "polite" | "off";
  className?: string;
}

export function InlineAlert({
  tone = "neutral",
  title,
  children,
  action,
  icon,
  announce = "off",
  className,
}: InlineAlertProps): ReactNode {
  const { icon: DefaultIcon, box, iconClass } = TONE[tone];
  const Icon = icon ?? DefaultIcon;
  const role = announce === "assertive" ? "alert" : announce === "polite" ? "status" : undefined;

  return (
    <div role={role} className={cx("flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start", box, className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon aria-hidden="true" className={cx("mt-0.5 size-4 shrink-0", iconClass)} strokeWidth={2.25} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-body font-semibold text-ink">{title}</p>
          {children !== undefined ? <div className="text-small text-ink-2">{children}</div> : null}
        </div>
      </div>
      {action !== undefined ? <div className="flex shrink-0 sm:self-center">{action}</div> : null}
    </div>
  );
}
