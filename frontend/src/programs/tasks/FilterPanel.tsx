import { AFButton, AFPanel, AFTag } from '../../components/AF';
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
    <div className="cal__overlay" role="dialog" aria-label="Filter">
      <AFPanel label="Filter" className="cal__editor tsk__filter-panel">
        {filterable.length === 0 && <p className="af-meta">No filterable properties yet.</p>}

        {filterable.map((property) => {
          const current = filterFor(property.id);

          if (property.type === 'select' || property.type === 'multiSelect' || property.type === 'status') {
            const included = current?.kind === 'options' ? current.included : new Set<string>();
            return (
              <div key={property.id} className="tsk__filter-row">
                <span className="af-panel-label">{property.name}</span>
                <div className="tsk__filter-options">
                  {property.options.map((option) => {
                    const checked = included.has(option.id);
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
                        <AFTag label={option.label} toneIndex={option.toneIndex} />
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
                <span className="af-panel-label">{property.name}</span>
                <div className="tsk__filter-options">
                  <AFButton
                    label="Any"
                    variant={want === null ? 'solid' : 'quiet'}
                    onClick={() => setFilter(null, property.id)}
                  />
                  <AFButton
                    label="Checked"
                    variant={want === true ? 'solid' : 'quiet'}
                    onClick={() =>
                      setFilter({ kind: 'checkbox', propertyId: property.id, want: true }, property.id)
                    }
                  />
                  <AFButton
                    label="Not checked"
                    variant={want === false ? 'solid' : 'quiet'}
                    onClick={() =>
                      setFilter(
                        { kind: 'checkbox', propertyId: property.id, want: false },
                        property.id,
                      )
                    }
                  />
                </div>
              </div>
            );
          }

          // text / url
          const text = current?.kind === 'contains' ? current.text : '';
          return (
            <div key={property.id} className="tsk__filter-row">
              <span className="af-panel-label">{property.name} contains</span>
              <input
                className="af-input af-input--prose"
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

        <div className="cal__editor-actions">
          <AFButton label="Clear all" variant="ghost" onClick={() => onChange([])} />
          <AFButton label="Done" onClick={onClose} />
        </div>
      </AFPanel>
    </div>
  );
}
