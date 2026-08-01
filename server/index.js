/**
 * index.js — Express server: static frontend + REST API + clickstream ingest.
 *
 * Routes
 * ------
 *  POST /api/auth/register         create learner account
 *  POST /api/auth/login            log in, returns { token, user }
 *  POST /api/auth/logout           invalidate token (also logs a clickstream event)
 *  GET  /api/me                    current user from token
 *
 *  GET  /api/courses               list courses (+ lessons meta)
 *  GET  /api/courses/:slug         one course with full lessons
 *  GET  /api/lessons/:id           one lesson (quiz answers stripped for learners)
 *
 *  POST /api/quiz/:lessonId/submit grade a quiz attempt, store it, log event
 *  GET  /api/progress              learner's per-lesson progress + attempts
 *
 *  POST /api/events                ingest a BATCH of clickstream events
 *  GET  /api/analytics/summary     aggregate analytics (self, or all if admin)
 *  GET  /api/analytics/events      recent raw events (self, or all if admin)
 *  GET  /api/analytics/export.csv  Moodle-format CSV of the clickstream
 */

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Capture the real client IP (works behind a proxy too).
app.set('trust proxy', true);
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
}

// --------------------------------------------------------------- auth utils
function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function userFromToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`
    )
    .get(token);
  if (row) row._token = token;
  return row || null;
}

function requireAuth(req, res, next) {
  const user = userFromToken(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

// --------------------------------------------------------------- clickstream
const insertEvent = db.prepare(`
  INSERT INTO events
    (user_id, session_id, time, event_context, component, event_name, description,
     origin, ip_address, event_type, target_type, target_id, url, payload)
  VALUES
    (@user_id, @session_id, @time, @event_context, @component, @event_name, @description,
     @origin, @ip_address, @event_type, @target_type, @target_id, @url, @payload)
