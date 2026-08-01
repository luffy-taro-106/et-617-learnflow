/**
 * seed.js — populates the database with demo users and course content.
 *
 * Run:  npm run seed          (idempotent — skips if content already exists)
 *       npm run seed -- --force   (wipes courses/lessons and re-seeds)
 *
 * Creates:
 *   • admin  : admin@learnflow.dev / admin123   (role: admin, sees analytics)
 *   • learner: demo@learnflow.dev  / demo123     (role: learner)
 *   • 2 courses, each with text + video + quiz lessons
 */

const bcrypt = require('bcryptjs');
const db = require('./db');

const force = process.argv.includes('--force');

if (force) {
  console.log('⚠  --force: clearing courses, lessons, attempts, events...');
  db.exec(`DELETE FROM events; DELETE FROM quiz_attempts; DELETE FROM lessons; DELETE FROM courses;`);
}

// ---------------------------------------------------------------- users
function ensureUser(name, email, password, role) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return existing.id;
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, hash, role);
  console.log(`  + user ${email} (${role})`);
  return info.lastInsertRowid;
}

ensureUser('Course Admin', 'admin@learnflow.dev', 'admin123', 'admin');
ensureUser('Demo Learner', 'demo@learnflow.dev', 'demo123', 'learner');

// ---------------------------------------------------------------- content
const alreadySeeded = db.prepare('SELECT COUNT(*) AS n FROM courses').get().n > 0;
if (alreadySeeded && !force) {
  console.log('✔ Content already present — skipping seed (use --force to reset).');
  process.exit(0);
}

