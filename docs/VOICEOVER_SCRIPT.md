# 🎙️ LearnFlow — Demo Video Voice-Over Script

Read this over [`docs/learnflow-demo.mp4`](learnflow-demo.mp4) — a ~57-second silent
screen-tour of the app. Each scene is on screen for ~4 seconds; the line under it is
written to be read comfortably in that time. Timings are approximate — feel free to
pause the video or slow it slightly while recording your voice-over.

> **Tip:** record in a quiet room, read at a relaxed pace, and smile — it comes through
> in your voice. If a line feels rushed, it's fine to trim a few words.

---

| # | Time | On screen | Say this |
|---|------|-----------|----------|
| 1 | 0:00 | Title card | "This is **LearnFlow** — an interactive learning platform I built for ET-617." |
| 2 | 0:04 | Login | "Learners sign in with a real account — passwords are securely hashed." |
| 3 | 0:08 | Dashboard | "The dashboard shows your overall progress ring and a live study-session timer." |
| 4 | 0:12 | Course page | "Each course blends text, video, and quiz lessons in a single flow." |
| 5 | 0:16 | Text lesson | "Reading lessons are interactive, with clear key takeaways." |
| 6 | 0:20 | Scroll tracking | "As I scroll, scroll-depth and time-on-page are captured automatically." |
| 7 | 0:24 | Video lesson | "In video lessons, every play, pause, and seek is logged live." |
| 8 | 0:28 | Quiz | "Quizzes are multiple-choice, and every answer I pick is tracked." |
| 9 | 0:32 | Quiz result | "Grading is instant and colour-coded — green for right, red for wrong." |
| 10 | 0:36 | Analytics | "My analytics dashboard is built entirely from my own clickstream data." |
| 11 | 0:40 | Raw log | "Here's the raw log — the same columns as a Moodle export, stored in SQLite." |
| 12 | 0:44 | Export menu | "And I can export it all as CSV, Excel, or JSON in a single click." |
| 13 | 0:48 | Dark mode | "The whole interface has a bold neo-brutalist look, in light and dark." |
| 14 | 0:52 | End card | "Everything runs locally with one command. Thanks for watching!" |

---

## Straight-read version (one paragraph)

> *This is LearnFlow — an interactive learning platform I built for ET-617. Learners sign
> in with a real account, and passwords are securely hashed. The dashboard shows your
> overall progress ring and a live study-session timer. Each course blends text, video,
> and quiz lessons in a single flow. Reading lessons are interactive, with clear key
> takeaways — and as I scroll, scroll-depth and time-on-page are captured automatically.
> In video lessons, every play, pause, and seek is logged live. Quizzes are
> multiple-choice, and every answer I pick is tracked; grading is instant and
> colour-coded — green for right, red for wrong. My analytics dashboard is built entirely
> from my own clickstream data. Here's the raw log — the same columns as a Moodle export,
> stored in SQLite — and I can export it all as CSV, Excel, or JSON in a single click. The
> whole interface has a bold neo-brutalist look, in light and dark. Everything runs
> locally with one command. Thanks for watching!*

---

## How the video was produced (for reference)

The video is a real capture of the running app: a headless-browser script
(`scratchpad/video/capture.js`, using Puppeteer) drove the **entire workflow** —
login → dashboard → course → text → video → quiz → analytics → export → dark mode —
asserting every step worked, then screenshotted each screen at 1080p with an on-brand
caption bar. `ffmpeg` assembled the frames into an MP4 with crossfades. The same run
doubles as an end-to-end smoke test (all 14 workflow checks passed).

To regenerate it after content changes: start the server, then run the capture + build
scripts and copy the resulting `learnflow-demo.mp4` back into `docs/`.
