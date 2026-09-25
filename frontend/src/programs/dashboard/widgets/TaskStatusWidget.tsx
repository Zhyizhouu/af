import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { listPages, listProperties } from '../../tasks/store';
import { toneColor } from '../../../data/tones';
import type { TaskPageRow, TaskPropertyRow } from '../../../data/db';
import { countByStatus } from './statMath';

const radius = 66;
const circumference = 2 * Math.PI * radius;
const gap = 2;
const noStatusColor = '#71717a';

export function TaskStatusWidget() {
  const { revision } = useSession();
  const [pages, setPages] = useState<TaskPageRow[]>([]);
  const [properties, setProperties] = useState<TaskPropertyRow[]>([]);

  const reload = useCallback(async () => {
    setProperties(await listProperties());
    setPages(await listPages());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const counts = countByStatus(pages, properties);
  const total = counts.reduce((sum, row) => sum + row.count, 0);
  const segments = counts.filter((row) => row.count > 0);
  const ariaLabel = `${total} tasks: ${segments.map((row) => `${row.count} ${row.label.toLowerCase()}`).join(', ')}`;

  let offset = 0;
  const arcs = segments.map((row) => {
    const length = (row.count / total) * circumference - gap;
    const arc = {
      id: row.id,
      color: row.toneIndex === null ? noStatusColor : toneColor(row.toneIndex),
      dasharray: `${Math.max(0, length)} ${circumference - length}`,
      dashoffset: -offset,
    };
    offset += (row.count / total) * circumference;
    return arc;
  });

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Task status</h2>
        <Link to="/tasks" className="text-xs text-muted-foreground no-underline hover:text-glow">
          Open Task Tracker
        </Link>
      </div>

      {total === 0 ? (
        <p className="text-[13px] text-muted-foreground">No tasks yet.</p>
      ) : (
        <div className="flex items-center gap-7 pt-2">
          <div className="relative h-[180px] w-[180px] shrink-0">
            <svg width={180} height={180} viewBox="0 0 180 180" role="img" aria-label={ariaLabel}>
              <circle cx={90} cy={90} r={radius} fill="none" stroke="#161618" strokeWidth={18} />
              <g transform="rotate(-90 90 90)" fill="none" strokeWidth={18}>
                {arcs.map((arc) => (
                  <circle
                    key={arc.id}
                    cx={90}
                    cy={90}
                    r={radius}
                    stroke={arc.color}
                    strokeDasharray={arc.dasharray}
                    strokeDashoffset={arc.dashoffset}
                  />
                ))}
              </g>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[30px] font-semibold [letter-spacing:-0.02em]">{total}</span>
              <span className="text-xs text-muted-foreground">tasks</span>
            </div>
          </div>
          <ul className="m-0 flex flex-1 list-none flex-col gap-3 p-0 text-[13px]">
            {counts
              .filter((row) => row.count > 0)
              .map((row) => (
                <li key={row.id} className="flex items-center gap-2.5">
                  <span
                    className="size-[10px] shrink-0 rounded-[3px]"
                    style={{ background: row.toneIndex === null ? noStatusColor : toneColor(row.toneIndex) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-subtle-foreground">{row.label}</span>
                  <span className="[font-variant-numeric:tabular-nums]">{row.count}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