const insertCourse = db.prepare(
  'INSERT INTO courses (slug, title, description, emoji, sort_order) VALUES (?, ?, ?, ?, ?)'
);
const insertLesson = db.prepare(
  'INSERT INTO lessons (course_id, slug, title, type, sort_order, duration, body) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

function addCourse(course) {
  const info = insertCourse.run(
    course.slug, course.title, course.description, course.emoji, course.sort_order
  );
  const courseId = info.lastInsertRowid;
  course.lessons.forEach((l, i) => {
    insertLesson.run(courseId, l.slug, l.title, l.type, i, l.duration, JSON.stringify(l.body));
  });
  console.log(`  + course "${course.title}" (${course.lessons.length} lessons)`);
}

// Local demo clips (shipped in public/media/) so the app works fully offline.
const SAMPLE_VIDEO = '/media/data-science.mp4';
const SAMPLE_VIDEO_2 = '/media/browser.mp4';

const courses = [
  {
    slug: 'intro-data-science',
    title: 'Introduction to Data Science',
    description: 'Understand what data science is, watch it in action, and test yourself.',
    emoji: '📊',
    sort_order: 0,
    lessons: [
      {
        slug: 'what-is-data-science',
        title: 'What is Data Science?',
        type: 'text',
        duration: 6,
        body: {
          html: `
            <p><strong>Data science</strong> is the practice of turning raw data into
            insight and action. It blends three disciplines:</p>
            <ul>
              <li><strong>Statistics &amp; mathematics</strong> — to reason about uncertainty.</li>
              <li><strong>Computer science</strong> — to collect, clean and process data at scale.</li>
              <li><strong>Domain expertise</strong> — to ask the right questions.</li>
            </ul>
            <h3>The typical workflow</h3>
            <ol>
              <li><em>Ask</em> a question.</li>
              <li><em>Collect</em> relevant data.</li>
              <li><em>Clean</em> and prepare it.</li>
              <li><em>Explore</em> and visualise.</li>
              <li><em>Model</em> and predict.</li>
              <li><em>Communicate</em> the result.</li>
            </ol>
            <blockquote>“In God we trust. All others must bring data.” — W. Edwards Deming</blockquote>
            <p>This very platform is a live example: every click you make is captured as
            <strong>clickstream data</strong> that a data scientist could later analyse to
            understand how learners behave.</p>
          `,
          keyPoints: [
            'Data science = statistics + computing + domain knowledge',
            'A repeatable workflow: ask → collect → clean → explore → model → communicate',
            'Clickstream data records user interactions for later analysis',
          ],
        },
      },
      {
        slug: 'data-science-in-action',
        title: 'Data Science in Action',
        type: 'video',
        duration: 3,
        body: {
          videoUrl: SAMPLE_VIDEO,
          poster: '',
          summary:
            'A short clip standing in for a real lecture. Play, pause, and seek — every ' +
            'video action is tracked as clickstream data you can inspect in Analytics.',
          transcriptNote:
            'Tip: try pausing and scrubbing the timeline, then open the Analytics page to ' +
            'see the "Video played", "Video paused" and "Video seeked" events appear.',
        },
      },
      {
        slug: 'ds-quiz',
        title: 'Data Science Basics',
        type: 'quiz',
        duration: 5,
        body: {
          passMark: 0.6,
          questions: [
            {
              id: 'q1',
              prompt: 'Which three disciplines best describe data science?',
              options: [
                'Biology, chemistry, physics',
                'Statistics, computer science, domain expertise',
                'Marketing, sales, finance',
                'Art, music, literature',
              ],
              answer: 1,
            },
            {
              id: 'q2',
              prompt: 'What is usually the FIRST step of the data science workflow?',
              options: ['Build a model', 'Ask a question', 'Publish results', 'Buy a GPU'],
              answer: 1,
            },
            {
              id: 'q3',
              prompt: 'Clickstream data is best described as…',
              options: [
                'A type of database server',
                'A record of user interactions such as clicks and views',
                'A machine-learning algorithm',
                'A programming language',
              ],
              answer: 1,
            },
            {
              id: 'q4',
              prompt: 'Cleaning and preparing data comes BEFORE which step?',
              options: ['Collecting data', 'Asking a question', 'Modelling', 'Nothing — it is last'],
              answer: 2,
            },
          ],
        },
      },
    ],
  },
  {
    slug: 'web-dev-basics',
    title: 'Web Development Basics',
    description: 'How the web works — the three languages of the browser, in theory and practice.',
    emoji: '🌐',
    sort_order: 1,
    lessons: [
      {
        slug: 'html-css-js',
        title: 'HTML, CSS & JavaScript',
        type: 'text',
        duration: 5,
        body: {
          html: `
            <p>Every web page is built from three core technologies:</p>
            <ul>
              <li><strong>HTML</strong> — the <em>structure</em> (headings, paragraphs, buttons).</li>
              <li><strong>CSS</strong> — the <em>style</em> (colours, layout, spacing).</li>
              <li><strong>JavaScript</strong> — the <em>behaviour</em> (interactivity, logic).</li>
            </ul>
            <p>A helpful analogy: HTML is the skeleton, CSS is the skin and clothes, and
            JavaScript is the muscles that make everything move.</p>
            <h3>Client &amp; server</h3>
            <p>Your browser (the <strong>client</strong>) requests pages and data from a
            <strong>server</strong>. This LearnFlow app is exactly that: a vanilla-JS client
            talking to a Node/Express server that stores your clickstream in SQLite.</p>
          `,
          keyPoints: [
            'HTML = structure, CSS = style, JavaScript = behaviour',
            'The browser (client) talks to a server over HTTP',
            'LearnFlow itself is a client–server app you can inspect',
          ],
        },
      },
      {
        slug: 'browser-in-action',
        title: 'The Browser in Action',
        type: 'video',
        duration: 3,
        body: {
          videoUrl: SAMPLE_VIDEO_2,
          poster: '',
          summary: 'A second sample clip to demonstrate multi-video clickstream tracking.',
          transcriptNote: 'Watch at least halfway to trigger a "video progress 50%" event.',
        },
      },
      {
        slug: 'web-quiz',
        title: 'Web Basics',
        type: 'quiz',
        duration: 4,
        body: {
          passMark: 0.6,
          questions: [
            {
              id: 'q1',
              prompt: 'Which language is responsible for the STRUCTURE of a page?',
              options: ['CSS', 'JavaScript', 'HTML', 'SQL'],
              answer: 2,
            },
            {
              id: 'q2',
              prompt: 'Which language adds INTERACTIVITY and behaviour?',
              options: ['HTML', 'JavaScript', 'CSS', 'JSON'],
              answer: 1,
            },
            {
              id: 'q3',
              prompt: 'In client–server architecture, the browser is the…',
              options: ['Server', 'Database', 'Client', 'Compiler'],
              answer: 2,
            },
          ],
        },
      },
    ],
  },
];

const seedAll = db.transaction(() => courses.forEach(addCourse));
seedAll();

console.log('\n✅ Seed complete.');
console.log('   Admin   : admin@learnflow.dev / admin123');
console.log('   Learner : demo@learnflow.dev  / demo123');
process.exit(0);
