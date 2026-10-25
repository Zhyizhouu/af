import type { TodoWithStep } from './store';

function StepPill({ index, total }: { index: number; total: number }) {
  return (
    <span className="inline-flex h-4 items-center rounded-full border border-border bg-muted px-1.5 text-[11px] leading-none font-semibold text-muted-foreground tabular-nums">
      {index}/{total}
    </span>
  );
}

/**
 * The one "step of a task" label: `◆ title i/n`, or `◆ i/n` when `compact`
 * (calendar blocks, narrow rows). Renders a fragment, so the parent flex
 * container sets the spacing.
 */
export function StepMark({
  task,
  compact,
}: {
  task: NonNullable<TodoWithStep['task']>;
  compact?: boolean;
}) {
  return (
    <>
      <span aria-hidden className="text-[var(--af-accent)]">
        ◆
      </span>
      {!compact && <span className="min-w-0 truncate">{task.title}</span>}
      <StepPill index={task.index} total={task.total} />
    </>
  );
}