`);

/**
 * Record one clickstream event. Called both by the /api/events ingest route
 * (client-side events) and by server-side actions (login, quiz submit) so the
 * log is a single unified timeline.
 */
function recordEvent(e) {
  insertEvent.run({
    user_id: e.user_id ?? null,
    session_id: e.session_id ?? null,
    time: e.time || new Date().toISOString(),
    event_context: e.event_context ?? null,
    component: e.component ?? 'System',
    event_name: e.event_name ?? null,
    description: e.description ?? null,
    origin: e.origin ?? 'web',
    ip_address: e.ip_address ?? null,
    event_type: e.event_type ?? null,
    target_type: e.target_type ?? null,
    target_id: e.target_id ?? null,
    url: e.url ?? null,
    payload: e.payload ? JSON.stringify(e.payload) : null,
  });
}

// =================================================================== AUTH
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'An account with that email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email.toLowerCase().trim(), hash, 'learner');

  const user = { id: info.lastInsertRowid, name, email: email.toLowerCase().trim(), role: 'learner' };
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id, ip, user_agent) VALUES (?, ?, ?, ?)').run(
    token, user.id, clientIp(req), req.headers['user-agent'] || ''
  );

  recordEvent({
    user_id: user.id,
    time: new Date().toISOString(),
    component: 'Authentication',
    event_name: 'User registered',
    description: `The user with id '${user.id}' created an account and logged in.`,
    ip_address: clientIp(req),
    event_type: 'auth_register',
    target_type: 'user',
    target_id: user.id,
  });

  res.json({ token, user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!row || !bcrypt.compareSync(password, row.password_hash))
    return res.status(401).json({ error: 'Invalid email or password' });

  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id, ip, user_agent) VALUES (?, ?, ?, ?)').run(
    token, row.id, clientIp(req), req.headers['user-agent'] || ''
  );

  recordEvent({
    user_id: row.id,
    time: new Date().toISOString(),
    component: 'Authentication',
    event_name: 'User logged in',
    description: `The user with id '${row.id}' has logged in.`,
    ip_address: clientIp(req),
    event_type: 'auth_login',
    target_type: 'user',
    target_id: row.id,
  });

  res.json({ token, user: { id: row.id, name: row.name, email: row.email, role: row.role } });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  recordEvent({
    user_id: req.user.id,
    time: new Date().toISOString(),
    component: 'Authentication',
    event_name: 'User logged out',
    description: `The user with id '${req.user.id}' has logged out.`,
    ip_address: clientIp(req),
    event_type: 'auth_logout',
    target_type: 'user',
    target_id: req.user.id,
  });
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.user._token);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role } });
});

// ================================================================ CONTENT
app.get('/api/courses', (req, res) => {
  const courses = db.prepare('SELECT * FROM courses ORDER BY sort_order').all();
  const lessonStmt = db.prepare(
    'SELECT id, slug, title, type, duration, sort_order FROM lessons WHERE course_id = ? ORDER BY sort_order'
  );
  const out = courses.map((c) => ({ ...c, lessons: lessonStmt.all(c.id) }));
  res.json({ courses: out });
});

app.get('/api/courses/:slug', (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE slug = ?').get(req.params.slug);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const lessons = db
    .prepare('SELECT id, slug, title, type, duration, sort_order FROM lessons WHERE course_id = ? ORDER BY sort_order')
    .all(course.id);
  res.json({ course: { ...course, lessons } });
});

app.get('/api/lessons/:id', (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  const course = db.prepare('SELECT slug, title FROM courses WHERE id = ?').get(lesson.course_id);
  let body = JSON.parse(lesson.body || '{}');

  // Never leak quiz answers to the client — strip them before sending.
  if (lesson.type === 'quiz' && Array.isArray(body.questions)) {
    body = {
      ...body,
      questions: body.questions.map(({ answer, ...rest }) => rest),
    };
  }

  res.json({ lesson: { id: lesson.id, course_id: lesson.course_id, course, slug: lesson.slug, title: lesson.title, type: lesson.type, duration: lesson.duration, body } });
});

// ================================================================= QUIZ
app.post('/api/quiz/:lessonId/submit', requireAuth, (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.lessonId);
  if (!lesson || lesson.type !== 'quiz') return res.status(404).json({ error: 'Quiz not found' });

  const course = db.prepare('SELECT title FROM courses WHERE id = ?').get(lesson.course_id);
  const body = JSON.parse(lesson.body || '{}');
  const questions = body.questions || [];
  const answers = (req.body && req.body.answers) || {}; // { q1: 2, q2: 0, ... }
  const durationMs = (req.body && req.body.durationMs) || null;

  let score = 0;
  const detail = questions.map((q) => {
    const chosen = answers[q.id];
    const correct = chosen === q.answer;
    if (correct) score += 1;
    return { id: q.id, chosen, correct, answer: q.answer };
  });
  const maxScore = questions.length;
  const passed = maxScore > 0 && score / maxScore >= (body.passMark || 0.6);

  db.prepare(
    'INSERT INTO quiz_attempts (user_id, lesson_id, score, max_score, answers, duration_ms) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, lesson.id, score, maxScore, JSON.stringify(answers), durationMs);

  recordEvent({
    user_id: req.user.id,
    session_id: req.body && req.body.session_id,
    time: new Date().toISOString(),
    event_context: `Quiz: ${lesson.title}`,
    component: 'Quiz',
    event_name: 'Quiz attempt submitted',
    description: `The user with id '${req.user.id}' submitted quiz '${lesson.title}' scoring ${score}/${maxScore} in course '${course ? course.title : ''}'.`,
    ip_address: clientIp(req),
    event_type: 'quiz_submit',
    target_type: 'quiz',
    target_id: lesson.id,
    payload: { score, maxScore, passed, durationMs },
  });

  res.json({ score, maxScore, passed, detail });
});

app.get('/api/progress', requireAuth, (req, res) => {
  const attempts = db
    .prepare(
      `SELECT lesson_id, MAX(score) AS best_score, MAX(max_score) AS max_score, COUNT(*) AS attempts
         FROM quiz_attempts WHERE user_id = ? GROUP BY lesson_id`
    )
    .all(req.user.id);

  // Lessons a learner has "viewed" (from the clickstream) count as visited.
  const viewed = db
    .prepare(
      `SELECT DISTINCT target_id AS lesson_id FROM events
        WHERE user_id = ? AND event_type = 'lesson_view' AND target_id IS NOT NULL`
    )
    .all(req.user.id)
    .map((r) => r.lesson_id);

  res.json({ attempts, viewedLessonIds: viewed });
});

// ============================================================ CLICKSTREAM
app.post('/api/events', (req, res) => {
  const user = userFromToken(req); // events may be anonymous (e.g. on login page)
  const list = Array.isArray(req.body && req.body.events) ? req.body.events : [];
  if (!list.length) return res.json({ stored: 0 });

  const ip = clientIp(req);
  const insertMany = db.transaction((events) => {
    for (const e of events) {
      recordEvent({
        user_id: user ? user.id : e.user_id ?? null,
        session_id: e.session_id ?? null,
        time: e.time || new Date().toISOString(),
        event_context: e.event_context ?? null,
        component: e.component ?? 'System',
        event_name: e.event_name ?? null,
        description: e.description ?? null,
        origin: 'web',
        ip_address: ip,
        event_type: e.event_type ?? null,
        target_type: e.target_type ?? null,
        target_id: e.target_id ?? null,
        url: e.url ?? null,
        payload: e.payload ?? null,
      });
    }
  });
  insertMany(list);
  res.json({ stored: list.length });
});

// ============================================================== ANALYTICS
// Learners see only their own data; admins see everyone's.
function scope(req) {
  return req.user.role === 'admin' ? { where: '', args: [] } : { where: 'WHERE user_id = ?', args: [req.user.id] };
}

app.get('/api/analytics/summary', requireAuth, (req, res) => {
  const s = scope(req);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM events ${s.where}`).get(...s.args).n;

  const byType = db
    .prepare(`SELECT event_name AS label, COUNT(*) AS n FROM events ${s.where} GROUP BY event_name ORDER BY n DESC`)
    .all(...s.args);

  const byComponent = db
    .prepare(`SELECT component AS label, COUNT(*) AS n FROM events ${s.where} GROUP BY component ORDER BY n DESC`)
    .all(...s.args);

  // Events per day (last 14 days) for a timeline chart.
  const byDay = db
    .prepare(
      `SELECT substr(time,1,10) AS day, COUNT(*) AS n FROM events ${s.where}
        GROUP BY day ORDER BY day DESC LIMIT 14`
    )
    .all(...s.args)
    .reverse();

  const quizWhere = req.user.role === 'admin' ? '' : 'WHERE user_id = ?';
  const quizArgs = req.user.role === 'admin' ? [] : [req.user.id];
  const quiz = db
    .prepare(
      `SELECT COUNT(*) AS attempts, COALESCE(SUM(score),0) AS total_score,
              COALESCE(SUM(max_score),0) AS total_max FROM quiz_attempts ${quizWhere}`
    )
    .get(...quizArgs);

  const learners = req.user.role === 'admin'
    ? db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ?').get('learner').n
    : 1;

  res.json({
    scope: req.user.role === 'admin' ? 'all' : 'self',
    totals: {
      events: total,
      learners,
      quizAttempts: quiz.attempts,
      quizAccuracy: quiz.total_max ? Math.round((quiz.total_score / quiz.total_max) * 100) : null,
    },
    byType,
    byComponent,
    byDay,
  });
});

