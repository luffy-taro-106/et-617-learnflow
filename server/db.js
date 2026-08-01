/**
 * db.js — SQLite connection + schema.
 *
 * We use better-sqlite3 (synchronous, fast, zero-config). The database file
 * lives in ./data/learnflow.db and is created automatically on first run.
 *
 * Schema overview
 * ---------------
 *  users            registered learners (and one admin)
 *  sessions         auth tokens (simple bearer-token auth)
 *  courses          top-level courses
 *  lessons          ordered lessons inside a course (text | video | quiz)
 *  quiz_attempts    a learner's graded attempt at a quiz lesson
 *  events           THE CLICKSTREAM — every tracked user interaction
 *
 * The `events` table is intentionally modelled on the Moodle "logstore"
 * format used by the reference spreadsheet:
 *   Time · Event context · Component · Event name · Description · Origin · IP
 * ...while also keeping rich, queryable columns (user_id, event_type,
 * target_id, payload JSON, session_id) for analytics.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'learnflow.db');
const db = new Database(DB_PATH);

// Pragmas: WAL for better concurrency, foreign keys on for integrity.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'learner',   -- 'learner' | 'admin'
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    ip         TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS courses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    description TEXT,
    emoji       TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   INTEGER NOT NULL,
    slug        TEXT NOT NULL,
    title       TEXT NOT NULL,
    type        TEXT NOT NULL,             -- 'text' | 'video' | 'quiz'
    sort_order  INTEGER NOT NULL DEFAULT 0,
    duration    INTEGER,                   -- estimated minutes
    body        TEXT,                      -- JSON payload (text html / video meta / quiz questions)
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (course_id, slug)
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    lesson_id     INTEGER NOT NULL,
    score         INTEGER NOT NULL,
    max_score     INTEGER NOT NULL,
    answers       TEXT,                    -- JSON: chosen options per question
    duration_ms   INTEGER,
    submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
  );

  -- THE CLICKSTREAM ------------------------------------------------------
  CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER,
    session_id    TEXT,
    time          TEXT NOT NULL,           -- ISO 8601 client timestamp
    -- Moodle-style descriptive columns (drive the CSV export) -----------
    event_context TEXT,                    -- e.g. "Course: Intro to Data Science"
    component     TEXT,                    -- e.g. "Video", "Quiz", "System"
    event_name    TEXT,                    -- e.g. "Video played", "Course viewed"
    description   TEXT,                    -- human-readable sentence
    origin        TEXT DEFAULT 'web',      -- 'web'
    ip_address    TEXT,
    -- Rich analytics columns -------------------------------------------
    event_type    TEXT,                    -- machine slug: page_view, click, video_play ...
    target_type   TEXT,                    -- 'course' | 'lesson' | 'quiz' | 'element' | 'route'
    target_id     INTEGER,
    url           TEXT,                    -- client route / hash
    payload       TEXT,                    -- JSON of extra detail
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_user   ON events(user_id);
  CREATE INDEX IF NOT EXISTS idx_events_type   ON events(event_type);
  CREATE INDEX IF NOT EXISTS idx_events_time   ON events(time);
  CREATE INDEX IF NOT EXISTS idx_attempts_user ON quiz_attempts(user_id);
`);

module.exports = db;
