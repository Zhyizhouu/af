import { Link } from 'react-router-dom';
import { Activity, CalendarDays, ClipboardCheck, Music, QrCode, Table2 } from 'lucide-react';
import { cn } from 'cn';
import type { Program } from '../../../app/programs';
import { AIMark } from '../../../components/brand/AIMark';

const icons: Partial<Record<Program['slug'], typeof ClipboardCheck>> = {
  checklists: ClipboardCheck,
  calendar: CalendarDays,
  habits: Activity,
  tasks: Table2,
  audio: Music,
  qr: QrCode,
};

/**
 * A launcher tile for one application, as a dashboard widget in its own
 * right: sized and shown/hidden exactly like any other widget, and
 * independent of Profile's "Displayed Applications" (header) setting.
 */
export function AppWidget({ program }: { program: Program }) {
  const Icon = icons[program.slug];
  return (
    <Link
      to={`/${program.slug}`}
      className={cn(
        'flex h-full w-full items-center justify-center gap-2.5 rounded-[8px] text-foreground no-underline',
        'transition-[filter] duration-150 hover:brightness-110',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
      )}
    >
      {program.slug === 'ai' ? (
        <AIMark size={18} />
      ) : Icon ? (
        <Icon size={18} aria-hidden className="shrink-0 text-subtle-foreground" />
      ) : null}
      <span className="truncate text-sm @max-[111px]:hidden">{program.name}</span>
    </Link>
  );
}
