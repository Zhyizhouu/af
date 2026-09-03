import { AFEmptyState, AFPanel } from '../components/AF';
import { AiScreen } from '../programs/ai/AiScreen';
import { AudioScreen } from '../programs/audio/AudioScreen';
import { DashboardScreen } from '../programs/dashboard/DashboardScreen';
import { CalendarScreen } from '../programs/calendar/CalendarScreen';
import { ChecklistsScreen } from '../programs/checklists/ChecklistsScreen';
import { HabitsScreen } from '../programs/habits/HabitsScreen';
import { ProfileScreen } from '../programs/profile/ProfileScreen';
import { QrScreen } from '../programs/qr/QrScreen';
import { TasksScreen } from '../programs/tasks/TasksScreen';
import type { Program } from './programs';

export interface PaneOptions {
  paneWidth: 'full' | 'split';
}

/**
 * Which component draws which program.
 *
 * Everything not yet ported off Flutter renders as a stub that says so, rather
 * than as a blank pane or a route that 404s. The migration is visible in the
 * app while it is under way, which is the honest state to be in.
 */
export function renderProgram(program: Program, options: PaneOptions) {
  switch (program.slug) {
    case 'dashboard':
      return <DashboardScreen />;
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
    case 'profile':
      return <ProfileScreen />;
    default:
      return <NotPorted program={program} />;
  }
}

function NotPorted({ program }: { program: Program }) {
  return (
    <div style={{ padding: 20, maxWidth: 940, margin: '0 auto' }}>
      <AFPanel label={program.name} count="not ported">
        <AFEmptyState
          glyph={program.mark}
          message={`${program.name} still runs on the Flutter build.\nIt has not been ported to React yet.`}
        />
      </AFPanel>
    </div>
  );
}
