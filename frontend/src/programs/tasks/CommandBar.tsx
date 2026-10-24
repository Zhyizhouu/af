import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from 'cn';
import { isPageDone } from '../../data/agenda';
import type { TaskPageRow, TaskPropertyOption, TaskPropertyRow } from '../../data/db';
import { initials, parseTaskCommand, startsMatch, type TaskCommandResult } from './command';
import { PriorityText } from './PriorityText';
import { StatusBadge, toneStyle } from './StatusBadge';
import { defaultOptions, findPriorityProperty, savePageValue } from './store';
import type { TriageDrag } from './useTriageDrag';
import './badges.css';

const placeholder = 'New page… try: Grade quiz 3 !high >progress';
const pickedPlaceholder = 'Add !priority or >status and press Enter';

const maxRows = 8;
const shakeMs = 260;
const addedMs = 900;
const flightMs = 420;
const landedMs = 700;
const findTries = 15;
const findEveryMs = 16;

interface Flight {
  title: string;
  rect: { left: number; top: number; width: number; height: number };
  dx: number;
  dy: number;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

const isTitleCase = (label: string): boolean => {
  const words = label.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.every((word) => /^\p{Lu}/u.test(word));
};
const statusUrgency = ['in progress', 'quality check', 'not started'];

const urgencyOf = (label: string | undefined): number => {
  const at = statusUrgency.indexOf(label?.trim().toLowerCase() ?? '');
  return at < 0 ? statusUrgency.length : at;
};

/**
 * The quick-add tag that resolves to `option`: the first of its initials (only
 * for a Title Case label of two or more words, so "Quality Check" is `>qc`),
 * its last word, its first word or its squashed label that `parseTaskCommand`
 * maps back to that same option. Generated from the real labels, so a renamed
 * or added option shows its own working tag.
 */
function tagFor(
  prefix: '!' | '>',
  option: TaskPropertyOption,
  options: TaskPropertyOption[],
): string {
  const words = option.label.toLowerCase().split(/\s+/).filter(Boolean);
  const candidates = [
    isTitleCase(option.label) ? initials(option.label) : '',
    words[words.length - 1],
    words[0],
    words.join(''),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed =
      prefix === '!'
        ? parseTaskCommand(`!${candidate}`, [], options)
        : parseTaskCommand(`>${candidate}`, options, []);
    if ((prefix === '!' ? parsed.priorityId : parsed.statusId) === option.id) return `${prefix}${candidate}`;
  }
  return `${prefix}${words.join('')}`;
}

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

interface CommandBarProps {
  properties: TaskPropertyRow[];
  pages: TaskPageRow[];
  drag: TriageDrag;
  commit: (action: () => Promise<unknown>) => Promise<void>;
  /** Called with the parsed command when a non-empty title is submitted; resolves to the new page's id. */
  onSubmit: (command: TaskCommandResult) => Promise<string | void> | void;
  onOpen: (pageId: string) => void;
}

/**
 * The quick-add line shared by both views. Two modes: type a title with
 * optional `!priority` and `>status` tags, watch the parsed result preview,
 * and press Enter to create the page without opening it; or start with `/` to
 * find an open page, pick it, then step its status, tag it, or open it.
 */
export function CommandBar({ properties, pages, drag, commit, onSubmit, onOpen }: CommandBarProps) {
  const [text, setText] = useState('');
  const [hint, setHint] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [suggest, setSuggest] = useState(0);
  const [caret, setCaret] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [added, setAdded] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const alive = useRef(true);
  const timers = useRef(new Set<number>());
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const caretTo = useRef<number | null>(null);
  const uid = useId();
  const listId = `${uid}-list`;
  const suggestId = `${uid}-suggest`;

  const status = properties.find((property) => property.type === 'status');
  const priority = findPriorityProperty(properties);
  const statusOptions = useMemo(() => status?.options ?? [], [status]);
  const priorityOptions = useMemo(() => priority?.options ?? [], [priority]);
  const command = useMemo(
    () => parseTaskCommand(text, statusOptions, priorityOptions),
    [text, statusOptions, priorityOptions],
  );
  const defaults = useMemo(() => defaultOptions(properties), [properties]);

  const picked = pickedId ? pages.find((page) => page.id === pickedId) : undefined;
  const finding = !picked && text.startsWith('/');

  const matches = useMemo(() => {
    if (!finding) return [];
    const needle = text.slice(1).trim().toLowerCase();
    const priorityRank = (page: TaskPageRow) => {
      const at = priority ? priorityOptions.findIndex((option) => option.id === page.values[priority.id]) : -1;
      return at < 0 ? priorityOptions.length : at;
    };
    const statusRank = (page: TaskPageRow) =>
      urgencyOf(statusOptions.find((option) => option.id === (status && page.values[status.id]))?.label);
    return pages
      .filter((page) => !isPageDone(page, properties) && page.title.toLowerCase().includes(needle))
      .sort((a, b) => priorityRank(a) - priorityRank(b) || statusRank(a) - statusRank(b));
  }, [finding, text, pages, properties, priority, priorityOptions, status, statusOptions]);
  const rows = matches.slice(0, maxRows);
  const activeRow = Math.min(active, rows.length - 1);

  const fragment = useMemo(() => {
    if (finding) return null;
    const found = /(^|\s)([!>])(\S*)$/.exec(text.slice(0, caret));
    if (!found || (text[caret] !== undefined && !/\s/.test(text[caret]!))) return null;
    const prefix = found[2] as '!' | '>';
    const needle = found[3]!.toLowerCase();
    return { prefix, needle, start: caret - 1 - needle.length, end: caret };
  }, [finding, text, caret]);

  const suggestions = useMemo(() => {
    if (!fragment) return [];
    const options = fragment.prefix === '!' ? priorityOptions : statusOptions;
    const found = options
      .map((option) => ({ option, tag: tagFor(fragment.prefix, option, options) }))
      .filter(
        ({ option, tag }) => tag.slice(1).startsWith(fragment.needle) || startsMatch(option.label, fragment.needle),
      );
    return found.length === 1 && found[0]!.tag === `${fragment.prefix}${fragment.needle}` ? [] : found;
  }, [fragment, priorityOptions, statusOptions]);
  const activeSuggestion = Math.min(suggest, suggestions.length - 1);

  const statusAt = status && picked ? statusOptions.findIndex((option) => option.id === picked.values[status.id]) : -1;

  const statusOption =
    status?.options.find((option) => option.id === command.statusId) ??
    defaults.find((entry) => entry.property.id === status?.id)?.option;
  const priorityOption =
    priority?.options.find((option) => option.id === command.priorityId) ??
    defaults.find((entry) => entry.property.id === priority?.id)?.option;

  const expanded = finding || suggestions.length > 0;
  const activeId = finding
    ? rows[activeRow] && `${uid}-opt-${rows[activeRow].id}`
    : suggestions.length > 0
      ? `${suggestId}-${activeSuggestion}`
      : undefined;

  const syncMirror = () => {
    if (mirrorRef.current && inputRef.current) mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
  };

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && caretTo.current !== null) {
      input.setSelectionRange(caretTo.current, caretTo.current);
      caretTo.current = null;
    }
    syncMirror();
  }, [text]);

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach((id) => window.clearTimeout(id));
      pending.clear();
    };
  }, []);

  const later = useCallback((action: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      action();
    }, ms);
    timers.current.add(id);
  }, []);

  const land = useCallback(
    (chip: HTMLElement) => {
      const cell = chip.closest<HTMLElement>('.tsk-grid__cell');
      if (!cell) return;
      cell.classList.add('is-landed');
      later(() => cell.classList.remove('is-landed'), landedMs);
    },
    [later],
  );

  const celebrate = useCallback(
    (pageId: string, title: string, from: DOMRect | undefined) => {
      setAdded(true);
      later(() => setAdded(false), addedMs);
      const seek = (tries: number) => {
        if (!alive.current) return;
        const chip = document.querySelector<HTMLElement>(`[data-page-id="${pageId}"]`);
        if (!chip) {
          if (tries > 0) later(() => seek(tries - 1), findEveryMs);
          return;
        }
        if (!from || prefersReducedMotion()) {
          land(chip);
          return;
        }
        const to = chip.getBoundingClientRect();
        setFlight({
          title,
          rect: { left: from.left, top: from.top, width: from.width, height: from.height },
          dx: to.left - from.left,
          dy: to.top - from.top,
        });
        later(() => {
          setFlight(null);
          land(chip);
        }, flightMs);
      };
      seek(findTries);
    },
    [later, land],
  );

  function submit() {
    if (!command.title) {
      setHint(true);
      setShaking(true);
      later(() => setShaking(false), shakeMs);
      return;
    }
    const from = inputRef.current?.getBoundingClientRect();
    const title = command.title;
    setText('');
    setHint(false);
    void Promise.resolve(onSubmit(command)).then((pageId) => {
      if (typeof pageId === 'string' && alive.current) celebrate(pageId, title, from);
    });
  }

  function pick(page: TaskPageRow) {
    setPickedId(page.id);
    setText('');
    setActive(0);
    inputRef.current?.focus();
  }

  function clearPick() {
    setPickedId(null);
    setText('');
    setActive(0);
    inputRef.current?.focus();
  }

  function setStatus(optionId: string) {
    if (!picked || !status || picked.values[status.id] === optionId) return false;
    void commit(() => savePageValue(picked.id, status.id, optionId));
    return true;
  }

  function accept(index: number) {
    const chosen = suggestions[index];
    if (!chosen || !fragment) return;
    const head = `${text.slice(0, fragment.start)}${chosen.tag} `;
    caretTo.current = head.length;
    setText(head + text.slice(fragment.end).replace(/^\s/, ''));
    setCaret(head.length);
    setSuggest(0);
  }

  function applyTags() {
    if (!picked || command.tokens.length === 0) return;
    const { statusId, priorityId } = command;
    setText('');
    void commit(async () => {
      if (status && statusId) await savePageValue(picked.id, status.id, statusId);
      if (priority && priorityId) await savePageValue(picked.id, priority.id, priorityId);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const { key } = event;

    if (suggestions.length > 0) {
      const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : key === 'ArrowRight' || key === 'ArrowDown' ? 1 : 0;
      if (step) {
        event.preventDefault();
        setSuggest((activeSuggestion + step + suggestions.length) % suggestions.length);
        return;
      }
      if (key === 'Tab' && !event.shiftKey) {
        event.preventDefault();
        accept(activeSuggestion);
        return;
      }
    }

    if (finding) {
      if ((key === 'ArrowDown' || key === 'ArrowUp') && rows.length > 0) {
        event.preventDefault();
        setActive((activeRow + (key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length);
      } else if (key === 'Enter') {
        event.preventDefault();
        if (rows[activeRow]) pick(rows[activeRow]);
      } else if (key === 'Escape') {
        setText('');
      }
      return;
    }

    if (picked) {
      if (key === 'Escape') {
        event.preventDefault();
        clearPick();
      } else if (key === 'Tab') {
        const target = statusOptions[statusAt + (event.shiftKey ? -1 : 1)];
        if (target) {
          event.preventDefault();
          setStatus(target.id);
        }
      } else if (key === 'Enter') {
        event.preventDefault();
        if (text.trim()) applyTags();
        else onOpen(picked.id);
      }
      return;
    }

    if (key !== 'Enter') return;
    event.preventDefault();
    submit();
  }

  const track = (input: HTMLInputElement) => {
    setCaret(input.selectionStart ?? input.value.length);
    syncMirror();
  };

  return (
    <div className={cn('tsk-command', text.length > 0 && 'is-typing', shaking && 'is-shaking')}>
      <div className="tsk-command__row">
        <span className="tsk-command__prompt" aria-hidden="true">
          &gt;
        </span>
        {picked && (
          <span className="tsk-command__chip">
            <span>{picked.title}</span>
            <button type="button" aria-label="Clear picked task" onClick={clearPick}>
              <X size={12} aria-hidden />
            </button>
          </span>
        )}
        <div className="tsk-command__field">
          <div className="tsk-command__mirror" ref={mirrorRef} aria-hidden="true">
            {finding ? text : highlight(text, statusOptions, priorityOptions)}
          </div>
          <input
            ref={inputRef}
            className="tsk-command__input"
            placeholder={picked ? pickedPlaceholder : placeholder}
            aria-label="New page command"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? (finding ? listId : suggestId) : undefined}
            aria-activedescendant={activeId}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setHint(false);
              setActive(0);
              setSuggest(0);
              track(event.target);
            }}
            onKeyDown={onKeyDown}
            onKeyUp={(event) => track(event.currentTarget)}
            onSelect={(event) => track(event.currentTarget)}
            onScroll={syncMirror}
          />
        </div>
        <span className="tsk-command__status" role="status">
          {added && <span className="tsk-command__added">Added</span>}
        </span>
        <span className="tsk-command__key" aria-hidden="true">
          Enter
        </span>
      </div>

      {suggestions.length > 0 && (
        <div className="tsk-command__suggest" role="listbox" id={suggestId} aria-label="Tag suggestions">
          {suggestions.map(({ option, tag }, index) => (
            <span
              key={option.id}
              id={`${suggestId}-${index}`}
              role="option"
              aria-selected={index === activeSuggestion}
              className={cn('tsk-command__suggestion', index === activeSuggestion && 'is-active')}
              style={toneStyle(option.toneIndex)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => accept(index)}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {finding && (
        <div className="tsk-palette">
          <ul className="tsk-palette__list" role="listbox" id={listId} aria-label="Open tasks">
            {rows.map((page, index) => {
              const option = status && statusOptions.find((candidate) => candidate.id === page.values[status.id]);
              const rank = priority && priorityOptions.find((candidate) => candidate.id === page.values[priority.id]);
              return (
                <li
                  key={page.id}
                  {...drag.chip(page)}
                  id={`${uid}-opt-${page.id}`}
                  role="option"
                  aria-selected={index === activeRow}
                  className={cn(
                    'tsk-palette__row',
                    index === activeRow && 'is-active',
                    drag.dragId === page.id && 'is-lifted',
                  )}
                  onKeyDown={undefined}
                  onClick={() => pick(page)}
                >
                  <span className="tsk-palette__title">{page.title}</span>
                  {rank && <span className="sr-only">Priority: {rank.label}</span>}
                  {option && <StatusBadge option={option} />}
                </li>
              );
            })}
          </ul>
          {matches.length === 0 && <p className="tsk-palette__note">No open tasks match</p>}
          {matches.length > maxRows && <p className="tsk-palette__note">{matches.length - maxRows} more</p>}
        </div>
      )}

      {picked && status && (
        <div className="tsk-steps" role="group" aria-label="Status">
          {statusOptions.map((option, index) => (
            <button
              key={option.id}
              type="button"
              className={cn('tsk-steps__step', index < statusAt && 'is-passed', index === statusAt && 'is-current')}
              style={toneStyle(option.toneIndex)}
              aria-current={index === statusAt ? 'step' : undefined}
              onClick={() => {
                setStatus(option.id);
                inputRef.current?.focus();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {!finding && !picked && (
        <div className="tsk-command__preview" aria-live="polite">
          {text.trim() ? (
            <>
              <span>{command.title || <em>title</em>}</span>
              {status && statusOption && <StatusBadge option={statusOption} />}
              {priority && priorityOption && <PriorityText option={priorityOption} />}
            </>
          ) : defaults.length > 0 ? (
            <span>Defaults: {defaults.map((entry) => entry.option.label).join(', ')}</span>
          ) : (
            <span>Type a title and press Enter.</span>
          )}
          {hint && (
            <span role="alert" className="tsk-command__hint">
              Type a title first
            </span>
          )}
        </div>
      )}

      {(priority || status) && (
        <div className="tsk-command__help">
          {priority && (
            <>
              {priority.options.map((option) => (
                <code key={option.id}>{tagFor('!', option, priority.options)}</code>
              ))}{' '}
              sets priority
            </>
          )}
          {priority && status && ' · '}
          {status && (
            <>
              {status.options.map((option) => (
                <code key={option.id}>{tagFor('>', option, status.options)}</code>
              ))}{' '}
              sets status
            </>
          )}
        </div>
      )}

      {flight &&
        createPortal(
          <span
            className="tsk-command__ghost"
            aria-hidden="true"
            style={
              {
                left: flight.rect.left,
                top: flight.rect.top,
                height: flight.rect.height,
                maxWidth: flight.rect.width,
                '--dx': `${flight.dx}px`,
                '--dy': `${flight.dy}px`,
              } as CSSProperties
            }
          >
            {flight.title}
          </span>,
          document.body,
        )}
    </div>
  );
}
