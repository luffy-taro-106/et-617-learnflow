/**
 * app.js — the LearnFlow single-page application.
 *
 * A tiny hash router renders one of five screens:
 *   #/login              auth (login + register)
 *   #/dashboard          course catalogue + progress
 *   #/course/:slug       lessons inside a course
 *   #/lesson/:id         a text / video / quiz lesson (fully tracked)
 *   #/analytics          the learner's (or admin's) clickstream dashboard
 *
 * Each screen sets the Tracker context and logs a semantic "…viewed" event.
 */
(function () {
  const appEl = document.getElementById('app');
  const topbar = document.getElementById('topbar');
  let user = null;

  // ------------------------------------------------------------- helpers
  const h = (strings, ...vals) => strings.map((s, i) => s + (vals[i] ?? '')).join('');
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
  function toast(msg, kind = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast toast-' + kind;
    setTimeout(() => (t.className = 'toast hidden'), 2600);
  }
  function setToken(tok) {
    if (tok) localStorage.setItem('lf_token', tok);
    else localStorage.removeItem('lf_token');
  }

  // ------------------------------------------------------- study timer
  // A live, ticking "time in this learning session" clock in the top bar.
  // The start time is kept in sessionStorage so it survives page reloads
  // within the same browser session (and resets cleanly on logout).
  const TIMER_KEY = 'lf_timer_start';
  let timerInterval = null;
  function fmtDuration(totalSec) {
    totalSec = Math.max(0, Math.floor(totalSec));
    const s = totalSec % 60, m = Math.floor(totalSec / 60) % 60, hh = Math.floor(totalSec / 3600);
    const pad = (n) => String(n).padStart(2, '0');
    return hh > 0 ? `${hh}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function startTimer() {
    let start = Number(sessionStorage.getItem(TIMER_KEY));
    if (!start) { start = Date.now(); sessionStorage.setItem(TIMER_KEY, String(start)); }
    const tick = () => {
      const el = document.getElementById('studyTimerVal');
      if (el) el.textContent = fmtDuration((Date.now() - start) / 1000);
    };
    tick();
    if (!timerInterval) timerInterval = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    sessionStorage.removeItem(TIMER_KEY);
  }

  // ------------------------------------------------------- error screen
  // Shown when a screen fails to load (e.g. the server is unreachable) so the
  // user gets a friendly, retryable message instead of a raw "Failed to fetch".
  function renderErrorScreen(err) {
    const isNetwork =
      err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(err.message || '');
    appEl.innerHTML = h`
      <div class="container">
        <div class="error-card">
          <div class="error-emoji">${isNetwork ? '📡' : '⚠️'}</div>
          <h2>${isNetwork ? "Can't reach the server" : 'Something went wrong'}</h2>
          <p class="muted">${
            isNetwork
              ? 'The connection to LearnFlow dropped. Make sure the server is running (npm start), then try again.'
              : esc(err.message)
          }</p>
          <button class="btn btn-primary" id="retryBtn" data-track-label="retry">↻ Retry</button>
        </div>
      </div>`;
    const btn = document.getElementById('retryBtn');
    if (btn) btn.addEventListener('click', () => route());
  }

  // ------------------------------------------------------------- theme
  const themeToggle = document.getElementById('themeToggle');
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lf_theme', theme);
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  applyTheme(localStorage.getItem('lf_theme') || 'light');
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    Tracker.log({
      component: 'Interface', event_name: 'Theme changed', event_type: 'theme_toggle',
      description: `Switched to ${next} theme.`, payload: { theme: next },
    });
  });

  // ------------------------------------------------------------- top bar
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await API.logout(); } catch (_) {}
    Tracker.flush(false);
    stopTimer();
    setToken(null);
    user = null;
    navigate('#/login');
  });

  function renderTopbar() {
    if (!user) { topbar.classList.add('hidden'); return; }
    topbar.classList.remove('hidden');
    startTimer();
    const chip = document.getElementById('userChip');
    chip.innerHTML = h`<span class="avatar">${esc(user.name[0].toUpperCase())}</span>
      <span class="user-meta"><strong>${esc(user.name)}</strong><small>${esc(user.role)}</small></span>`;
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const active = location.hash.startsWith('#/' + a.dataset.nav);
      a.classList.toggle('active', active);
    });
  }

  // ============================================================= AUTH VIEW
  function renderAuth() {
    Tracker.setContext({ event_context: 'Authentication', target_type: 'route', target_id: null });
    topbar.classList.add('hidden');
    appEl.innerHTML = h`
      <div class="auth-wrap">
        <div class="auth-hero">
          <div class="auth-hero-inner">
            <h1>🎓 LearnFlow</h1>
            <p class="lede">Learn by doing — and watch your every interaction become
            <strong>clickstream data</strong> you can explore.</p>
            <ul class="hero-points">
              <li>📖 Interactive text, 🎬 video &amp; ✅ quizzes</li>
              <li>🖱️ Clicks, scrolls, video &amp; quiz actions tracked</li>
              <li>📈 A personal analytics dashboard + CSV export</li>
            </ul>
          </div>
        </div>
        <div class="auth-panel">
          <div class="tabs">
            <button class="tab active" data-tab="login" data-track-label="tab-login">Log in</button>
            <button class="tab" data-tab="register" data-track-label="tab-register">Create account</button>
          </div>

          <form id="loginForm" class="auth-form">
            <label>Email<input type="email" name="email" value="demo@learnflow.dev" required /></label>
            <label>Password<input type="password" name="password" value="demo123" required /></label>
            <button class="btn btn-primary btn-block" type="submit">Log in</button>
            <p class="hint">Demo learner is pre-filled. Admin: <code>admin@learnflow.dev / admin123</code></p>
          </form>

          <form id="registerForm" class="auth-form hidden">
            <label>Full name<input type="text" name="name" placeholder="Ada Lovelace" required /></label>
            <label>Email<input type="email" name="email" placeholder="you@example.com" required /></label>
            <label>Password<input type="password" name="password" placeholder="min 6 characters" required /></label>
            <button class="btn btn-primary btn-block" type="submit">Create account</button>
            <p class="hint">After creating your account you'll log in with your new credentials.</p>
          </form>
        </div>
      </div>`;

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    function showAuthTab(name) {
      appEl.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
      loginForm.classList.toggle('hidden', name !== 'login');
      registerForm.classList.toggle('hidden', name !== 'register');
    }
    appEl.querySelectorAll('.tab').forEach((tab) =>
      tab.addEventListener('click', () => showAuthTab(tab.dataset.tab))
    );

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(loginForm);
      try {
        const { token, user: u } = await API.login(f.get('email'), f.get('password'));
        setToken(token); user = u;
        toast(`Welcome back, ${u.name.split(' ')[0]}!`, 'success');
        navigate('#/dashboard');
      } catch (err) { toast(err.message, 'error'); }
    });

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(registerForm);
      try {
        const { user: u } = await API.register(f.get('name'), f.get('email'), f.get('password'));
        // No auto-login: send the learner to the login tab to sign in.
        toast(`Account created! Please log in to continue, ${u.name.split(' ')[0]}.`, 'success');
        showAuthTab('login');
        loginForm.querySelector('input[name="email"]').value = u.email;
        const pw = loginForm.querySelector('input[name="password"]');
        pw.value = '';
        pw.focus();
        registerForm.reset();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // A circular SVG progress ring (0–100) used on the dashboard.
  function progressRing(pct) {
    const r = 34;
    const c = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(100, pct));
    const off = c * (1 - clamped / 100);
    return h`
      <svg class="ring" viewBox="0 0 80 80" width="88" height="88" role="img" aria-label="${clamped}% complete">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fb7185" />
            <stop offset="55%" stop-color="#f97316" />
            <stop offset="100%" stop-color="#f59e0b" />
          </linearGradient>
        </defs>
        <circle class="ring-bg" cx="40" cy="40" r="${r}" fill="none" stroke-width="8" />
        <circle class="ring-fg" cx="40" cy="40" r="${r}" fill="none" stroke-width="8" stroke-linecap="round"
                stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
                transform="rotate(-90 40 40)" />
        <text x="40" y="40" class="ring-text" text-anchor="middle" dominant-baseline="central">${clamped}%</text>
      </svg>`;
  }

  // ============================================================ DASHBOARD
  async function renderDashboard() {
    Tracker.setContext({ event_context: 'Dashboard', target_type: 'route', target_id: null });
    Tracker.log({ component: 'System', event_name: 'Dashboard viewed', event_type: 'page_view',
      description: `The user with id '${user.id}' viewed the course dashboard.` });

    appEl.innerHTML = `<div class="loading">Loading courses…</div>`;
    const [{ courses }, progress] = await Promise.all([API.courses(), API.progress()]);
    const viewed = new Set(progress.viewedLessonIds);
    const attemptByLesson = Object.fromEntries(progress.attempts.map((a) => [a.lesson_id, a]));

    // Overall progress across every course (for the dashboard ring).
    const totalLessons = courses.reduce((n, c) => n + c.lessons.length, 0);
    const doneLessons = courses.reduce(
      (n, c) => n + c.lessons.filter((l) => viewed.has(l.id) || attemptByLesson[l.id]).length, 0
    );
    const overallPct = totalLessons ? Math.round((doneLessons / totalLessons) * 100) : 0;

    const cards = courses.map((c) => {
      const done = c.lessons.filter((l) => viewed.has(l.id) || attemptByLesson[l.id]).length;
      const pct = Math.round((done / c.lessons.length) * 100);
      const lessonPills = c.lessons.map((l) => {
        const icon = l.type === 'video' ? '🎬' : l.type === 'quiz' ? '✅' : '📖';
        const isDone = viewed.has(l.id) || attemptByLesson[l.id];
        return `<span class="pill ${isDone ? 'pill-done' : ''}">${icon} ${esc(l.title)}</span>`;
      }).join('');
      return h`
        <a class="card course-card" href="#/course/${esc(c.slug)}" data-track-label="course-${esc(c.slug)}">
          <div class="course-emoji">${esc(c.emoji || '📚')}</div>
          <h3>${esc(c.title)}</h3>
          <p class="muted">${esc(c.description)}</p>
          <div class="lesson-pills">${lessonPills}</div>
          <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
          <div class="course-foot"><span>${done}/${c.lessons.length} done</span><span>${pct}%</span></div>
        </a>`;
    }).join('');

    const doneMsg = overallPct === 100
      ? 'Every lesson complete — nice work! 🎉'
      : overallPct === 0
        ? 'Pick a course below to begin your first lesson.'
        : 'Keep going — pick up where you left off.';

    appEl.innerHTML = h`
      <div class="container">
        <div class="dash-hero">
          <div class="dash-hero-ring">${progressRing(overallPct)}</div>
          <div class="dash-hero-info">
            <h2>Welcome back, ${esc(user.name.split(' ')[0])} 👋</h2>
            <p class="muted">You've completed <b>${doneLessons}</b> of <b>${totalLessons}</b> lessons
              across ${courses.length} ${courses.length === 1 ? 'course' : 'courses'}. ${doneMsg}</p>
            <div class="dash-hero-meta">
              <span class="metric metric-primary">📈 ${overallPct}% overall</span>
              <span class="metric">⏱ Session time is ticking up top</span>
              <a class="metric metric-link" href="#/analytics" data-track-label="hero-analytics">📊 View my analytics →</a>
            </div>
          </div>
        </div>
        <div class="grid">${cards}</div>
      </div>`;
    renderTopbar();
  }

  // =============================================================== COURSE
  async function renderCourse(slug) {
    appEl.innerHTML = `<div class="loading">Loading course…</div>`;
    let data;
    try { data = await API.course(slug); }
    catch (e) { appEl.innerHTML = `<div class="container"><p>Course not found.</p></div>`; return; }
    const { course } = data;
    Tracker.setContext({ event_context: `Course: ${course.title}`, target_type: 'course', target_id: course.id });
    Tracker.log({ component: 'System', event_name: 'Course viewed', event_type: 'course_view',
      target_type: 'course', target_id: course.id,
      description: `The user with id '${user.id}' viewed the course '${course.title}'.` });

    const progress = await API.progress();
    const viewed = new Set(progress.viewedLessonIds);
    const attemptByLesson = Object.fromEntries(progress.attempts.map((a) => [a.lesson_id, a]));

    const items = course.lessons.map((l, i) => {
      const icon = l.type === 'video' ? '🎬' : l.type === 'quiz' ? '✅' : '📖';
      const attempt = attemptByLesson[l.id];
      const status = attempt
        ? `<span class="tag tag-score">${attempt.best_score}/${attempt.max_score}</span>`
        : viewed.has(l.id) ? `<span class="tag tag-done">viewed</span>` : `<span class="tag">start</span>`;
      return h`
        <a class="lesson-row" href="#/lesson/${l.id}" data-track-label="lesson-${esc(l.slug)}">
          <span class="lesson-index">${i + 1}</span>
          <span class="lesson-icon">${icon}</span>
          <span class="lesson-title">${esc(l.title)}<small class="muted">${esc(l.type)} · ${l.duration || 3} min</small></span>
          ${status}
        </a>`;
    }).join('');

    appEl.innerHTML = h`
      <div class="container">
        <a class="back" href="#/dashboard" data-track-label="back-to-dashboard">← All courses</a>
        <div class="page-head">
          <div><h2>${esc(course.emoji || '')} ${esc(course.title)}</h2>
          <p class="muted">${esc(course.description)}</p></div>
        </div>
        <div class="lesson-list">${items}</div>
      </div>`;
    renderTopbar();
  }

  // =============================================================== LESSON
  async function renderLesson(id) {
    appEl.innerHTML = `<div class="loading">Loading lesson…</div>`;
    let data;
    try { data = await API.lesson(id); }
    catch (e) { appEl.innerHTML = `<div class="container"><p>Lesson not found.</p></div>`; return; }
    const { lesson } = data;
    const ctxName = `${lesson.type[0].toUpperCase() + lesson.type.slice(1)}: ${lesson.title}`;
    Tracker.setContext({ event_context: ctxName, target_type: 'lesson', target_id: lesson.id });
    Tracker.log({ component: 'Lesson', event_name: 'Lesson viewed', event_type: 'lesson_view',
      target_type: 'lesson', target_id: lesson.id,
      description: `The user with id '${user.id}' viewed the ${lesson.type} lesson '${lesson.title}'.` });

    const nav = await buildLessonNav(lesson);
    let inner = '';
    if (lesson.type === 'text') inner = renderTextLesson(lesson);
    else if (lesson.type === 'video') inner = renderVideoLessonShell(lesson);
    else if (lesson.type === 'quiz') inner = renderQuizShell(lesson);

    appEl.innerHTML = h`
      <div class="container lesson-container">
        <a class="back" href="#/course/${esc(lesson.course.slug)}" data-track-label="back-to-course">← ${esc(lesson.course.title)}</a>
        <div class="lesson-head">
          <span class="lesson-type-badge type-${lesson.type}">${lesson.type === 'video' ? '🎬 Video' : lesson.type === 'quiz' ? '✅ Quiz' : '📖 Reading'}</span>
          <h2>${esc(lesson.title)}</h2>
        </div>
        <div id="lessonBody">${inner}</div>
        <div class="lesson-nav">${nav}</div>
      </div>`;

    if (lesson.type === 'video') wireVideoLesson(lesson);
    if (lesson.type === 'quiz') wireQuiz(lesson);
    renderTopbar();
  }

  async function buildLessonNav(lesson) {
    const { course } = await API.course(lesson.course.slug);
    const idx = course.lessons.findIndex((l) => l.id === lesson.id);
    const prev = course.lessons[idx - 1];
    const next = course.lessons[idx + 1];
    return h`
      ${prev ? `<a class="btn btn-ghost" href="#/lesson/${prev.id}" data-track-label="prev-lesson">← Previous</a>` : `<span></span>`}
      ${next ? `<a class="btn btn-primary" href="#/lesson/${next.id}" data-track-label="next-lesson">Next lesson →</a>`
             : `<a class="btn btn-primary" href="#/course/${esc(course.slug)}" data-track-label="finish-course">Finish course ✓</a>`}`;
  }

  // ---- text lesson
  function renderTextLesson(lesson) {
    const b = lesson.body || {};
    const key = (b.keyPoints || []).map((k) => `<li>${esc(k)}</li>`).join('');
    return h`
      <article class="reading">${b.html || ''}</article>
      ${key ? `<div class="callout"><h4>🔑 Key takeaways</h4><ul>${key}</ul></div>` : ''}
      <button id="markRead" class="btn btn-primary" data-track-label="mark-read">Mark as read ✓</button>`;
  }

  // ---- video lesson (shell + wiring so we can attach real event listeners)
  function renderVideoLessonShell(lesson) {
    const b = lesson.body || {};
    return h`
      <p class="muted">${esc(b.summary || '')}</p>
      <div class="video-wrap">
        <video id="lessonVideo" controls preload="metadata" ${b.poster ? `poster="${esc(b.poster)}"` : ''}>
          <source src="${esc(b.videoUrl)}" type="video/mp4" />
          Your browser does not support HTML5 video.
        </video>
      </div>
      <div class="callout"><h4>💡 Try this</h4><p>${esc(b.transcriptNote || '')}</p></div>
      <div id="videoEvents" class="mini-log"><em>Video events will appear here as you interact…</em></div>`;
  }

  function wireVideoLesson(lesson) {
    const v = document.getElementById('lessonVideo');
    const logEl = document.getElementById('videoEvents');
    const progressMarks = new Set();
    const pushMini = (txt) => {
      if (logEl.querySelector('em')) logEl.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'mini-log-row';
      div.textContent = `${new Date().toLocaleTimeString()} — ${txt}`;
      logEl.prepend(div);
    };
    const vlog = (name, type, desc, payload) => {
      Tracker.log({ component: 'Video', event_name: name, event_type: type,
        target_type: 'lesson', target_id: lesson.id,
        description: `The user with id '${user.id}' ${desc} in video '${lesson.title}'.`, payload });
      pushMini(name + (payload && payload.time != null ? ` @ ${payload.time}s` : ''));
    };

    v.addEventListener('play', () => vlog('Video played', 'video_play', 'started/resumed playback', { time: Math.round(v.currentTime) }));
    v.addEventListener('pause', () => { if (!v.ended) vlog('Video paused', 'video_pause', 'paused playback', { time: Math.round(v.currentTime) }); });
    v.addEventListener('ended', () => vlog('Video completed', 'video_ended', 'finished watching', { time: Math.round(v.duration) }));
    v.addEventListener('seeked', () => vlog('Video seeked', 'video_seek', 'jumped to a new position', { time: Math.round(v.currentTime) }));
    v.addEventListener('ratechange', () => vlog('Playback rate changed', 'video_ratechange', `changed speed to ${v.playbackRate}x`, { rate: v.playbackRate }));
    v.addEventListener('volumechange', () => vlog(v.muted ? 'Video muted' : 'Volume changed', 'video_volume', v.muted ? 'muted the video' : 'changed the volume', { volume: v.volume, muted: v.muted }));
    v.addEventListener('timeupdate', () => {
      if (!v.duration) return;
      const pct = Math.round((v.currentTime / v.duration) * 100);
      [25, 50, 75].forEach((m) => {
        if (pct >= m && !progressMarks.has(m)) {
          progressMarks.add(m);
          vlog(`Video progress ${m}%`, 'video_progress', `reached ${m}% progress`, { percent: m });
        }
      });
    });
  }

  // ---- quiz lesson
  function renderQuizShell(lesson) {
    const b = lesson.body || {};
    const qs = (b.questions || []).map((q, qi) => {
      const opts = q.options.map((opt, oi) => h`
        <label class="option" data-track-label="opt-${q.id}-${oi}">
          <input type="radio" name="${q.id}" value="${oi}" />
          <span>${esc(opt)}</span>
        </label>`).join('');
      return h`
        <div class="question" data-qid="${q.id}">
          <h4><span class="q-num">${qi + 1}</span> ${esc(q.prompt)}</h4>
          <div class="options">${opts}</div>
        </div>`;
    }).join('');
    return h`
      <p class="muted">Answer all ${b.questions.length} questions. Pass mark: ${Math.round((b.passMark || 0.6) * 100)}%. Every answer you pick is tracked.</p>
      <form id="quizForm" class="quiz">${qs}
        <button class="btn btn-primary btn-lg" type="submit" data-track-label="submit-quiz">Submit quiz</button>
      </form>
      <div id="quizResult" class="hidden"></div>`;
  }

  function wireQuiz(lesson) {
    const form = document.getElementById('quizForm');
    const started = Date.now();
    let firstInteraction = false;

    Tracker.log({ component: 'Quiz', event_name: 'Quiz started', event_type: 'quiz_start',
      target_type: 'quiz', target_id: lesson.id,
      description: `The user with id '${user.id}' started quiz '${lesson.title}'.` });

    form.addEventListener('change', (e) => {
      if (e.target.name) {
        if (!firstInteraction) firstInteraction = true;
        Tracker.log({ component: 'Quiz', event_name: 'Quiz answer selected', event_type: 'quiz_answer',
          target_type: 'quiz', target_id: lesson.id,
          description: `The user with id '${user.id}' selected option ${e.target.value} for question '${e.target.name}' in quiz '${lesson.title}'.`,
          payload: { question: e.target.name, choice: Number(e.target.value) } });
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const answers = {};
      (lesson.body.questions || []).forEach((q) => {
        const sel = form.querySelector(`input[name="${q.id}"]:checked`);
        if (sel) answers[q.id] = Number(sel.value);
      });
      if (Object.keys(answers).length < (lesson.body.questions || []).length) {
        toast('Please answer every question first.', 'error');
        return;
      }
      try {
        const result = await API.submitQuiz(lesson.id, {
          answers, durationMs: Date.now() - started, session_id: Tracker.sessionId,
        });
        showQuizResult(lesson, result);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  function showQuizResult(lesson, result) {
    const box = document.getElementById('quizResult');
    box.classList.remove('hidden');
    // Mark right/wrong on the form.
    result.detail.forEach((d) => {
      const q = document.querySelector(`.question[data-qid="${d.id}"]`);
      if (!q) return;
      q.querySelectorAll('.option').forEach((optEl, oi) => {
        optEl.classList.remove('correct', 'wrong');
        if (oi === d.answer) optEl.classList.add('correct');
        else if (oi === d.chosen && !d.correct) optEl.classList.add('wrong');
      });
    });
    const pct = Math.round((result.score / result.maxScore) * 100);
    box.innerHTML = h`
      <div class="result ${result.passed ? 'pass' : 'fail'}">
        <div class="result-score">${result.score}<span>/${result.maxScore}</span></div>
        <div>
          <h3>${result.passed ? '🎉 Passed!' : '📚 Keep practising'}</h3>
          <p class="muted">You scored ${pct}%. ${result.passed ? 'Great work!' : 'Review the highlighted answers and try again.'}</p>
          <a class="btn btn-ghost btn-sm" href="#/analytics" data-track-label="view-analytics-after-quiz">See this in your analytics →</a>
        </div>
      </div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(result.passed ? 'Quiz passed!' : `Scored ${result.score}/${result.maxScore}`, result.passed ? 'success' : 'info');
  }

  // Download the clickstream in a chosen format via an authenticated fetch
  // (so the bearer token is sent) → object URL → save. Works for csv/xlsx/json.
  async function downloadExport(format) {
    const names = { csv: 'CSV', xlsx: 'Excel', json: 'JSON' };
    try {
      toast(`Preparing ${names[format]} download…`, 'info');
      const blob = await API.exportBlob(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `learnflow-clickstream.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      Tracker.log({
        component: 'System', event_name: 'Clickstream exported', event_type: 'export',
        description: `The user exported their clickstream as ${names[format]}.`, payload: { format },
      });
      toast(`${names[format]} downloaded ✓`, 'success');
    } catch (err) {
      toast(err.message || 'Export failed', 'error');
    }
  }

  // ============================================================ ANALYTICS
  async function renderAnalytics() {
    Tracker.setContext({ event_context: 'Analytics', target_type: 'route', target_id: null });
    Tracker.log({ component: 'System', event_name: 'Analytics viewed', event_type: 'page_view',
      description: `The user with id '${user.id}' viewed the analytics dashboard.` });
    appEl.innerHTML = `<div class="loading">Crunching your clickstream…</div>`;

    const [summary, eventsData] = await Promise.all([API.analyticsSummary(), API.analyticsEvents(150)]);
    const isAdmin = summary.scope === 'all';

    const stat = (label, value, sub) => h`
      <div class="stat"><div class="stat-value">${value}</div><div class="stat-label">${label}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;

    const maxDay = Math.max(1, ...summary.byDay.map((d) => d.n));
    const timeline = summary.byDay.map((d) => h`
      <div class="tl-col" title="${d.day}: ${d.n} events">
        <div class="tl-bar" style="height:${Math.round((d.n / maxDay) * 100)}%"></div>
        <div class="tl-label">${esc(d.day.slice(5))}</div>
      </div>`).join('');

    const maxType = Math.max(1, ...summary.byType.map((t) => t.n));
    const typeBars = summary.byType.slice(0, 12).map((t) => h`
      <div class="hbar-row">
        <div class="hbar-label">${esc(t.label || 'Unnamed')}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${Math.round((t.n / maxType) * 100)}%"></div></div>
        <div class="hbar-val">${t.n}</div>
      </div>`).join('');

    const compChips = summary.byComponent.map((c) =>
      `<span class="chip">${esc(c.label || 'System')} <b>${c.n}</b></span>`).join('');

    const rows = eventsData.events.map((e) => h`
      <tr>
        <td class="nowrap">${esc((e.time || '').replace('T', ' ').slice(0, 19))}</td>
        ${isAdmin ? `<td>${esc(e.user_name || '—')}</td>` : ''}
        <td>${esc(e.event_context || '—')}</td>
        <td><span class="chip chip-sm">${esc(e.component || '')}</span></td>
        <td>${esc(e.event_name || '')}</td>
        <td class="desc">${esc(e.description || '')}</td>
        <td>${esc(e.origin || 'web')}</td>
        <td class="nowrap">${esc(e.ip_address || '')}</td>
      </tr>`).join('');

    appEl.innerHTML = h`
      <div class="container">
        <div class="page-head">
          <div>
            <h2>${isAdmin ? '📊 Course Analytics (all learners)' : '📊 My Learning Analytics'}</h2>
            <p class="muted">${isAdmin ? 'Aggregated clickstream across every learner.' : 'A live view of your own clickstream data.'}
              Data updates as you use the app.</p>
          </div>
          <div class="export-menu">
            <button class="btn btn-primary" id="exportBtn" aria-haspopup="true" aria-expanded="false" data-track-label="export-toggle">⬇ Export ▾</button>
            <div class="export-dropdown hidden" id="exportDropdown" role="menu">
              <button data-fmt="csv" data-track-label="export-csv">📄 CSV <small>.csv</small></button>
              <button data-fmt="xlsx" data-track-label="export-xlsx">📊 Excel <small>.xlsx</small></button>
              <button data-fmt="json" data-track-label="export-json">🧾 JSON <small>.json</small></button>
            </div>
          </div>
        </div>

        <div class="stat-grid">
          ${stat('Total events', summary.totals.events)}
          ${stat('Study time', fmtDuration(summary.totals.studySeconds || 0), 'measured from your clickstream')}
          ${isAdmin ? stat('Learners', summary.totals.learners) : stat('Session', 'live', Tracker.sessionId.slice(0, 8))}
          ${stat('Quiz attempts', summary.totals.quizAttempts)}
          ${stat('Quiz accuracy', summary.totals.quizAccuracy != null ? summary.totals.quizAccuracy + '%' : '—')}
        </div>

        <div class="analytics-grid">
          <div class="panel">
            <h3>Activity over time</h3>
            <div class="timeline">${timeline || '<p class="muted">No data yet.</p>'}</div>
          </div>
          <div class="panel">
            <h3>Events by component</h3>
            <div class="chips">${compChips || '<p class="muted">No data yet.</p>'}</div>
          </div>
        </div>

        <div class="panel">
          <h3>Top event types</h3>
          <div class="hbars">${typeBars || '<p class="muted">No data yet.</p>'}</div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h3>Raw clickstream log <span class="muted">(latest ${eventsData.events.length})</span></h3>
            <span class="muted">Stored in SQLite → <code>data/learnflow.db</code> (<code>events</code> table). Same columns as the reference Moodle export.</span>
          </div>
          <div class="table-scroll">
            <table class="log-table">
              <thead><tr>
                <th>Time</th>${isAdmin ? '<th>User</th>' : ''}<th>Event context</th><th>Component</th>
                <th>Event name</th><th>Description</th><th>Origin</th><th>IP address</th>
              </tr></thead>
              <tbody>${rows || `<tr><td colspan="8" class="muted">No events yet — go interact with a lesson!</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    // Wire the export dropdown (CSV / Excel / JSON). The outside-click / Escape
    // handlers are attached only while the menu is open and removed on close,
    // so re-rendering this screen never leaks document listeners.
    const exportBtn = document.getElementById('exportBtn');
    const dropdown = document.getElementById('exportDropdown');
    if (exportBtn && dropdown) {
      let onOutside = null;
      const closeMenu = () => {
        dropdown.classList.add('hidden');
        exportBtn.setAttribute('aria-expanded', 'false');
        if (onOutside) {
          document.removeEventListener('click', onOutside);
          document.removeEventListener('keydown', onOutside);
          onOutside = null;
        }
      };
      const openMenu = () => {
        dropdown.classList.remove('hidden');
        exportBtn.setAttribute('aria-expanded', 'true');
        onOutside = (ev) => {
          if (ev.type === 'keydown') { if (ev.key === 'Escape') closeMenu(); return; }
          if (!dropdown.contains(ev.target) && ev.target !== exportBtn) closeMenu();
        };
        setTimeout(() => {
          document.addEventListener('click', onOutside);
          document.addEventListener('keydown', onOutside);
        }, 0);
      };
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.contains('hidden') ? openMenu() : closeMenu();
      });
      dropdown.querySelectorAll('button[data-fmt]').forEach((b) =>
        b.addEventListener('click', () => { closeMenu(); downloadExport(b.dataset.fmt); })
      );
    }

    renderTopbar();
  }

  // =============================================================== ROUTER
  const routes = [
    { re: /^#\/login$/, view: renderAuth, auth: false },
    { re: /^#\/dashboard$/, view: renderDashboard, auth: true },
    { re: /^#\/course\/([^/]+)$/, view: renderCourse, auth: true },
    { re: /^#\/lesson\/(\d+)$/, view: renderLesson, auth: true },
    { re: /^#\/analytics$/, view: renderAnalytics, auth: true },
  ];

  function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  async function route() {
    Tracker.markTimeOnPage('route-change');
    Tracker.resetScroll();
    window.scrollTo(0, 0);
    const hash = location.hash || '#/login';

    if (!user && localStorage.getItem('lf_token')) {
      try { user = (await API.me()).user; } catch (_) { setToken(null); }
    }

    const match = routes.find((r) => r.re.test(hash));
    if (!match) { navigate(user ? '#/dashboard' : '#/login'); return; }
    if (match.auth && !user) { navigate('#/login'); return; }
    if (!match.auth && user && hash === '#/login') { navigate('#/dashboard'); return; }

    const params = (hash.match(match.re) || []).slice(1);
    renderTopbar();
    try { await match.view(...params); }
    catch (err) {
      console.error(err);
      if (err.status === 401) { setToken(null); user = null; navigate('#/login'); }
      else renderErrorScreen(err);
    }
    renderTopbar();
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', route);
  route();

  // Handle "Mark as read" (delegated because the button is re-rendered).
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'markRead') {
      Tracker.log({ component: 'Lesson', event_name: 'Lesson marked complete', event_type: 'lesson_complete',
        description: `The user with id '${user ? user.id : '?'}' marked a reading lesson as complete.` });
      e.target.textContent = 'Marked complete ✓';
      e.target.disabled = true;
      toast('Nice — logged as complete!', 'success');
    }
  });
})();
