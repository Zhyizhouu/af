import { AiScreen } from '../programs/ai/AiScreen';
import { AudioScreen } from '../programs/audio/AudioScreen';
import { DashboardScreen } from '../programs/dashboard/DashboardScreen';
import { CalendarScreen } from '../programs/calendar/CalendarScreen';
import { ChecklistsScreen } from '../programs/checklists/ChecklistsScreen';
import { HabitsScreen } from '../programs/habits/HabitsScreen';
import { QrScreen } from '../programs/qr/QrScreen';
import { TasksScreen } from '../programs/tasks/TasksScreen';
import { TodoScreen } from '../programs/todo/TodoScreen';
import type { Program } from './programs';

export interface PaneOptions {
  paneWidth: 'full' | 'split';
}

/**
 * Which component draws which program.
 *
 * Every slug in `programs.ts` is handled; an unknown one renders nothing.
 */
export function renderProgram(program: Program, options: PaneOptions) {
  switch (program.slug) {
    case 'dashboard':
      return <DashboardScreen />;
    case 'todo':
      return <TodoScreen paneWidth={options.paneWidth} />;
    case 'ai':
      return <AiScreen paneWidth={options.paneWidth} />;
    case 'qr':
      return <QrScreen />;
    case 'calendar':
      return <CalendarScreen paneWidth={options.paneWidth} />;
    case 'checklists':
      return <ChecklistsScreen />;
    case 'habits':
      return <HabitsScreen />;
    case 'tasks':
      return <TasksScreen paneWidth={options.paneWidth} />;
    case 'audio':
      return <AudioScreen />;
    default:
      return null;
  }
}
