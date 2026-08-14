# AF — Assignment / Final Exam Fixed Checklist

AF is a Flutter-based proctoring companion app built to streamline the repetitive, high-stakes checklist process required before, during, and after Assignment or Final Exam sessions in a university computer lab setting.

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

## MP3 Converter

The MP3 program is the one part of AF that is not local. Conversion runs on a
Go worker with ffmpeg, orchestrated by [Temporal](https://temporal.io), with
[SeaweedFS](https://github.com/seaweedfs/seaweedfs) holding the bytes. All of
it lives in `backend/` and `docker-compose.yml`; none of it is involved in the
Vercel build, which only ever produces `build/web`.

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