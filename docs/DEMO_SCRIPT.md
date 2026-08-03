# 🎥 LearnFlow — Demo Video Script (~2.5–3 min)

A shot-by-shot script for recording the submission demo video. Record your screen
(QuickTime / OBS / Loom) at 1280×720 or higher. Suggested narration is in *italics*.

> **Before you hit record**
> ```bash
> npm install && npm run seed && npm start
> ```
> Open <http://localhost:3000>. Have the browser at a clean window. Optionally reset data
> with `npm run seed -- --force` so the analytics start empty for a crisp reveal.

---

## 0:00 — Intro (15s)
- **Show:** the login screen.
- *"This is LearnFlow — an interactive learning platform I built for ET-617. Learners log
  in, work through text, video and quiz lessons, and every single interaction is captured
  as clickstream data. Let me show you."*

## 0:15 — Log in (15s)
- **Do:** the demo learner is pre-filled → click **Log in**.
- *"I'll log in as a demo learner. Authentication is real — passwords are bcrypt-hashed and
  the login itself is the first event in the clickstream."*
- **Show:** the course dashboard with two courses and progress bars.

## 0:30 — Text lesson (25s)
- **Do:** open **Introduction to Data Science → What is Data Science?**
- **Do:** scroll through the reading, then click **Mark as read**.
- *"Here's an interactive reading lesson. As I scroll, the tracker logs scroll-depth
  milestones, and marking it complete logs a completion event."*

## 0:55 — Video lesson (35s)
- **Do:** click **Next lesson** → the **video** lesson.
- **Do:** press **play**, let it run a few seconds, **pause**, then **drag the timeline**
  to seek.
- **Show:** the live "video events" panel filling with *Video played*, *Video progress
  25%*, *Video paused*, *Video seeked*.
- *"The video lesson tracks real HTML5 media events — play, pause, seek, and watch-through
  progress at 25, 50 and 75%. You can see them appear live right here."*

## 1:30 — Quiz lesson (35s)
- **Do:** click **Next lesson** → the **quiz**.
- **Do:** answer the questions (get one wrong on purpose) → **Submit quiz**.
- **Show:** the colour-coded result — green for correct, red for the wrong pick — and the
  score badge.
- *"Quizzes are graded on the server, so answers never leak to the browser. I get instant
  feedback, and every answer I selected plus the final submission is tracked."*

## 2:05 — Analytics dashboard (35s)
- **Do:** click **My Analytics** in the top nav.
- **Show:** the stat cards (total events, quiz accuracy), the **activity timeline**, the
  **events-by-component** chips, the **top event types** bars, and scroll to the
  **raw clickstream log table**.
- *"Here's the payoff: a live analytics dashboard built from my own clickstream. Totals, a
  timeline, breakdowns by component and event type, and the raw log — using the exact same
  columns as a Moodle export: time, context, component, event name, description, origin and
  IP."*

## 2:40 — CSV export + admin (20s)
- **Do:** click **⬇ Export CSV** → show the downloaded file opening in a spreadsheet.
- *(Optional)* **Do:** log out, log in as **admin@learnflow.dev / admin123**, open
  Analytics.
- *"I can export the whole clickstream as CSV. And logging in as an admin shows aggregated
  analytics across all learners — the same data, wider scope."*

## 3:00 — Outro (5s)
- **Show:** the repo / README.
- *"Full source, README and architecture docs are in the repo. Thanks for watching!"*

---

### Recording tips
- Turn the browser zoom to 100% and hide bookmarks for a clean frame.
- If you want the analytics to look busy, click around a bit before recording the dashboard.
- Toggle the 🌙/☀️ theme button once — it's a nice touch and it's also a tracked event.
- Keep it under ~3 minutes; concise demos score well.
