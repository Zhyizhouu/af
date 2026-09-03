import { Link } from 'react-router-dom';
import type { Program } from '../../../app/programs';

/**
 * A launcher tile for one application, as a dashboard widget in its own
 * right — sized and shown/hidden exactly like any other widget, and
 * independent of Profile's "Displayed Applications" (header) setting.
 *
 * At its smallest dragged size the name is dropped by a container query in
 * `dashboard.css` (`.dash__widget-body`'s `container-type: inline-size`),
 * leaving just the mark — a launcher shrunk down to an icon.
 */
export function AppWidget({ program }: { program: Program }) {
  return (
    <Link to={`/${program.slug}`} className="dash__tile">
      <span className="dash__mark" aria-hidden>
        {program.mark}
      </span>
      <span className="dash__name">{program.name}</span>
    </Link>
  );
}
