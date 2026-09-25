import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import type { DashboardWidget } from './registry';

/**
 * "Add widgets" — where a removed widget comes back from. Everything else
 * (move, resize, remove) happens on the widget itself, so this only ever
 * lists what is currently off the grid.
 */
export function WidgetPicker({
  hidden,
  catalog,
  onShow,
  onClose,
}: {
  hidden: readonly string[];
  catalog: readonly DashboardWidget[];
  onShow: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add widgets</DialogTitle>
        </DialogHeader>

        {hidden.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every widget is already on your dashboard.</p>
        ) : (
          <ul className="dash__widget-list">
            {hidden.map((id) => {
              const entry = catalog.find((candidate) => candidate.id === id);
              if (!entry) return null;
              return (
                <li key={id}>
                  <Button variant="raised" className="w-full justify-between" onClick={() => onShow(id)}>
                    {entry.label}
                    <Plus size={16} aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
