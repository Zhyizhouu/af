import { Link } from 'react-router-dom';
import type { Program } from '../../../app/programs';

/**
 * A launcher tile for one application, as a dashboard widget in its own
 * right — sized and shown/hidden exactly like any other widget, and
 * independent of Profile's "Displayed Applications" (header) setting.
 *
 * One line — mark then name — so it costs a button's worth of space rather
 * than a card's. At its smallest dragged size the name is dropped by a
 * container query in `dashboard.css` (`.dash__widget-body`'s
 * `container-type: inline-size`), leaving just the mark.
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
