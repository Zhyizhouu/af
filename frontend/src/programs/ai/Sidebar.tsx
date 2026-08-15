import { AFButton, AFEmptyState, AFIconButton } from '../../components/AF';
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
    <aside className="ai__sidebar" aria-label="Conversations">
      <div className="ai__sidebar-head">
        <span className="af-panel-label">History</span>
        <AFIconButton
          glyph="⟨"
          tooltip="Hide conversations"
          bordered={false}
          onClick={onClose}
        />
      </div>

      <AFButton label="New chat" variant="ghost" expand onClick={onNew} />

      <div className="ai__sidebar-list">
        {conversations.length === 0 ? (
          <div className="ai__sidebar-empty">
            <AFEmptyState
              glyph="✦"
              message={'Nothing saved yet.\nConversations appear here as you have them.'}
            />
          </div>
        ) : (
          conversations.map((row) => {
            const current = row.id === currentId;
            return (
              <div
                key={row.id}
                className={`ai__sidebar-row${current ? ' is-current' : ''}`}
              >
                <button
                  type="button"
                  className="ai__sidebar-open"
                  onClick={() => onOpen(row)}
                >
                  <span className="af-body ai__sidebar-title">{row.title}</span>
                  <span className="af-meta">
                    {stamp.format(new Date(row.updatedAt))} · {row.turns.length} turns
                    {current ? ' · open' : ''}
                  </span>
                </button>
                <AFIconButton
                  glyph="✕"
                  tooltip="Delete conversation"
                  bordered={false}
                  onClick={() => onDelete(row.id)}
                />
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
