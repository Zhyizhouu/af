import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { TaskPropertyOption } from '../../data/db';
import { initials, parseTaskCommand, startsMatch } from './command';

const isTitleCase = (label: string): boolean => {
  const words = label.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.every((word) => /^\p{Lu}/u.test(word));
};

/**
 * The quick-add tag that resolves to `option`: the first of its initials (only
 * for a Title Case label of two or more words, so "Quality Check" is `>qc`),
 * its last word, its first word or its squashed label that `parseTaskCommand`
 * maps back to that same option. Generated from the real labels, so a renamed
 * or added option shows its own working tag.
 */
export function tagFor(
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

interface TagSuggestionsArgs {
  text: string;
  setText: (text: string) => void;
  paused: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  statusOptions: TaskPropertyOption[];
  priorityOptions: TaskPropertyOption[];
}

export function useTagSuggestions({
  text,
  setText,
  paused,
  inputRef,
  statusOptions,
  priorityOptions,
}: TagSuggestionsArgs) {
  const id = useId();
  const [highlighted, setHighlighted] = useState(0);
  const [caret, setCaret] = useState(0);
  const caretTo = useRef<number | null>(null);

  const fragment = useMemo(() => {
    if (paused) return null;
    const found = /(^|\s)([!>])(\S*)$/.exec(text.slice(0, caret));
    if (!found || (text[caret] !== undefined && !/\s/.test(text[caret]!))) return null;
    const prefix = found[2] as '!' | '>';
    const needle = found[3]!.toLowerCase();
    return { prefix, needle, start: caret - 1 - needle.length, end: caret };
  }, [paused, text, caret]);

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
  const active = Math.min(highlighted, suggestions.length - 1);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && caretTo.current !== null) {
      input.setSelectionRange(caretTo.current, caretTo.current);
      caretTo.current = null;
    }
  }, [text, inputRef]);

  function accept(index: number) {
    const chosen = suggestions[index];
    if (!chosen || !fragment) return;
    const head = `${text.slice(0, fragment.start)}${chosen.tag} `;
    caretTo.current = head.length;
    setText(head + text.slice(fragment.end).replace(/^\s/, ''));
    setCaret(head.length);
    setHighlighted(0);
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>): boolean {
    if (suggestions.length === 0) return false;
    const { key } = event;
    const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : key === 'ArrowRight' || key === 'ArrowDown' ? 1 : 0;
    if (step) {
      event.preventDefault();
      setHighlighted((active + step + suggestions.length) % suggestions.length);
      return true;
    }
    if (key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      accept(active);
      return true;
    }
    return false;
  }

  return {
    id,
    suggestions,
    active,
    accept,
    handleKey,
    setCaret,
    reset: () => setHighlighted(0),
  };
}
