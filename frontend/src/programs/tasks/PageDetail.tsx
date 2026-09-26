import { useEffect, useState } from 'react';
import {
  Calendar,
  CircleDot,
  Hash,
  Link2,
  ListChecks,
  Maximize2,
  Minimize2,
  Settings,
  SquareCheck,
  Type,
  X,
} from 'lucide-react';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import type { TaskPageIcon, TaskPageRow, TaskPropertyRow, TaskPropertyType } from '../../data/db';
import { hexToRgba, toneColor } from '../../data/tones';
import { IconPicker } from './IconPicker';
import { PageBody } from './PageBody';
import { deletePage, savePageField, savePageValue } from './store';

/**
 * One page's detail: icon, title, and one field per active property.
 *
 * `mode` swaps the outer container (side-peek vs. fullscreen) — the content
 * itself never changes, so this is one component, not two.
 */
export function PageDetail({
  page,
  properties,
  mode,
  onClose,
  onFullscreen,
  onExitFullscreen,
  onChange,
}: {
  page: TaskPageRow;
  properties: TaskPropertyRow[];
  mode: 'peek' | 'fullscreen';
  onClose: () => void;
  onFullscreen: () => void;
  onExitFullscreen: () => void;
  onChange: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // A different page opened into the same still-mounted detail view (side-peek
  // to side-peek without a close in between) — resync the local title draft.
  useEffect(() => setTitle(page.title), [page.id, page.title]);

  useEffect(() => {
    setShowSettings(false);
    setConfirmingDelete(false);
  }, [page.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && mode === 'peek') {
        event.preventDefault();
        onFullscreen();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        // Steps back one level at a time, matching how Escape conventionally
        // backs out rather than discarding more than the last press implied.
        if (mode === 'fullscreen') onExitFullscreen();
        else onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mode, onFullscreen, onExitFullscreen, onClose]);

  const commitTitle = () => {
    if (title.trim() && title !== page.title) void savePageField(page.id, { title }).then(onChange);
  };

  const setValue = (propertyId: string, value: unknown) => {
    void savePageValue(page.id, propertyId, value).then(onChange);
  };

  const pickIcon = (icon: TaskPageIcon) => {
    setShowIconPicker(false);
    void savePageField(page.id, { icon }).then(onChange);
  };

  const runDelete = () => {
    void deletePage(page.id).then(() => {
      onChange();
      onClose();
    });
  };

  const content = (
    <>
      <div className="tsk__detail-head">
        <button
          type="button"
          className="tsk__detail-icon raised"
          aria-label="Change icon"
          onClick={() => setShowIconPicker(true)}
        >
          {page.icon?.kind === 'upload' ? (
            <img src={page.icon.value} alt="" className="tsk__detail-icon-img" />
          ) : (
            (page.icon?.value ?? '▢')
          )}
        </button>
        <input
          className="tsk__detail-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
        />
        <div className="tsk__detail-actions">
          {mode === 'peek' ? (
            <button
              type="button"
              className="tsk__icon-btn raised"
              aria-label="Enter fullscreen"
              title="Enter fullscreen"
              onClick={onFullscreen}
            >
              <Maximize2 size={15} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="tsk__icon-btn raised"
              aria-label="Exit fullscreen"
              title="Exit fullscreen"
              onClick={onExitFullscreen}
            >
              <Minimize2 size={15} aria-hidden />
            </button>
          )}
          <div className="tsk__detail-settings">
            <button
              type="button"
              className="tsk__icon-btn raised"
              aria-label="Page settings"
              title="Page settings"
              onClick={() => setShowSettings((open) => !open)}
            >
              <Settings size={15} aria-hidden />
            </button>
            {showSettings && (
              <div className="tsk__detail-settings-menu surface-3d rounded-xl" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowSettings(false);
                    setShowIconPicker(true);
                  }}
                >
                  Change icon
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="tsk__detail-settings-danger"
                  onClick={() => (confirmingDelete ? runDelete() : setConfirmingDelete(true))}
                >
                  {confirmingDelete ? 'Really delete?' : 'Delete page'}
                </button>
              </div>
            )}
          </div>
          {mode === 'peek' && (
            <button
              type="button"
              className="tsk__icon-btn raised"
              aria-label="Close"
              title="Close"
              onClick={onClose}
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="tsk__detail-fields">
        {properties.map((property) => (
          <div key={property.id} className="tsk__field">
            <span className="tsk__field-label">
              <PropertyTypeIcon type={property.type} />
              {property.name}
            </span>
            <PropertyValueInput
              property={property}
              value={page.values[property.id]}
              onChange={(value) => setValue(property.id, value)}
            />
          </div>
        ))}
      </div>

      <PageBody page={page} onChange={onChange} />

      {showIconPicker && (
        <IconPicker current={page.icon ?? undefined} onPick={pickIcon} onClose={() => setShowIconPicker(false)} />
      )}
    </>
  );

  if (mode === 'fullscreen') {
    return (
      <div className="tsk__full">
        <div className="tsk__full-bar">
          <span className="font-sans text-[12px] text-muted-foreground">
            Task Tracker <span className="text-subtle-foreground">/</span> {page.title || 'Untitled'}
          </span>
        </div>
        <div className="tsk__full-body">{content}</div>
      </div>
    );
  }

  return (
    <div className="tsk__peek-overlay" onClick={onClose}>
      <div className="tsk__peek surface-3d" onClick={(event) => event.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

function PropertyTypeIcon({ type }: { type: TaskPropertyType }) {
  switch (type) {
    case 'text':
      return <Type size={13} aria-hidden />;
    case 'number':
      return <Hash size={13} aria-hidden />;
    case 'select':
      return <CircleDot size={13} aria-hidden />;
    case 'multiSelect':
      return <ListChecks size={13} aria-hidden />;
    case 'status':
      return <CircleDot size={13} aria-hidden />;
    case 'date':
      return <Calendar size={13} aria-hidden />;
    case 'checkbox':
      return <SquareCheck size={13} aria-hidden />;
    case 'url':
      return <Link2 size={13} aria-hidden />;
  }
}

function PropertyValueInput({
  property,
  value,
  onChange,
}: {
  property: TaskPropertyRow;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (property.type) {
    case 'text':
      return (
        <Input
          className="inset-field rounded-[10px]"
          placeholder="Empty"
          defaultValue={typeof value === 'string' ? value : ''}
          onBlur={(event) => onChange(event.target.value)}
        />
      );

    case 'url':
      return (
        <Input
          className="af-mono inset-field rounded-[10px]"
          placeholder="Empty"
          defaultValue={typeof value === 'string' ? value : ''}
          onBlur={(event) => onChange(event.target.value)}
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          className="af-mono inset-field rounded-[10px]"
          placeholder="Empty"
          defaultValue={typeof value === 'number' ? value : ''}
          onBlur={(event) =>
            onChange(event.target.value === '' ? null : Number(event.target.value))
          }
        />
      );

    case 'date': {
      const iso = typeof value === 'number' ? new Date(value).toISOString().slice(0, 10) : '';
      return (
        <Input
          type="date"
          className="inset-field rounded-[10px]"
          defaultValue={iso}
          onChange={(event) =>
            onChange(event.target.value ? new Date(event.target.value).getTime() : null)
          }
        />
      );
    }

    case 'checkbox':
      return (
        <Checkbox
          checked={Boolean(value)}
          aria-label={property.name}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      );

    case 'select':
    case 'status':
      return (
        <div className="tsk__option-picker">
          {value == null && <span className="tsk__field-empty">Empty</span>}
          {property.options.map((option) => {
            const active = value === option.id;
            const color = toneColor(option.toneIndex);
            return (
              <button
                key={option.id}
                type="button"
                className={`tsk__option tsk__pill${active ? ' is-active glow-active' : ''}`}
                style={{
                  background: hexToRgba(color, 0.14),
                  borderColor: hexToRgba(color, 0.35),
                  color: `color-mix(in srgb, ${color} 70%, white)`,
                }}
                onClick={() => onChange(active ? null : option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );

    case 'multiSelect': {
      const selected = new Set(Array.isArray(value) ? (value as unknown[]).map(String) : []);
      return (
        <div className="tsk__option-picker">
          {selected.size === 0 && <span className="tsk__field-empty">Empty</span>}
          {property.options.map((option) => {
            const active = selected.has(option.id);
            const color = toneColor(option.toneIndex);
            return (
              <button
                key={option.id}
                type="button"
                className={`tsk__option tsk__pill${active ? ' is-active glow-active' : ''}`}
                style={{
                  background: hexToRgba(color, 0.14),
                  borderColor: hexToRgba(color, 0.35),
                  color: `color-mix(in srgb, ${color} 70%, white)`,
                }}
                onClick={() => {
                  const next = new Set(selected);
                  if (next.has(option.id)) next.delete(option.id);
                  else next.add(option.id);
                  onChange([...next]);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }
  }
}