app.get('/api/analytics/events', requireAuth, (req, res) => {
  const s = scope(req);
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
  const rows = db
    .prepare(
      `SELECT e.id, e.time, e.event_context, e.component, e.event_name, e.description,
              e.origin, e.ip_address, e.event_type, e.url, u.name AS user_name
         FROM events e LEFT JOIN users u ON u.id = e.user_id
         ${s.where.replace('user_id', 'e.user_id')}
        ORDER BY e.id DESC LIMIT ?`
    )
    .all(...s.args, limit);
  res.json({ events: rows });
});

// CSV export in the exact Moodle logstore column order from the reference sheet.
app.get('/api/analytics/export.csv', requireAuth, (req, res) => {
  const s = scope(req);
  const rows = db
    .prepare(
      `SELECT e.time, e.event_context, e.component, e.event_name, e.description,
              e.origin, e.ip_address, u.name AS user_name
         FROM events e LEFT JOIN users u ON u.id = e.user_id
         ${s.where.replace('user_id', 'e.user_id')}
        ORDER BY e.id DESC`
    )
    .all(...s.args);

  const headers = ['Time', 'User full name', 'Event context', 'Component', 'Event name', 'Description', 'Origin', 'IP address'];
  const esc = (v) => {
    const str = v == null ? '' : String(v);
    return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.time, r.user_name || '', r.event_context || '', r.component || '',
      r.event_name || '', r.description || '', r.origin || '', r.ip_address || '',
    ].map(esc).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="learnflow-clickstream.csv"');
  res.send(lines.join('\n'));
});

// SPA fallback: any non-API route serves the app shell.
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 LearnFlow running at http://localhost:${PORT}`);
  console.log('   Demo learner : demo@learnflow.dev / demo123');
  console.log('   Admin        : admin@learnflow.dev / admin123\n');
});
