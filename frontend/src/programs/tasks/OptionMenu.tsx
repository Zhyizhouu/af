import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import type { TaskPropertyOption, TaskPropertyRow } from '../../data/db';
import { PriorityFlag } from './PriorityFlag';
import { PriorityText } from './PriorityText';
import { StatusBadge } from './StatusBadge';
import './badges.css';

const neutralTone = 4;

interface OptionMarkProps {
  property: TaskPropertyRow;
  option: TaskPropertyOption;
  isPriority: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  priorityStyle?: 'flag' | 'text';
}

/**
 * The badge or flag a property's option is drawn as: a tone-coloured badge
 * for status, a signal-bar flag (or plain tone text) for priority, and a
 * neutral badge for any other select.
 */
export function OptionMark({ property, option, isPriority, onClick, priorityStyle = 'flag' }: OptionMarkProps) {
  if (property.type === 'status') {
    return <StatusBadge option={option} onClick={onClick} />;
  }
  if (isPriority && priorityStyle === 'text') {
    return <PriorityText option={option} onClick={onClick} caption={property.name} />;
  }
  if (isPriority) {
    return (
      <PriorityFlag option={option} options={property.options} onClick={onClick} caption={property.name} />
    );
  }
  return (
    <StatusBadge
      option={{ label: option.label, toneIndex: neutralTone }}
      onClick={onClick}
      caption={property.name}
    />
  );
}

export interface MenuSection {
  property: TaskPropertyRow;
  /** The page's current option id for this property. */
  value: unknown;
  isPriority: boolean;
}

interface OptionMenuProps {
  /** The trigger the menu hangs under, and where focus returns on Escape. */
  anchor: HTMLElement;
  sections: MenuSection[];
  onPick: (propertyId: string, optionId: string) => void;
  /** When given, an "Open page" item follows the option sections. */
  onOpenPage?: () => void;
  onClose: () => void;
  priorityStyle?: 'flag' | 'text';
}

const gap = 4;
const edge = 8;

/**
 * A popover of options for one or more properties, portalled to the body and
 * placed under its trigger (above it near the bottom of the viewport). Arrow
 * keys move between items, Enter picks, Escape closes and refocuses the
 * trigger; a press outside, a scroll or a resize closes it.
 */
export function OptionMenu({ anchor, sections, onPick, onOpenPage, onClose, priorityStyle }: OptionMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const trigger = anchor.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    const below = trigger.bottom + gap;
    const above = trigger.top - gap - height;
    const top = below + height > window.innerHeight - edge && above >= edge ? above : below;
    const left = Math.max(edge, Math.min(trigger.left, window.innerWidth - width - edge));
    setPosition({ top, left });
    const items = element.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    const current = element.querySelector<HTMLElement>('[aria-checked="true"]');
    (current ?? items[0])?.focus({ preventScroll: true });
  }, [anchor]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menu.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    }
    function onScroll(event: Event) {
      if (menu.current?.contains(event.target as Node)) return;
      onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        return focusAt(index + 1);
      case 'ArrowUp':
        return focusAt(index <= 0 ? items.length - 1 : index - 1);
      case 'Home':
        return focusAt(0);
      case 'End':
        return focusAt(items.length - 1);
      case 'Enter':
        event.preventDefault();
        return items[index]?.click();
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return anchor.focus();
      case 'Tab':
        return onClose();
    }
  }

  return createPortal(
    <div
      ref={menu}
      role="menu"
      className="tsk-menu"
      style={position ? { top: position.top, left: position.left } : { top: 0, left: 0, visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      {sections.map((section) => (
        <div key={section.property.id} role="group" aria-label={section.property.name} className="tsk-menu__group">
          {(sections.length > 1 || onOpenPage) && (
            <div className="tsk-menu__label" aria-hidden="true">
              {section.property.name}
            </div>
          )}
          {section.property.options.map((option) => {
            const checked = section.value === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={-1}
                className="tsk-menu__item"
                onClick={() => onPick(section.property.id, option.id)}
              >
                <OptionMark
                  property={section.property}
                  option={option}
                  isPriority={section.isPriority}
                  priorityStyle={priorityStyle}
                />
                {checked && <Check size={14} aria-hidden className="tsk-menu__check" />}
              </button>
            );
          })}
        </div>
      ))}
      {onOpenPage && (
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          className="tsk-menu__item tsk-menu__open"
          onClick={onOpenPage}
        >
          Open page
        </button>
      )}
    </div>,
    document.body,
  );
}
