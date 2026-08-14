# reAFresh

reAFresh is a Flutter-based proctoring companion app built to streamline the repetitive, high-stakes checklist process required before, during, and after Assignment or Final Exam sessions in a university computer lab setting.

Instead of juggling printed checklists or memory, proctors can log each exam session with its date, time, room, and course details, then work through a structured, section-by-section checklist that automatically archives the session once everything is complete.

## Features

- **Quick session entry** — Add a new proctoring session via a simple popup form (Type, Date & Time, Room, Course Code, Course Name, Course Class)
- **Fixed checklist template** — Every new session is automatically populated with the same structured checklist, organized into clear sections:
  - Before Assignment / Final Exam Starts
  - Technical
  - RUMAN
  - Students
  - While Ongoing
  - Submission
  - After Submission
- **Live progress tracking** — A floating progress bar shows real-time completion (e.g. "12/35 checked") as items are ticked off
- **Smart filtering** — Switch between Today, Upcoming, and Archived sessions with a single tap
- **Auto-archiving** — Once every checklist item is checked, the session automatically moves to the Archive, no manual step needed
- **Liquid Glass aesthetic** — A dark-mode, frosted-glass inspired UI for a modern, focused proctoring experience

## Tech Stack

- **Framework**: Flutter (Dart)
- **State Management**: Riverpod
- **Local Storage**: Hive (NoSQL, offline-first)
- **UI**: Material 3, custom glassmorphism components

## Audio Converter

The audio program is the one part of reAFresh that is not local. Conversion runs on a
Go worker with ffmpeg, orchestrated by [Temporal](https://temporal.io), with
[SeaweedFS](https://github.com/seaweedfs/seaweedfs) holding the bytes. All of
it lives in `backend/` and `docker-compose.yml`; none of it is involved in the
Vercel build, which only ever produces `build/web`.

Anything ffmpeg can decode goes in — including video, whose audio track is
simply the only stream kept. Out comes **MP3, WAV, FLAC, M4A, OGG or Opus**.
The format list is served from `GET /v1/limits` rather than written into the
app, because which codecs exist is a property of the worker's ffmpeg build.
Lossy formats take a bitrate; for the rest the control is hidden rather than
shown doing nothing.

### What happens to the file you uploaded

It is deleted as soon as the conversion finishes — not when the result
expires. The workflow drops it on every path out: converted, refused, failed
or cancelled. Two details make that a guarantee rather than a hope. Cleanup
runs on a *disconnected* Temporal context, because a cancelled context refuses
to schedule anything and cancellation is exactly when a half-finished source
gets left behind. And the delete retries without an attempt limit, so a
storage outage postpones it instead of losing it. The converted file follows
the same path when its lifetime is up. `backend/internal/convert/workflow_test.go`
runs all four exits against Temporal's test environment.

```
browser ──upload──▶ api ──▶ SeaweedFS (source)
                     │
                     └──start──▶ Temporal ──task──▶ worker ×2
                                                      │ ffmpeg
                                                      ▼
browser ◀─download─── api ◀──────────────────── SeaweedFS (mp3)
```

### Running it

```bash
cp .env.example .env          # optional; every value has a working default
docker compose up --build
```

| Service | URL | What it is |
| --- | --- | --- |
| API | http://localhost:8080 | what the Flutter app talks to |
| Temporal UI | http://localhost:8088 | every workflow, its history and its retries |
| SeaweedFS | http://localhost:9333 | master status and volume browser |

Point the app at it with a `--dart-define`, since the app and the API never
share an origin:

```bash
flutter run -d chrome --dart-define=AF_CONVERT_API=http://localhost:8080
```

The API verifies the caller's Firebase ID token, so signing in has to work
before a conversion will. To try the stack before the Firebase console work is
finished, set `AF_AUTH_DISABLED=true` in `.env` — localhost only; it accepts
every request as one shared user.

## AI

Describe what you need scheduled; it proposes the entries and you confirm them.

```
"UAS Basis Data COMP6100 class BBA2 on 20 August at 1pm in room 305,
 lunch with Dina Wednesday noon, and gym Thursday 6pm"

  → UAS session  20 Aug 13:00  room 305  COMP6100 · Basis Data  BBA2
  → Lunch with Dina   19 Aug 12:00–13:00   social
  → Gym               20 Aug 18:00–19:00   health
  → "Assumed one-hour durations for lunch and gym."
```

A session created this way goes through the same controller the add-session
dialog uses, so it arrives with its checklist seeded and its course remembered.

**It never writes anything.** The model proposes, every entry is shown for
checking, and one button commits. A calendar you cannot trust is worse than no
calendar, so the confirm step is the feature rather than an obstacle in front
of it.

Three things stand between the model and your calendar:

- **A schema**, so the answer parses by construction rather than hopefully.
- **Normalisation**, because a schema constrains shape and never sense: an
  invented category falls back to `other`, an end before its start becomes an
  hour, a date years from now is dropped, and one sentence cannot propose forty
  entries. `backend/internal/plan/normalise_test.go` covers each case.
- **You**, reading the cards. Fields the model could not fill are shown as
  *not given* in the warn colour rather than left blank, because a missing room
  is exactly what is worth catching before pressing the button.

The whole feature is one synchronous endpoint — no Temporal, no queue, no job
id. It writes nothing and holds nothing, so reaching for the machinery next
door because it is there would only buy a worse version of a plain handler.

Setting it up needs one key:

```bash
# .env — the API's environment, never the Flutter bundle
AF_GEMINI_API_KEY=...   # https://aistudio.google.com/apikey
```

Without it the page says so on arrival instead of offering a button that
cannot work.

### Scaling

Workers poll one task queue and Temporal hands each task to exactly one of
them, so the replica count *is* the concurrency:

```bash
docker compose up --scale worker=4
```

Keep `AF_WORKER_MAX_CONCURRENT=1`. ffmpeg saturates whatever cores it is given,
so running several files inside one replica makes all of them slower.

## Why This Exists

As a Junior Laboratory Assistant proctoring Assignments and Final Exams across multiple courses and rooms, keeping track of dozens of repetitive but critical steps (recording, backups, attendance, submission verification) is easy to get wrong under time pressure. AF turns that mental checklist into a structured, repeatable digital workflow, reducing the risk of missed steps like forgetting to start a recording or backup files after submission.

## Status

Actively developed and used in real proctoring sessions. Future plans include CSV bulk import for semester-wide scheduling and a template editor for adjusting checklist items over time.