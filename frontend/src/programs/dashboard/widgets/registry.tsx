import type { ReactElement } from 'react';
import { programs } from '../../../app/programs';
import { AppWidget } from './AppWidget';
import { CompletionWidget } from './CompletionWidget';
import { HabitsWidget } from './HabitsWidget';
import { TasksWidget } from './TasksWidget';
import { TodayWidget } from './TodayWidget';
import { TodoWidget } from './TodoWidget';
import { UpNextWidget } from './UpNextWidget';

export interface DashboardWidget {
  id: string;
  label: string;
  Component: () => ReactElement;
  /** App-launcher widgets default smaller — a tile, not a content panel. */
  app: boolean;
  /** Running order for the seed and for "Auto-adjust". Lower comes first. */
  rank: number;
}

/**
 * Panels in the order the questions actually get asked: what is happening
 * now, then what is owed, then the ambient stuff you glance at rather than
 * act on.
 *
 * Two to a row, the pairs fall out of this deliberately — Today beside Up
 * next (both agenda), Tasks beside To-do (both lists of work), and Habits
 * beside Completion, which is the chart of those very habits.
 */
const functionalWidgets: readonly DashboardWidget[] = [
  { id: 'today', label: 'Today', Component: TodayWidget, app: false, rank: 1 },
  { id: 'upNext', label: 'Up next', Component: UpNextWidget, app: false, rank: 2 },
  { id: 'tasks', label: 'Tasks', Component: TasksWidget, app: false, rank: 3 },
  { id: 'todo', label: 'To-do', Component: TodoWidget, app: false, rank: 4 },
  { id: 'habits', label: 'Habits today', Component: HabitsWidget, app: false, rank: 5 },
  { id: 'completion', label: 'Completion', Component: CompletionWidget, app: false, rank: 6 },
];

/**
 * Every widget an account can place on the dashboard: one launcher per
 * application, plus the functional widgets above.
 *
 * Deliberately independent of Profile's "Displayed Applications" (header)
 * setting — hiding a program from the nav bar does not touch its dashboard
 * widget, and showing or hiding a dashboard widget does not touch the nav
 * bar. `admin` still gates an admin-only program's launcher from appearing
 * at all, the same presentation rule the nav bar and split picker already
 * follow — that one is a security posture, not a preference, so it is not
 * optional the way the header list is.
 */
export function widgetCatalogFor(admin: boolean): readonly DashboardWidget[] {
  const appWidgets: DashboardWidget[] = programs
    .filter((program) => program.slug !== 'dashboard' && (!program.requiresAdmin || admin))
    .map((program, index) => ({
      id: `app:${program.slug}`,
      label: program.name,
      Component: () => <AppWidget program={program} />,
      app: true,
      // Launchers keep the nav bar's own running order, so the dock and the
      // nav never disagree about where a program sits.
      rank: index,
    }));
  return [...appWidgets, ...functionalWidgets];
}
