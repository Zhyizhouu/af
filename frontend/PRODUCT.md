# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: members of the public who sign up to keep their day in one place. The product grew out of university exam proctoring (sessions, rooms, course codes, a fixed pre/during/after checklist), and that workflow remains a first-class use: a proctor working through a checklist on a lab computer or phone during a live exam session.

## Product Purpose

reAFresh is a shell for several small programs that share one account and sync to every device the user signs in on: Checklists (proctoring sessions with a structured checklist that auto-archives when complete), Calendar (with Outlook sync), Habits, Task Tracker (Notion-style pages with properties), an AI assistant that reads the next two months of the calendar and proposes changes that only apply after the user confirms, an Audio Converter (server-side ffmpeg), and a QR Generator. A Dashboard composes widgets from all of them. Success is a user who opens one place instead of five apps and trusts it to hold their schedule.

## Positioning

One calm place for everything the user tracks, with an assistant that can see the schedule but changes nothing until confirmed. Several programs share one account, one sync, one dashboard and a split view that shows two programs side by side.

## Operating Context

Used at a desk (lab computer, laptop) and on a phone. Sessions are often time-pressured (a live exam, a day being planned). Local-first: data lives in the browser (IndexedDB) and syncs to Firestore when signed in. Deployed on Vercel; the audio converter runs on a separate backend reached through a tunnel.

## Capabilities and Constraints

- Every program requires an account; the landing and sign-in pages are the only public surfaces.
- Settings include theme (light/dark/system), font choice, full-width pages, and which programs are shown in the navigation.
- Split view: any two programs side by side, stored in the URL (`?split=`).
- The AI never applies a change without explicit confirmation.
- Uploaded audio is deleted as soon as conversion finishes.

## Brand Commitments

- Name: reAFresh, with the "AF" monogram (liquid-glass mark, `public/favicon.png`).
- Landing headline: "Everything you track, in one calm place". "Calm" is part of the stated promise.

## Evidence on Hand

Real product copy in `src/app/Landing.tsx` and the programs themselves. No testimonials, customer logos, usage numbers or pricing exist; none may be invented.

## Product Principles

1. Nothing changes without the user's say: the assistant proposes, the user confirms.
2. One place, many small tools: every program is reachable from one shell and composable on the dashboard.
3. Calm under pressure: the interface must stay legible and steady during a live session.
4. The user's data is theirs: local first, synced by choice, uploads deleted on completion.

## Accessibility & Inclusion

WCAG 2.1 AA. `prefers-reduced-motion` is honoured throughout and must stay honoured.
