import { useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useDragReorder } from '../../components/dragReorder';
import type { TaskPropertyRow, TaskPropertyType } from '../../data/db';
import { categoryTones, hexToRgba, toneColor } from '../../data/tones';
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="surface-3d rounded-2xl border-0 bg-transparent p-5 sm:max-w-xl" aria-label="Manage properties">
        <DialogHeader>
          <DialogTitle>Properties</DialogTitle>
        </DialogHeader>

        <ul className="tsk__property-list">
          {properties.map((property, index) => (
            <li key={property.id}>
              <div className="tsk__property-row">
                <span className="af-body">{property.name}</span>
                <span className="text-xs text-muted-foreground">
                  {typeOptions.find((option) => option.type === property.type)?.label}
                </span>
                <div className="tsk__property-actions">
                  <button
                    type="button"
                    className="tsk__ghost-icon"
                    aria-label="Move up"
                    title="Move up"
                    disabled={index === 0}
                    onClick={() => void reorderProperty(property.id, -1).then(onChange)}
                  >
                    <ChevronUp size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="tsk__ghost-icon"
                    aria-label="Move down"
                    title="Move down"
                    disabled={index === properties.length - 1}
                    onClick={() => void reorderProperty(property.id, 1).then(onChange)}
                  >
                    <ChevronDown size={14} aria-hidden />
                  </button>
                  {hasOptions(property.type) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditingOptionsFor(editingOptionsFor === property.id ? null : property.id)
                      }
                    >
                      Options
                    </Button>
                  )}
                  {confirmingDelete === property.id ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void deleteProperty(property.id).then(onChange)}
                    >
                      Really delete
                    </Button>
                  ) : (
                    <button
                      type="button"
                      className="tsk__ghost-icon"
                      aria-label="Delete property"
                      title="Delete property"
                      onClick={() => setConfirmingDelete(property.id)}
                    >
                      <X size={14} aria-hidden />
                    </button>
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
          <Input
            className="inset-field rounded-[10px]"
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
          <Button variant="raised" onClick={addProperty} disabled={!name.trim()}>
            Add property
          </Button>
        </div>

        <div className="tsk__panel-actions">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
        const color = toneColor(option.toneIndex);
        return (
          <div
            key={option.id}
            className={`tsk__option-row ${className}`}
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <span className="tsk__grip" draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
              {Array.from({ length: 6 }, (_, dot) => (
                <span key={dot} className="tsk__grip-dot" />
              ))}
            </span>
            <span
              className="tsk__pill"
              style={{
                background: hexToRgba(color, 0.14),
                borderColor: hexToRgba(color, 0.35),
                color: `color-mix(in srgb, ${color} 70%, white)`,
              }}
            >
              {option.label}
            </span>
            <Input
              className="inset-field rounded-[10px] flex-1"
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
            <button
              type="button"
              className="tsk__ghost-icon"
              aria-label="Move up"
              title="Move up"
              disabled={index === 0}
              onClick={() => void reorderOption(property.id, option.id, -1).then(onChange)}
            >
              <ChevronUp size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="tsk__ghost-icon"
              aria-label="Move down"
              title="Move down"
              disabled={index === property.options.length - 1}
              onClick={() => void reorderOption(property.id, option.id, 1).then(onChange)}
            >
              <ChevronDown size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="tsk__ghost-icon"
              aria-label="Delete option"
              title="Delete option"
              onClick={() => void deleteOption(property.id, option.id).then(onChange)}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        );
      })}

      {adding === null ? (
        <button type="button" className="tsk__add-option-pill" onClick={() => setAdding('')}>
          + Add {property.name}
        </button>
      ) : (
        <Input
          className="inset-field rounded-[10px]"
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
