import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { hexToRgba, toneColor } from '../../data/tones';
import type { TaskPropertyRow } from '../../data/db';
import type { PropertyFilter } from './store';

/** Which property types get a filter control at all. Number and date are
 *  deliberately left out for v1 — a range operator is meaningfully more UI
 *  and logic than the single-clause model here, not an oversight. */
const filterableTypes = new Set(['select', 'multiSelect', 'status', 'text', 'url', 'checkbox']);

export function FilterPanel({
  properties,
  filters,
  onChange,
  onClose,
}: {
  properties: TaskPropertyRow[];
  filters: PropertyFilter[];
  onChange: (filters: PropertyFilter[]) => void;
  onClose: () => void;
}) {
  const filterable = properties.filter((property) => filterableTypes.has(property.type));

  const filterFor = (propertyId: string) => filters.find((f) => f.propertyId === propertyId);

  const setFilter = (filter: PropertyFilter | null, propertyId: string) => {
    const rest = filters.filter((f) => f.propertyId !== propertyId);
    onChange(filter ? [...rest, filter] : rest);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="surface-3d rounded-2xl border-0 bg-transparent p-5 sm:max-w-lg" aria-label="Filter">
        <DialogHeader>
          <DialogTitle>Filter</DialogTitle>
        </DialogHeader>

        {filterable.length === 0 && (
          <p className="text-[13px] text-muted-foreground">No filterable properties yet.</p>
        )}

        <div className="tsk__filter-list">
          {filterable.map((property) => {
            const current = filterFor(property.id);

            if (property.type === 'select' || property.type === 'multiSelect' || property.type === 'status') {
              const included = current?.kind === 'options' ? current.included : new Set<string>();
              return (
                <div key={property.id} className="tsk__filter-row">
                  <span className="tsk__section-label">{property.name}</span>
                  <div className="tsk__filter-options">
                    {property.options.map((option) => {
                      const checked = included.has(option.id);
                      const color = toneColor(option.toneIndex);
                      return (
                        <label key={option.id} className="tsk__filter-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = new Set(included);
                              if (checked) next.delete(option.id);
                              else next.add(option.id);
                              setFilter(
                                next.size > 0
                                  ? { kind: 'options', propertyId: property.id, included: next }
                                  : null,
                                property.id,
                              );
                            }}
                          />
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
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (property.type === 'checkbox') {
              const want = current?.kind === 'checkbox' ? current.want : null;
              return (
                <div key={property.id} className="tsk__filter-row">
                  <span className="tsk__section-label">{property.name}</span>
                  <div className="tsk__filter-options">
                    <Button
                      size="sm"
                      variant={want === null ? 'raised' : 'ghost'}
                      onClick={() => setFilter(null, property.id)}
                    >
                      Any
                    </Button>
                    <Button
                      size="sm"
                      variant={want === true ? 'raised' : 'ghost'}
                      onClick={() =>
                        setFilter({ kind: 'checkbox', propertyId: property.id, want: true }, property.id)
                      }
                    >
                      Checked
                    </Button>
                    <Button
                      size="sm"
                      variant={want === false ? 'raised' : 'ghost'}
                      onClick={() =>
                        setFilter(
                          { kind: 'checkbox', propertyId: property.id, want: false },
                          property.id,
                        )
                      }
                    >
                      Not checked
                    </Button>
                  </div>
                </div>
              );
            }

            // text / url
            const text = current?.kind === 'contains' ? current.text : '';
            return (
              <div key={property.id} className="tsk__filter-row">
                <span className="tsk__section-label">{property.name} contains</span>
                <Input
                  className="inset-field rounded-[10px]"
                  defaultValue={text}
                  onBlur={(event) =>
                    setFilter(
                      event.target.value
                        ? { kind: 'contains', propertyId: property.id, text: event.target.value }
                        : null,
                      property.id,
                    )
                  }
                />
              </div>
            );
          })}
        </div>

        <div className="tsk__panel-actions">
          <Button variant="ghost" onClick={() => onChange([])}>
            Clear all
          </Button>
          <Button variant="raised" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
