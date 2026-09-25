import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useSession } from '../../../app/session';
import { readAgenda, type AgendaEntry } from '../../../data/agenda';
import { listHabits, readDay, completionOver, todayKey, type Completion } from '../../habits/store';
import { trendColor, trendOf, trendSoftColor } from './trend';
import { countDueThisWeek, countDueToday, eventsToday, nextEvent } from './statMath';

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

function StatCard({
  label,
  value,
  sub,
  subColor,
  valueStyle,
}: {
  label: string;
  value: string;
  sub: string;
  subColor?: string;
  valueStyle?: CSSProperties;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className="text-[30px] font-semibold leading-none [letter-spacing:-0.02em] [font-variant-numeric:tabular-nums]"
        style={valueStyle}
      >
        {value}
      </span>
      <span className="text-xs" style={subColor ? { color: subColor } : undefined}>
        {sub}
      </span>
    </div>
  );
}

export function HabitsStatWidget() {
  const { revision } = useSession();
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);

  const reload = useCallback(async () => {
    const habits = await listHabits();
    const record = await readDay(todayKey());
    const completed = new Set(record?.completed ?? []);
    setTotal(habits.length);
    setDone(habits.filter((habit) => completed.has(habit.id)).length);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const left = total - done;
  const sub = total === 0 ? 'No habits yet' : left === 0 ? 'All done today' : `${left} left for today`;
  const subColor = total === 0 ? undefined : '#34d399';

  return <StatCard label="Habits today" value={total === 0 ? '0 / 0' : `${done} / ${total}`} sub={sub} subColor={subColor} />;
}

export function TasksStatWidget() {
  const { revision } = useSession();
  const [entries, setEntries] = useState<AgendaEntry[]>([]);

  const reload = useCallback(async () => {
    setEntries(await readAgenda());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const now = new Date();
  const dueThisWeek = countDueThisWeek(entries, now);
  const dueToday = countDueToday(entries, now);

  return (
    <StatCard
      label="Tasks due this week"
      value={String(dueThisWeek)}
      sub={`${dueToday} due today`}
      subColor={dueToday === 0 ? undefined : '#fbbf24'}
    />
  );
}

export function EventsStatWidget() {
  const { revision } = useSession();
  const [entries, setEntries] = useState<AgendaEntry[]>([]);

  const reload = useCallback(async () => {
    setEntries(await readAgenda());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const now = new Date();
  const count = eventsToday(entries, now);
  const next = nextEvent(entries, now);
  const sub = next ? `Next: ${next.title}, ${clock.format(next.start)}` : 'Nothing else today';

  return (
    <StatCard
      label="Events today"
      value={String(count)}
      sub={sub}
      subColor={next ? '#60a5fa' : undefined}
    />
  );
}

export function CompletionStatWidget() {
  const { revision } = useSession();
  const [hasHabits, setHasHabits] = useState(false);
  const [completion, setCompletion] = useState<Completion[]>([]);

  const reload = useCallback(async () => {
    setHasHabits((await listHabits()).length > 0);
    setCompletion(await completionOver('week'));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const fractions = [...completion].reverse().map((point) => point.fraction);
  const avgPct = fractions.length === 0 ? 0 : Math.round((fractions.reduce((sum, value) => sum + value, 0) / fractions.length) * 100);
  const trend = trendOf(fractions);
  const color = trendColor(trend.kind);
  const soft = trendSoftColor(trend.kind);
  const subByKind: Record<typeof trend.kind, string> = {
    up: 'Rising this week',
    flat: 'Holding steady',
    down: 'Slipping this week',
  };

  return (
    <StatCard
      label="7-day completion"
      value={`${avgPct}%`}
      sub={hasHabits ? subByKind[trend.kind] : 'No habits yet'}
      subColor={hasHabits ? color : undefined}
      valueStyle={hasHabits ? { textShadow: `0 0 18px ${soft}` } : undefined}
    />
  );
}
