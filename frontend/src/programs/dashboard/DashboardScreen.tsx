import { Link } from 'react-router-dom';
import { useState } from 'react';
import { AFButton } from '../../components/AF';
import { useSession } from '../../app/session';
import { visiblePrograms } from '../../app/programs';
import { widgetCatalog } from './widgets/registry';
import { WidgetPicker } from './widgets/WidgetPicker';
import './dashboard.css';

/**
 * reAFresh — the launcher, plus every widget an account has chosen to keep
 * visible, in the order it chose.
 *
 * The widget list itself lives in `settings.dashboardWidgets`
 * (`app/session.tsx`), synced like everything else. A first-time account
 * (an empty array) sees the full catalog in its default order — seeded here
 * rather than in `session.tsx`, the same "seed on first read" pattern
 * `seedDefaultProperties` uses for Task Tracker.
 */
export function DashboardScreen() {
  const { admin, settings, updateSettings } = useSession();
  const [customizing, setCustomizing] = useState(false);

  // A widget the catalog has grown since this account's settings were last
  // saved (or that were never saved at all) is appended visible, at the end
  // — never silently dropped.
  const known = new Set(settings.dashboardWidgets.map((widget) => widget.id));
  const configured = [
    ...settings.dashboardWidgets,
    ...widgetCatalog.filter((widget) => !known.has(widget.id)).map((widget) => ({ id: widget.id, hidden: false })),
  ];

  return (
    <div className="page dash">
      <div className="dash__bar">
        <span className="page__spacer" />
        <AFButton label="Customize" variant="ghost" onClick={() => setCustomizing(true)} />
      </div>

      {/* Mark plus name, no descriptions — the gallery is for getting somewhere,
          not for reading about where you might go. */}
      <div className="dash__gallery">
        {visiblePrograms(admin)
          .filter((program) => program.slug !== 'dashboard')
          .map((program) => (
            <Link key={program.slug} to={`/${program.slug}`} className="dash__tile">
              <span className="dash__mark" aria-hidden>
                {program.mark}
              </span>
              <span className="dash__name">{program.name}</span>
            </Link>
          ))}
      </div>

      <div className="dash__row">
        {configured
          .filter((widget) => !widget.hidden)
          .map((widget) => {
            const catalog = widgetCatalog.find((entry) => entry.id === widget.id);
            if (!catalog) return null;
            const Widget = catalog.Component;
            return <Widget key={widget.id} />;
          })}
      </div>

      {customizing && (
        <WidgetPicker
          widgets={configured}
          onChange={(next) => void updateSettings({ dashboardWidgets: next })}
          onClose={() => setCustomizing(false)}
        />
      )}
    </div>
  );
}
