import type { ReactElement } from 'react';
import { CompletionWidget } from './CompletionWidget';
import { HabitsWidget } from './HabitsWidget';
import { TasksWidget } from './TasksWidget';
import { TodayWidget } from './TodayWidget';
import { TodoWidget } from './TodoWidget';
import { UpNextWidget } from './UpNextWidget';

/**
 * Every dashboard widget, in the order a first-time account sees them.
 *
 * One list, the same rule `app/programs.ts` follows for the nav bar: the
 * default order, the customize panel, and the render loop all read this
 * rather than each keeping their own copy.
 */
export const widgetCatalog: readonly { id: string; label: string; Component: () => ReactElement }[] = [
  { id: 'habits', label: 'Habits today', Component: HabitsWidget },
  { id: 'completion', label: 'Completion', Component: CompletionWidget },
  { id: 'today', label: 'Today', Component: TodayWidget },
  { id: 'upNext', label: 'Up next', Component: UpNextWidget },
  { id: 'tasks', label: 'Tasks', Component: TasksWidget },
  { id: 'todo', label: 'To-do', Component: TodoWidget },
];

export const widgetById = new Map(widgetCatalog.map((widget) => [widget.id, widget]));
