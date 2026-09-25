import { ChevronLeft, Plus, X } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import type { AiConversationRow } from '../../data/db';

/**
 * The conversation list.
 *
 * Everything in it is synced, so this is the same list on every device signed
 * into the account. A conversation opened from here is the transcript, not a
 * summary of it: the proposals it made are still on their cards, and the ones
 * already carried out still say so.
 */

const stamp = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function Sidebar({
  conversations,
  currentId,
  onOpen,
  onNew,
  onDelete,
  onClose,
}: {
  conversations: AiConversationRow[];
  currentId: string;
  onOpen: (row: AiConversationRow) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label="Conversations"
      className="flex w-[272px] shrink-0 flex-col gap-3 border-r border-white/[0.07] bg-[#050506] p-3 md:p-4"
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[12px] font-medium text-muted-foreground">History</span>
        <Button
          variant="raised"
          size="icon-sm"
          aria-label="Hide conversations"
          title="Hide conversations"
          onClick={onClose}
        >
          <ChevronLeft size={16} aria-hidden />
        </Button>
      </div>

      <Button variant="ghost" className="w-full justify-start gap-2" onClick={onNew}>
        <Plus size={16} aria-hidden />
        New chat
      </Button>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-2 pt-6 text-center text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">
            {'Nothing saved yet.\nConversations appear here as you have them.'}
          </div>
        ) : (
          conversations.map((row) => {
            const current = row.id === currentId;
            return (
              <div
                key={row.id}
                className={cn(
                  'flex items-start gap-1 rounded-[10px] pr-1',
                  current && 'glow-active',
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-[10px] px-3 py-2.5 text-left text-foreground hover:bg-white/[0.04]"
                  onClick={() => onOpen(row)}
                >
                  <span className="line-clamp-2 w-full text-[16px] font-semibold">{row.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {stamp.format(new Date(row.updatedAt))} · {row.turns.length} turns
                    {current ? ' · open' : ''}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete conversation"
                  title="Delete conversation"
                  className="mt-1 shrink-0 text-muted-foreground hover:text-rose-400"
                  onClick={() => onDelete(row.id)}
                >
                  <X size={14} aria-hidden />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
