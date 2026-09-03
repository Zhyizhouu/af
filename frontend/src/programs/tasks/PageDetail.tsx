import { useEffect, useState } from 'react';
import { AFButton, AFTag } from '../../components/AF';
import type { TaskPageIcon, TaskPageRow, TaskPropertyRow } from '../../data/db';
import { IconPicker } from './IconPicker';
import { savePageField, savePageValue } from './store';

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

  // A different page opened into the same still-mounted detail view (side-peek
  // to side-peek without a close in between) — resync the local title draft.
  useEffect(() => setTitle(page.title), [page.id, page.title]);

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

  const content = (
    <>
      <div className="tsk__detail-head">
        <button
          type="button"
          className="tsk__detail-icon"
          onClick={() => setShowIconPicker(true)}
        >
          {page.icon?.kind === 'upload' ? (
            <img src={page.icon.value} alt="" className="tsk__icon-img" />
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
      </div>

      <div className="tsk__detail-fields">
        {properties.map((property) => (
          <div key={property.id} className="tsk__field">
            <span className="af-panel-label">{property.name}</span>
            <PropertyValueInput
              property={property}
              value={page.values[property.id]}
              onChange={(value) => setValue(property.id, value)}
            />
          </div>
        ))}
      </div>

      {showIconPicker && (
        <IconPicker onPick={pickIcon} onClose={() => setShowIconPicker(false)} />
      )}
    </>
  );

  if (mode === 'fullscreen') {
    return (
      <div className="tsk__full">
        <div className="tsk__full-bar">
          <span className="af-meta">Task Tracker / {page.title || 'Untitled'}</span>
          <AFButton label="Exit fullscreen" variant="quiet" onClick={onExitFullscreen} />
        </div>
        <div className="tsk__full-body">{content}</div>
      </div>
    );
  }

  return (
    <div className="tsk__peek-overlay" onClick={onClose}>
      <div className="tsk__peek" onClick={(event) => event.stopPropagation()}>
        <div className="tsk__peek-bar">
          <AFButton label="Close" variant="quiet" onClick={onClose} />
        </div>
        {content}
      </div>
    </div>
  );
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
        <input
          className="af-input af-input--prose"
          defaultValue={typeof value === 'string' ? value : ''}
          onBlur={(event) => onChange(event.target.value)}
        />
      );

    case 'url':
      return (
        <input
          className="af-input af-mono"
          defaultValue={typeof value === 'string' ? value : ''}
          onBlur={(event) => onChange(event.target.value)}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          className="af-input af-mono"
          defaultValue={typeof value === 'number' ? value : ''}
          onBlur={(event) =>
            onChange(event.target.value === '' ? null : Number(event.target.value))
          }
        />
      );

    case 'date': {
      const iso = typeof value === 'number' ? new Date(value).toISOString().slice(0, 10) : '';
      return (
        <input
          type="date"
          className="af-input"
          defaultValue={iso}
          onChange={(event) =>
            onChange(event.target.value ? new Date(event.target.value).getTime() : null)
          }
        />
      );
    }

    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      );

    case 'select':
    case 'status':
      return (
        <div className="tsk__option-picker">
          {property.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`tsk__option${value === option.id ? ' is-active' : ''}`}
              onClick={() => onChange(value === option.id ? null : option.id)}
            >
              <AFTag label={option.label} toneIndex={option.toneIndex} />
            </button>
          ))}
        </div>
      );

    case 'multiSelect': {
      const selected = new Set(Array.isArray(value) ? (value as unknown[]).map(String) : []);
      return (
        <div className="tsk__option-picker">
          {property.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`tsk__option${selected.has(option.id) ? ' is-active' : ''}`}
              onClick={() => {
                const next = new Set(selected);
                if (next.has(option.id)) next.delete(option.id);
                else next.add(option.id);
                onChange([...next]);
              }}
            >
              <AFTag label={option.label} toneIndex={option.toneIndex} />
            </button>
          ))}
        </div>
      );
    }
  }
}
