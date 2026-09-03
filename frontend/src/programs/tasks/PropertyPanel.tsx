import { useState } from 'react';
import { AFButton, AFIconButton, AFPanel, AFTag } from '../../components/AF';
import { useDragReorder } from '../../components/dragReorder';
import type { TaskPropertyRow, TaskPropertyType } from '../../data/db';
import { categoryTones } from '../../data/tones';
import {
  addOption,
  deleteOption,
  deleteProperty,
  moveOption,
  recolorOption,
  renameOption,
  reorderOption,
  reorderProperty,
  saveProperty,
} from './store';

const typeOptions: readonly { type: TaskPropertyType; label: string; glyph: string }[] = [
  { type: 'text', label: 'Text', glyph: '≡' },
  { type: 'number', label: 'Number', glyph: '#' },
  { type: 'select', label: 'Select', glyph: '⊙' },
  { type: 'multiSelect', label: 'Multi-select', glyph: '☰' },
  { type: 'status', label: 'Status', glyph: '◐' },
  { type: 'date', label: 'Date', glyph: '▦' },
  { type: 'checkbox', label: 'Checkbox', glyph: '☑' },
  { type: 'url', label: 'URL', glyph: '⇗' },
];

const hasOptions = (type: TaskPropertyType): boolean =>
  type === 'select' || type === 'multiSelect' || type === 'status';

export function PropertyPanel({
  properties,
  onClose,
  onChange,
}: {
  properties: TaskPropertyRow[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<TaskPropertyType>('text');
  const [editingOptionsFor, setEditingOptionsFor] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const addProperty = () => {
    if (!name.trim()) return;
    void saveProperty({ name, type }).then(() => {
      setName('');
      onChange();
    });
  };

  return (
    <div className="cal__overlay" role="dialog" aria-label="Manage properties">
      <AFPanel label="Properties" className="cal__editor tsk__property-panel">
        <ul className="tsk__property-list">
          {properties.map((property, index) => (
            <li key={property.id}>
              <div className="tsk__property-row">
                <span className="af-body">{property.name}</span>
                <span className="af-meta">
                  {typeOptions.find((option) => option.type === property.type)?.label}
                </span>
                <div className="tsk__property-actions">
                  <AFIconButton
                    glyph="↑"
                    tooltip="Move up"
                    bordered={false}
                    disabled={index === 0}
                    onClick={() => void reorderProperty(property.id, -1).then(onChange)}
                  />
                  <AFIconButton
                    glyph="↓"
                    tooltip="Move down"
                    bordered={false}
                    disabled={index === properties.length - 1}
                    onClick={() => void reorderProperty(property.id, 1).then(onChange)}
                  />
                  {hasOptions(property.type) && (
                    <AFButton
                      label="Options"
                      variant="quiet"
                      onClick={() =>
                        setEditingOptionsFor(editingOptionsFor === property.id ? null : property.id)
                      }
                    />
                  )}
                  {confirmingDelete === property.id ? (
                    <AFButton
                      label="Really delete"
                      variant="danger"
                      onClick={() => void deleteProperty(property.id).then(onChange)}
                    />
                  ) : (
                    <AFIconButton
                      glyph="✕"
                      tooltip="Delete property"
                      bordered={false}
                      onClick={() => setConfirmingDelete(property.id)}
                    />
                  )}
                </div>
              </div>

              {editingOptionsFor === property.id && (
                <OptionEditor property={property} onChange={onChange} />
              )}
            </li>
          ))}
        </ul>

        <div className="tsk__add-property">
          <input
            className="af-input af-input--prose"
            placeholder="Property name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="tsk__type-grid">
            {typeOptions.map((option) => (
              <button
                key={option.type}
                type="button"
                className={`tsk__type-option${type === option.type ? ' is-active' : ''}`}
                onClick={() => setType(option.type)}
              >
                <span className="af-mono">{option.glyph}</span> {option.label}
              </button>
            ))}
          </div>
          <AFButton label="Add property" onClick={addProperty} disabled={!name.trim()} />
        </div>

        <div className="cal__editor-actions">
          <AFButton label="Close" variant="quiet" onClick={onClose} />
        </div>
      </AFPanel>
    </div>
  );
}

function OptionEditor({
  property,
  onChange,
}: {
  property: TaskPropertyRow;
  onChange: () => void;
}) {
  // `null` shows the "Add <Name>" pill; a string is the in-progress label for
  // the inline input that replaces it once clicked.
  const [adding, setAdding] = useState<string | null>(null);

  const dragHandlers = useDragReorder((from, to) => {
    const optionId = property.options[from]?.id;
    if (optionId) void moveOption(property.id, optionId, to).then(onChange);
  });

  const commitAdd = () => {
    if (adding?.trim()) void addOption(property.id, adding).then(onChange);
    setAdding(null);
  };

  return (
    <div className="tsk__option-editor">
      {property.options.map((option, index) => {
        const { draggable, onDragStart, onDragEnd, onDragOver, onDrop, className } = dragHandlers(index);
        return (
          <div
            key={option.id}
            className={`tsk__option-row ${className}`}
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <span className="af-drag-handle" draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
              ⠿
            </span>
            <AFTag label={option.label} toneIndex={option.toneIndex} />
            <input
              className="af-input af-input--prose"
              defaultValue={option.label}
              onBlur={(event) => {
                if (event.target.value.trim() && event.target.value !== option.label) {
                  void renameOption(property.id, option.id, event.target.value).then(onChange);
                }
              }}
            />
            <div className="tsk__tone-grid">
              {categoryTones.map((tone, toneIndex) => (
                <button
                  key={tone.name}
                  type="button"
                  className={`tsk__tone${option.toneIndex === toneIndex ? ' is-active' : ''}`}
                  style={{ background: tone.light }}
                  title={tone.name}
                  onClick={() => void recolorOption(property.id, option.id, toneIndex).then(onChange)}
                />
              ))}
            </div>
            <AFIconButton
              glyph="↑"
              tooltip="Move up"
              bordered={false}
              disabled={index === 0}
              onClick={() => void reorderOption(property.id, option.id, -1).then(onChange)}
            />
            <AFIconButton
              glyph="↓"
              tooltip="Move down"
              bordered={false}
              disabled={index === property.options.length - 1}
              onClick={() => void reorderOption(property.id, option.id, 1).then(onChange)}
            />
            <AFIconButton
              glyph="✕"
              tooltip="Delete option"
              bordered={false}
              onClick={() => void deleteOption(property.id, option.id).then(onChange)}
            />
          </div>
        );
      })}

      {adding === null ? (
        <button type="button" className="tsk__add-option-pill" onClick={() => setAdding('')}>
          + Add {property.name}
        </button>
      ) : (
        <input
          className="af-input af-input--prose"
          autoFocus
          placeholder={`New ${property.name.toLowerCase()}`}
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          onBlur={commitAdd}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitAdd();
            else if (event.key === 'Escape') setAdding(null);
          }}
        />
      )}
    </div>
  );
}
