import type { ReactNode } from "react";

/** Shared page masthead: hand-set label, title and one line of context. */
export function PageHead({
  title,
  intro,
  actions,
}: {
  title: string;
  intro: string;
  actions?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-accent/60 via-card to-card p-6 shadow-[var(--shadow-card)] sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{intro}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
