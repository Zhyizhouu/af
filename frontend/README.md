# reAFresh — React frontend

The React app. **Vercel builds and serves this** — `vercel.json` points at
`frontend/dist`.

```
npm install
npm run dev                      # http://localhost:5173
npm run check                    # types
npm test                         # vitest
npm run build                    # dist/
```

The assistant needs an API. There is **no localhost default**. The earlier
build had one, and on a deployed site it resolved to each visitor's own machine
and failed as mixed content, silently. Set it explicitly:

```
AF_CONVERT_API=http://localhost:8080 npm run dev
```

Unset, the AI page says it is not configured rather than pretending to reach
something.

## Where things are

| Path | What |
| --- | --- |
| `src/theme/tokens.css` | The design tokens, value-for-value from `af_tokens.dart` |
| `src/components/AF.tsx` | The `AF*` widget kit |
| `src/app/Shell.tsx` | Nav bar, routing, split-view host |
| `src/app/SplitView.tsx` | Two programs side by side |
| `src/app/registry.tsx` | Which component draws which program |
| `src/data/db.ts` | Dexie/IndexedDB, per-account, in place of Hive |
| `src/programs/<name>/` | One directory per program: store, screen, styles |

## Ported

All nine programs, the shell and the data layer.

| Program | Notes |
| --- | --- |
| Dashboard | Rows and columns of widgets the account arranges itself: drag to move, drag dividers to resize, pin heights, auto-adjust |
| To-Do | Plain per-day checklists, a checked item stays on its day as that day's archive |
| Checklists | Sessions seeded from the 120-item template, sections, archive sweep, cascade delete |
| Calendar | Year / Month / Week / 3-Day / Day, column-packed overlaps, now-line, event editor |
| Habits | One record per Jakarta day, completion chart at five ranges, midnight rollover |
| Task Tracker | Table of pages with typed, editable properties, filters, and a detail view per page |
| Audio Converter | Server-served format menu, upload progress, phase bar, cancel, download |
| AI | Chat, calendar sight, deletions, synced history, QR artifacts, attachments |
| QR Generator | SVG, correction levels, colours with a contrast verdict, logo knockout |

Plus **split view** (`/calendar?split=ai`), **Firebase Auth**, and **two-way
Firestore sync** across every collection.

### The Firestore document contract

The app reads and writes documents under `users/{uid}`, and `sync.test.ts` pins
that document contract rather than the plumbing, so a field rename shows up as
a failing test instead of as data that quietly stops syncing.

Two consequences worth knowing:

- `ProctorSessionRow.reopened` exempts a manually reopened session from the
  archive sweep, and it is part of the session document. Dropping it on the
  next push would silently un-exempt the session.
- Order matters in the sync pass: sessions before their checklist items, and
  categories before events. An event's colour resolves through its category, so
  pulling events first shows them all as "Other" until the next pass.

### Proposals versus artifacts

Two different things come back from the assistant and they are treated
differently on purpose.

A **proposal** touches stored data — a session, an event, a deletion — and
waits behind the confirm button. An **artifact** does not: a QR code writes
nothing, deletes nothing, and closing the tab disposes of it, so it renders
straight into the transcript. Putting it behind the gate would mean asking
somebody to approve a picture, and a gate used for harmless things stops being
read for dangerous ones.

Attachment bytes never leave the browser. The model is told only that a file
called `logo.png` exists, because that is all it needs to decide whether the
request wants one used; the compositing happens here. Attachments are capped at
96 KB because they live inside the conversation document, and Firestore caps
that at 1 MiB.

## Before the next deploy

`AF_CONVERT_API` must be set as a Vercel **environment variable**, or the AI and
the Audio Converter will say they are not configured. That is deliberate: a
`http://localhost:8080` default, on a deployed site, resolves to each visitor's
own machine and fails silently as mixed content.
