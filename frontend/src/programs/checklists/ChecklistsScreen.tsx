import { useCallback, useEffect, useState } from 'react';
import { AFButton, AFChip, AFEmptyState, AFHint, AFPanel } from '../../components/AF';
import { useSession } from '../../app/session';
import type { ChecklistItemRow, ProctorSessionRow } from '../../data/db';
import {
  bySection,
  createSession,
  deleteSession,
  listItems,
  listSessions,
  sessionLabel,
  setSessionStatus,
  toggleItem,
} from './store';
import './checklists.css';

const stamp = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * reAFresh · Checklists — UAP/UAS proctor sessions against a template.
 *
 * A session is created with its checklist already seeded, so there is never a
 * session sitting there with nothing to tick.
 */
export function ChecklistsScreen() {
  const { revision, requestSync } = useSession();

  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [sessions, setSessions] = useState<ProctorSessionRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    setSessions(await listSessions(status));
  }, [status]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const after = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      await reload();
      requestSync();
    },
    [reload, requestSync],
  );

  const open = sessions.find((session) => session.id === openId);

  if (open) {
    return (
      <SessionDetail
        session={open}
        onBack={() => setOpenId(null)}
        onChanged={() => void after(async () => {})}
      />
    );
  }

  return (
    <div className="chk">
      <header className="chk__head">
        <span className="af-brand">reAFresh · Checklists</span>
        <div className="chk__tabs">
          {(['active', 'archived'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`cal__view${status === option ? ' is-active' : ''}`}
              onClick={() => setStatus(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <AFButton label="New session" onClick={() => setAdding(true)} />
      </header>

      {sessions.length === 0 ? (
        <AFEmptyState
          glyph="☑"
          message={
            status === 'active'
              ? 'No sessions yet.\nAdd one, or ask the assistant.'
              : 'Nothing archived yet.'
          }
        />
      ) : (
        <ul className="chk__list">
          {sessions.map((session) => (
            <li key={session.id}>
              <AFPanel
                label={session.type}
                countSlot={<span className="af-panel-count">Room {session.room || '—'}</span>}
                className="chk__card"
              >
                <button type="button" className="chk__open" onClick={() => setOpenId(session.id)}>
                  <span className="chk__title">{sessionLabel(session) || 'Untitled course'}</span>
                  <span className="af-meta">{stamp.format(new Date(session.dateTime))}</span>
                </button>
                <div className="chk__row-actions">
                  <AFButton
                    label={status === 'active' ? 'Archive' : 'Reopen'}
                    variant="quiet"
                    onClick={() =>
                      void after(() =>
                        setSessionStatus(session.id, status === 'active' ? 'archived' : 'active'),
                      )
                    }
                  />
                  <DeleteSession onDelete={() => void after(() => deleteSession(session.id))} />
                </div>
              </AFPanel>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <NewSession
          onCancel={() => setAdding(false)}
          onCreate={(input) =>
            void after(async () => {
              await createSession(input);
              setAdding(false);
            })
          }
        />
      )}
    </div>
  );
}

/** Deleting a session asks first — it takes its whole checklist with it. */
function DeleteSession({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <AFButton label="Really delete" variant="danger" onClick={onDelete} />
  ) : (
    <AFButton label="Delete" variant="ghost" onClick={() => setConfirming(true)} />
  );
}

function SessionDetail({
  session,
  onBack,
  onChanged,
}: {
  session: ProctorSessionRow;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { requestSync } = useSession();
  const [items, setItems] = useState<ChecklistItemRow[]>([]);

  const reload = useCallback(async () => {
    setItems(await listItems(session.id));
  }, [session.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const done = items.filter((item) => item.isChecked).length;

  return (
    <div className="chk">
      <header className="chk__head">
        <AFButton label="‹ Back" variant="quiet" onClick={onBack} />
        <span className="af-brand">
          {session.type} · Room {session.room || '—'}
        </span>
        <AFChip label={`${done}/${items.length}`} />
      </header>

      <AFPanel label="Course">
        <span className="af-body">{sessionLabel(session) || 'Untitled course'}</span>
        <AFHint>{stamp.format(new Date(session.dateTime))}</AFHint>
      </AFPanel>

      <div className="chk__progress" aria-hidden>
        <span
          className="chk__progress-fill"
          style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
        />
      </div>

      {bySection(items).map(([section, group]) => (
        <AFPanel
          key={section}
          label={section}
          count={`${group.filter((item) => item.isChecked).length}/${group.length}`}
        >
          <ul className="chk__items">
            {group.map((item) => (
              <li key={item.id}>
                <label className="chk__item">
                  <input
                    type="checkbox"
                    checked={item.isChecked}
                    onChange={() =>
                      void (async () => {
                        await toggleItem(item.id);
                        await reload();
                        requestSync();
                        onChanged();
                      })()
                    }
                  />
                  <span className={`af-body${item.isChecked ? ' chk__done' : ''}`}>
                    {item.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </AFPanel>
      ))}
    </div>
  );
}

function NewSession({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (input: {
    type: string;
    dateTime: Date;
    room: string;
    courseCode: string;
    courseName: string;
    courseClass: string;
  }) => void;
}) {
  const [type, setType] = useState('UAP');
  const [when, setWhen] = useState(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
  });
  const [room, setRoom] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [klass, setKlass] = useState('');

  return (
    <div className="cal__overlay" role="dialog" aria-label="New session">
      <AFPanel label="New session" className="cal__editor">
        <span className="af-panel-label">Type</span>
        <div className="chk__types">
          {['UAP', 'UAS'].map((option) => (
            <button
              key={option}
              type="button"
              className={`cal__view${type === option ? ' is-active' : ''}`}
              onClick={() => setType(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <label className="af-panel-label" htmlFor="s-when">When</label>
        <input id="s-when" className="af-input" type="datetime-local" value={when}
          onChange={(e) => setWhen(e.target.value)} />

        <label className="af-panel-label" htmlFor="s-room">Room</label>
        <input id="s-room" className="af-input" value={room} onChange={(e) => setRoom(e.target.value)} />

        <label className="af-panel-label" htmlFor="s-code">Course code</label>
        <input id="s-code" className="af-input" value={code} onChange={(e) => setCode(e.target.value)} />

        <label className="af-panel-label" htmlFor="s-name">Course name</label>
        <input id="s-name" className="af-input af-input--prose" value={name}
          onChange={(e) => setName(e.target.value)} />

        <label className="af-panel-label" htmlFor="s-class">Class</label>
        <input id="s-class" className="af-input" value={klass} onChange={(e) => setKlass(e.target.value)} />

        <div className="cal__editor-actions">
          <AFButton label="Cancel" variant="quiet" onClick={onCancel} />
          <AFButton
            label="Create"
            disabled={!code.trim() && !name.trim()}
            onClick={() =>
              onCreate({
                type,
                dateTime: new Date(when),
                room: room.trim(),
                courseCode: code.trim().toUpperCase(),
                courseName: name.trim(),
                courseClass: klass.trim().toUpperCase(),
              })
            }
          />
        </div>
      </AFPanel>
    </div>
  );
}
