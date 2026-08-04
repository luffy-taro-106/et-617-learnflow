# 🎓 LearnFlow — Interactive Learning Platform with Clickstream Analytics

> **ET-617 Assignment** — a standalone web application where learners log in, work
> through **interactive text, video and quiz** content, and have **every interaction
> captured as clickstream data** that they (and course admins) can explore and export.

LearnFlow is a full-stack app: a **Node.js + Express + SQLite** backend and a
**dependency-free vanilla-JavaScript** single-page frontend. The clickstream is modelled
on the exact **Moodle logstore format** from the reference spreadsheet
(`Time · Event context · Component · Event name · Description · Origin · IP address`),
so the data you generate looks just like a real LMS export.

---

## ✨ Feature checklist (mapped to the assignment)

| Requirement | How LearnFlow delivers it |
|---|---|
| **Users log in as learners** | Email + password auth (register & login), bcrypt-hashed, token sessions. A separate **admin** role sees analytics for *all* learners. |
| **Interactive content: text** | Rich reading lessons with headings, lists, blockquotes and "key takeaways". |
| **Interactive content: video** | HTML5 `<video>` lessons with a live event log; play / pause / seek / progress all tracked. |
| **Interactive content: quizzes** | Multiple-choice quizzes, server-side grading, pass/fail, answer highlighting, multiple attempts. |
| **Combination** | Each course mixes all three lesson types in one flow. |
| **Track ALL user activity** | Page/route views, clicks, scroll depth, time-on-page, video actions, quiz start/answer/submit, auth, theme changes — see the [full event catalogue](#-clickstream-event-catalogue). |
| **Store clickstream data** | Persisted in a SQLite `events` table (indexed) with both Moodle-style and rich analytics columns. |
| **Standalone web app** | Runs locally with `npm start` — no external services required (videos are shipped locally). |
| **Any tech stack** | Node.js / Express / SQLite / vanilla JS. |
| **Use Git** | Full git history with meaningful, incremental commits. |
| **README** | This file. Plus [ARCHITECTURE.md](docs/ARCHITECTURE.md), a [demo script](docs/DEMO_SCRIPT.md) and a [slide deck](docs/presentation.html). |

---

## 🚀 Quick start (3 commands)

> Requires **Node.js 18+** (developed on Node 22). No database server needed —
> SQLite is embedded.

```bash
npm install       # install dependencies
npm run seed      # create the database + demo users + course content
npm start         # start the server
```

Then open **<http://localhost:3000>** and log in:

| Role | Email | Password | Sees |
|---|---|---|---|
| 👩‍🎓 Learner | `demo@learnflow.dev` | `demo123` | Only their **own** clickstream |
| 🛠️ Admin | `admin@learnflow.dev` | `admin123` | Clickstream for **all** learners |

You can also **create your own learner account** from the login screen.

> **Reset everything** (fresh content + wipe all events):
> ```bash
> npm run seed -- --force
> ```

---

## 🧭 Using the app

1. **Create an account** (or use the pre-filled demo login). New sign-ups are sent
   back to the **log-in** screen to sign in with their new credentials — no silent
   auto-login. Once logged in you land on the **course dashboard**, which shows an
   **overall progress ring** and a **live study-session timer** (top bar).
2. Open a course → pick a lesson:
   - 📖 **Reading** — scroll through, hit *Mark as read*.
   - 🎬 **Video** — play / pause / scrub. Watch the live "video events" panel fill up.
   - ✅ **Quiz** — answer the questions and submit for instant, colour-coded grading.
3. Click **My Analytics** to see your clickstream come alive: totals, **study time**,
   an activity timeline, a breakdown by component and event type, and the **raw log table**.
4. Hit **⬇ Export ▾** to download your clickstream as **CSV, Excel (.xlsx) or JSON**
   (Moodle column order). Downloads are authenticated, so you only ever export your own data.

Everything you click, watch and answer appears in Analytics **in real time**.

---

## 📊 Clickstream event catalogue

Every event is stored with the Moodle columns **and** machine-readable fields
(`event_type`, `target_type`, `target_id`, `payload`). Captured events include:

| Component | Event name | `event_type` | Trigger |
|---|---|---|---|
| Authentication | User registered / logged in / logged out | `auth_*` | Account + session lifecycle |
| System | Dashboard viewed / Course viewed / Analytics viewed | `page_view`, `course_view` | Navigating between screens |
| Lesson | Lesson viewed / Lesson marked complete | `lesson_view`, `lesson_complete` | Opening or finishing a lesson |
| Video | Video played / paused / seeked / completed | `video_play`, `video_pause`, `video_seek`, `video_ended` | HTML5 media events |
| Video | Video progress 25/50/75% | `video_progress` | Watch-through milestones |
| Video | Volume / playback-rate changed | `video_volume`, `video_ratechange` | Player controls |
| Quiz | Quiz started / answer selected / attempt submitted | `quiz_start`, `quiz_answer`, `quiz_submit` | Taking a quiz |
| Interface | Element clicked | `click` | Global click capture on any button/link/card/option |
| Interface | Page scrolled (25/50/75/100%) | `scroll_depth` | Scroll milestones |
| Interface | Time on page | `time_on_page` | Measured per screen, flushed on navigation/hide (also powers **Study time**) |
| Interface | Theme changed | `theme_toggle` | Light/dark switch |
| System | Clickstream exported | `export` | Downloading the log as CSV / Excel / JSON |

### How tracking works (client → server)

- **`public/js/tracker.js`** is a small engine that: assigns a **session id**, exposes
  `Tracker.log(...)` for semantic events, **auto-captures** clicks / scroll / time-on-page,
  **queues** events and **flushes them in batches** to `POST /api/ingest` (and reliably on
  page-hide via `navigator.sendBeacon`).
- The server enriches each event with the server-side **IP address** and the authenticated
  **user id**, then writes it to the `events` table.
- Sensitive server-side actions (login, quiz submit) are logged **on the server** too, so the
  timeline can't be spoofed away by the client.

---

## 🗄️ Data model

SQLite database at `data/learnflow.db` (created by `npm run seed`).

```
users ──1:N── sessions
users ──1:N── quiz_attempts ──N:1── lessons ──N:1── courses
users ──1:N── events   (the clickstream)
```

The **`events`** table (the clickstream) — Moodle columns in **bold**:

| Column | Purpose |
|---|---|
| id | Primary key |
| user_id, session_id | Who / which browser session |
| **time** | ISO-8601 client timestamp |
| **event_context** | e.g. `Course: Introduction to Data Science`, `Quiz: Web Basics` |
| **component** | e.g. `Video`, `Quiz`, `System`, `Authentication` |
| **event_name** | e.g. `Video played`, `Course viewed` |
| **description** | Human-readable sentence (Moodle-style) |
| **origin** | `web` |
| **ip_address** | Client IP |
| event_type, target_type, target_id | Machine-readable slugs for analytics |
| url, payload | Client route + JSON detail (e.g. `{ "percent": 50 }`) |
| created_at | Server insert time |

Ready-made exports (`/api/insights/export.csv`, `.xlsx`, `.json`) emit exactly the
reference sheet's columns: `Time, User full name, Event context, Component, Event name,
Description, Origin, IP address`. The Excel workbook is built with **zero external
dependencies** (a tiny OOXML/ZIP writer in [`server/xlsx.js`](server/xlsx.js)).

---

## 🔌 API reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create a learner account (returns the user; **no token — log in next**) |
| POST | `/api/auth/login` | — | Log in → `{ token, user }` |
| POST | `/api/auth/logout` | ✅ | Invalidate session |
| GET | `/api/me` | ✅ | Current user |
| GET | `/api/courses` | — | List courses + lesson meta |
| GET | `/api/courses/:slug` | — | One course |
| GET | `/api/lessons/:id` | — | One lesson (quiz answers stripped) |
| POST | `/api/quiz/:lessonId/submit` | ✅ | Grade & store a quiz attempt |
| GET | `/api/progress` | ✅ | Viewed lessons + best scores |
| POST | `/api/ingest` | optional | **Ingest a batch of clickstream events** |
| GET | `/api/insights/summary` | ✅ | Aggregates (self, or all if admin) |
| GET | `/api/insights/events` | ✅ | Recent raw events |
| GET | `/api/insights/export.csv` | ✅ | Moodle-format CSV download |
| GET | `/api/insights/export.xlsx` | ✅ | Moodle-format Excel (.xlsx) download |
| GET | `/api/insights/export.json` | ✅ | Full clickstream as structured JSON |

> ℹ️ The API uses neutral paths (`/api/ingest`, `/api/insights/*`) rather than
> `/api/events` or `/api/analytics/*` **on purpose** — browser ad-blockers and privacy
> extensions block URLs containing "analytics"/"events" (`ERR_BLOCKED_BY_CLIENT`), which
> would otherwise break the dashboard for users who have such an extension enabled.

---

## 🗂️ Project structure

```
.
├── server/
│   ├── db.js          # SQLite connection + schema (incl. events table)
│   ├── seed.js        # demo users + course/lesson content
│   ├── xlsx.js        # zero-dependency .xlsx (Excel) writer
│   └── index.js       # Express app: auth, content, quiz, clickstream, analytics, exports
├── public/
│   ├── index.html     # SPA shell
│   ├── css/styles.css # hand-written responsive light/dark theme
│   ├── js/
│   │   ├── tracker.js # THE clickstream engine (batching + sendBeacon)
│   │   ├── api.js     # fetch wrapper
│   │   └── app.js     # hash router + all five screens
│   └── media/         # locally-generated demo videos (offline-safe)
├── docs/
│   ├── ARCHITECTURE.md   # design deep-dive + diagrams
│   ├── DEMO_SCRIPT.md    # shot-by-shot demo-video script
│   └── presentation.html # slide deck (open in a browser)
├── data/              # SQLite db (git-ignored, created by seed)
├── package.json
└── README.md
```

---

## 🎥 Deliverables & submission

| Deliverable | Where |
|---|---|
| **GitHub repo (+ README)** | <https://github.com/luffy-taro-106/et-617-learnflow> |
| **Demo video** | _Add your recording link here_ — record by following [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) (a 2–3 minute walkthrough). |
| **Presentation** | [`docs/presentation.html`](docs/presentation.html) — open in any browser (arrow keys / `F` for fullscreen) or print to PDF. |

- **Demo video** — follow [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) (a 2–3 minute
  walkthrough script) while screen-recording the running app, then paste the share link above.
- **Presentation** — open [`docs/presentation.html`](docs/presentation.html) in any
  browser (use arrow keys / `F` for fullscreen) or print it to PDF.

---

## 🛠️ Tech stack & design choices

- **Vanilla JS frontend (no build step)** — nothing to compile, so the app runs anywhere
  with a single `npm start`; ideal for a reliable live demo.
- **SQLite via `better-sqlite3`** — a real, indexed relational store with zero setup.
- **bcryptjs** — pure-JS password hashing (no native build headaches).
- **Batched, beacon-backed tracking** — captures events without hurting UX and doesn't lose
  the last events when the tab closes.
- **Locally-generated videos** — the app is fully offline-capable; no third-party video CDN.

---

## 📜 License

MIT — see [LICENSE](LICENSE).
