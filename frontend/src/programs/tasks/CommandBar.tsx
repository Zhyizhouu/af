import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from 'cn';
import type { TaskPageRow, TaskPropertyRow } from '../../data/db';
import { parseTaskCommand, type TaskCommandResult } from './command';
import { CommandPalette, maxRows, PickedChip, StatusSteps, useOpenMatches } from './CommandPalette';
import { PriorityText } from './PriorityText';
import { StatusBadge, toneStyle } from './StatusBadge';
import { defaultOptions, findPriorityProperty, savePageValue } from './store';
import { TagMirror } from './TagMirror';
import { useAddFlight } from './useAddFlight';
import { tagFor, useTagSuggestions } from './useTagSuggestions';
import type { TriageDrag } from './useTriageDrag';
import './badges.css';

const placeholder = 'New page… try: Grade quiz 3 !high >progress';
const pickedPlaceholder = 'Add !priority or >status and press Enter';

const emptyTitleHint = 'Type a title first';
const failedHint = 'Could not add, try again';

interface CommandBarProps {
  properties: TaskPropertyRow[];
  pages: TaskPageRow[];
  drag: TriageDrag;
  commit: (action: () => Promise<unknown>) => Promise<void>;
  /** Called with the parsed command when a non-empty title is submitted; resolves to the new page's id. */
  onSubmit: (command: TaskCommandResult) => Promise<string | void> | void;
  onOpen: (pageId: string) => void;
  gridRef?: RefObject<HTMLElement | null>;
}

/**
 * The quick-add line shared by both views. Two modes: type a title with
 * optional `!priority` and `>status` tags, watch the parsed result preview,
 * and press Enter to create the page without opening it; or start with `/` to
 * find an open page, pick it, then step its status, tag it, or open it.
 */
export function CommandBar({ properties, pages, drag, commit, onSubmit, onOpen, gridRef }: CommandBarProps) {
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const submitting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const listId = `${uid}-list`;

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

  const matches = useOpenMatches(finding, text, pages, properties, priority, status);
  const rows = matches.slice(0, maxRows);
  const activeRow = Math.min(active, rows.length - 1);

  const tags = useTagSuggestions({ text, setText, paused: finding, inputRef, statusOptions, priorityOptions });
  const { suggestions } = tags;
  const add = useAddFlight(gridRef);

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
      ? `${tags.id}-${tags.active}`
      : undefined;

  const syncMirror = () => {
    if (mirrorRef.current && inputRef.current) mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
  };

  useLayoutEffect(syncMirror, [text]);

  function submit() {
    if (submitting.current) return;
    if (!command.title) {
      setHint(emptyTitleHint);
      add.shake();
      return;
    }
    const from = inputRef.current?.getBoundingClientRect();
    const title = command.title;
    submitting.current = true;
    setHint(null);
    new Promise<string | void>((resolve) => resolve(onSubmit(command))).then(
      (pageId) => {
        submitting.current = false;
        if (!add.alive.current) return;
        setText('');
        if (typeof pageId === 'string') add.celebrate(pageId, title, from);
      },
      () => {
        submitting.current = false;
        if (add.alive.current) setHint(failedHint);
      },
    );
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
    if (tags.handleKey(event)) return;
    const { key } = event;

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
    tags.setCaret(input.selectionStart ?? input.value.length);
    syncMirror();
  };

  return (
    <div className={cn('tsk-command', text.length > 0 && 'is-typing', add.shaking && 'is-shaking')}>
      <div className="tsk-command__row">
        <span className="tsk-command__prompt" aria-hidden="true">
          &gt;
        </span>
        {picked && <PickedChip title={picked.title} onClear={clearPick} />}
        <div className="tsk-command__field">
          <TagMirror
            text={text}
            plain={finding}
            statusOptions={statusOptions}
            priorityOptions={priorityOptions}
            mirrorRef={mirrorRef}
          />
          <input
            ref={inputRef}
            className="tsk-command__input"
            placeholder={picked ? pickedPlaceholder : placeholder}
            aria-label="New page command"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? (finding ? listId : tags.id) : undefined}
            aria-activedescendant={activeId}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setHint(null);
              setActive(0);
              tags.reset();
              track(event.target);
            }}
            onKeyDown={onKeyDown}
            onKeyUp={(event) => track(event.currentTarget)}
            onSelect={(event) => track(event.currentTarget)}
            onScroll={syncMirror}
          />
        </div>
        <span className="tsk-command__status" role="status">
          {add.added && <span className="tsk-command__added">Added</span>}
        </span>
        <span className="tsk-command__key" aria-hidden="true">
          Enter
        </span>
      </div>

      {suggestions.length > 0 && (
        <div className="tsk-command__suggest" role="listbox" id={tags.id} aria-label="Tag suggestions">
          {suggestions.map(({ option, tag }, index) => (
            <span
              key={option.id}
              id={`${tags.id}-${index}`}
              role="option"
              aria-selected={index === tags.active}
              className={cn('tsk-command__suggestion', index === tags.active && 'is-active')}
              style={toneStyle(option.toneIndex)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => tags.accept(index)}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {finding && (
        <CommandPalette
          matches={matches}
          activeRow={activeRow}
          listId={listId}
          optionId={(pageId) => `${uid}-opt-${pageId}`}
          status={status}
          priority={priority}
          statusOptions={statusOptions}
          priorityOptions={priorityOptions}
          drag={drag}
          onPick={pick}
        />
      )}

      {picked && status && (
        <StatusSteps
          options={statusOptions}
          current={statusAt}
          onStep={(optionId) => {
            setStatus(optionId);
            inputRef.current?.focus();
          }}
        />
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
              {hint}
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

      {add.flight &&
        createPortal(
          <span
            className="tsk-command__ghost"
            aria-hidden="true"
            style={
              {
                left: add.flight.rect.left,
                top: add.flight.rect.top,
                height: add.flight.rect.height,
                maxWidth: add.flight.rect.width,
                '--dx': `${add.flight.dx}px`,
                '--dy': `${add.flight.dy}px`,
              } as CSSProperties
            }
          >
            {add.flight.title}
          </span>,
          document.body,
        )}
    </div>
  );
}
