import type { ReactNode, RefObject } from 'react';
import type { TaskPropertyOption } from '../../data/db';
import { parseTaskCommand } from './command';
import { toneStyle } from './StatusBadge';

function highlight(
  text: string,
  statusOptions: TaskPropertyOption[],
  priorityOptions: TaskPropertyOption[],
): ReactNode[] {
  return text.split(/(\s+)/).map((part, index) => {
    if ((part[0] === '!' || part[0] === '>') && part.length > 1) {
      const token = parseTaskCommand(part, statusOptions, priorityOptions).tokens[0];
      const option = (token?.kind === 'status' ? statusOptions : priorityOptions).find(
        (candidate) => candidate.id === token?.optionId,
      );
      if (option) {
        return (
          <span key={index} className="tsk-command__tag" style={toneStyle(option.toneIndex)}>
            {part}
          </span>
        );
      }
    }
    return part;
  });
}

interface TagMirrorProps {
  text: string;
  plain: boolean;
  statusOptions: TaskPropertyOption[];
  priorityOptions: TaskPropertyOption[];
  mirrorRef: RefObject<HTMLDivElement | null>;
}

export function TagMirror({ text, plain, statusOptions, priorityOptions, mirrorRef }: TagMirrorProps) {
  return (
    <div className="tsk-command__mirror" ref={mirrorRef} aria-hidden="true">
      {plain ? text : highlight(text, statusOptions, priorityOptions)}
    </div>
  );
}
