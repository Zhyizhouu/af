import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AFHint, AFPanel } from '../../components/AF';
import { useSession } from '../../app/session';
import { programs } from '../../app/programs';
import { readAgenda, type AgendaEntry } from '../../data/agenda';
import { categoryBySlug, listCategories, toneColor, type EventCategory } from '../calendar/categories';
import { completionOver, listHabits, readDay, toggleHabit, todayKey } from '../habits/store';
import { dayLabel } from '../habits/time';
import type { HabitRow } from '../../data/db';
import './dashboard.css';

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const dayStamp = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * reAFresh — the launcher, and the four read-outs worth seeing on arrival.
 *
 * In the Flutter build this lived outside `lib/programs/` as the shell's home
 * rather than as a program of its own. Here it is a program: the nav bar is
 * already the launcher, so a dashboard that is not reachable from it is a
 * dashboard nobody visits.
 */
export function DashboardScreen() {
  const { revision, requestSync } = useSession();

  const [entries, setEntries] = useState<AgendaEntry[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [completion, setCompletion] = useState<number[]>([]);

  const today = todayKey();

  const reload = useCallback(async () => {
    setEntries(await readAgenda());
    setCategories(await listCategories());
    setHabits(await listHabits());
    setDone(new Set((await readDay(today))?.completed ?? []));
    setCompletion((await completionOver('week')).map((day) => day.fraction));
  }, [today]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const todaysEntries = entries
    .filter((entry) => entry.start >= startOfDay && entry.start < new Date(startOfDay.getTime() + 86_400_000))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Forward-looking, so a session marked finished drops out even if its time
  // has not passed — "up next" is what is still owed.
  const upNext = entries
    .filter((entry) => !entry.finished && entry.end >= now)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 6);

  const colour = (entry: AgendaEntry) =>
    entry.kind === 'session'
      ? 'var(--af-accent)'
      : toneColor(categoryBySlug(categories, entry.category).toneIndex);

  return (
    <div className="page dash">
      <header className="page__head">
        <span className="af-brand">reAFresh</span>
        <span className="page__spacer" />
        <span className="af-panel-label">{dayStamp.format(now)}</span>
      </header>

      {/* Mark plus name, no descriptions — the gallery is for getting somewhere,
          not for reading about where you might go. */}
      <div className="dash__gallery">
        {programs
          .filter((program) => program.slug !== 'dashboard')
          .map((program) => (
            <Link key={program.slug} to={`/${program.slug}`} className="dash__tile">
              <span className="dash__mark" aria-hidden>
                {program.mark}
              </span>
              <span className="dash__name">{program.name}</span>
            </Link>
          ))}
      </div>

      <div className="dash__row">
        {/* Named for what it holds, not for the day: there is a second panel
            below also about today, and two headings reading TODAY on one screen
            is one heading too many. */}
        <AFPanel label={`Habits ${dayLabel(today, today).toLowerCase()}`} count={`${done.size}/${habits.length}`}>
          {habits.length === 0 ? (
            <AFHint>No habits yet. Add one in Habits.</AFHint>
          ) : (
            <ul className="dash__habits">
              {habits.map((habit) => {
                const ticked = done.has(habit.id);
                return (
                  <li key={habit.id}>
                    <button
                      type="button"
                      className={`dash__habit${ticked ? ' is-done' : ''}`}
                      aria-pressed={ticked}
                      onClick={() =>
                        void (async () => {
                          await toggleHabit(habit.id, today);
                          await reload();
                          requestSync();
                        })()
                      }
                    >
                      <span
                        className="dash__tick"
                        style={{
                          borderColor: toneColor(habit.toneIndex),
                          background: ticked ? toneColor(habit.toneIndex) : 'transparent',
                        }}
                      />
                      <span className="af-body">{habit.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </AFPanel>

        <AFPanel label="Completion" count="7 days">
          {habits.length === 0 ? (
            <AFHint>Add a habit and this fills in.</AFHint>
          ) : (
            <div className="dash__spark" role="img" aria-label="Completion over seven days">
              {[...completion].reverse().map((fraction, index) => (
                <span
                  key={index}
                  className="dash__spark-bar"
                  style={{ height: `${Math.max(fraction * 100, 3)}%` }}
                />
              ))}
            </div>
          )}
        </AFPanel>
      </div>

      <div className="dash__row">
        <AFPanel label="Today" count={`${todaysEntries.length}`}>
          {todaysEntries.length === 0 ? (
            <AFHint>Nothing scheduled today.</AFHint>
          ) : (
            <EntryList entries={todaysEntries} colour={colour} />
          )}
        </AFPanel>

        <AFPanel label="Up next" count={`${upNext.length}`}>
          {upNext.length === 0 ? (
            <AFHint>Nothing ahead.</AFHint>
          ) : (
            <EntryList entries={upNext} colour={colour} withDay />
          )}
        </AFPanel>
      </div>
    </div>
  );
}

function EntryList({
  entries,
  colour,
  withDay = false,
}: {
  entries: AgendaEntry[];
  colour: (entry: AgendaEntry) => string;
  withDay?: boolean;
}) {
  return (
    <ul className="dash__entries">
      {entries.map((entry) => (
        <li key={entry.id} className="dash__entry">
          <span className="dash__stripe" style={{ background: colour(entry) }} />
          <span className="dash__when">
            {entry.allDay
              ? 'all day'
              : withDay
                ? `${dayStamp.format(entry.start)} ${clock.format(entry.start)}`
                : clock.format(entry.start)}
          </span>
          <span className="dash__title af-body">{entry.title}</span>
        </li>
      ))}
    </ul>
  );
}
