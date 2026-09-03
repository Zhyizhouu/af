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
}

const functionalWidgets: readonly DashboardWidget[] = [
  { id: 'habits', label: 'Habits today', Component: HabitsWidget, app: false },
  { id: 'completion', label: 'Completion', Component: CompletionWidget, app: false },
  { id: 'today', label: 'Today', Component: TodayWidget, app: false },
  { id: 'upNext', label: 'Up next', Component: UpNextWidget, app: false },
  { id: 'tasks', label: 'Tasks', Component: TasksWidget, app: false },
  { id: 'todo', label: 'To-do', Component: TodoWidget, app: false },
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
    .map((program) => ({
      id: `app:${program.slug}`,
      label: program.name,
      Component: () => <AppWidget program={program} />,
      app: true,
    }));
  return [...appWidgets, ...functionalWidgets];
}
