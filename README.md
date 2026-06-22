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

## Why This Exists

As a Junior Laboratory Assistant proctoring Assignments and Final Exams across multiple courses and rooms, keeping track of dozens of repetitive but critical steps (recording, backups, attendance, submission verification) is easy to get wrong under time pressure. AF turns that mental checklist into a structured, repeatable digital workflow, reducing the risk of missed steps like forgetting to start a recording or backup files after submission.

## Status

Actively developed and used in real proctoring sessions. Future plans include CSV bulk import for semester-wide scheduling and a template editor for adjusting checklist items over time.