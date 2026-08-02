/**
 * tracker.js — the clickstream engine.
 *
 * Responsibilities:
 *   1. Give every browser session a stable session_id.
 *   2. Provide Tracker.log(...) for the app to record semantic events
 *      (lesson viewed, video played, quiz answered, ...).
 *   3. Auto-capture generic interactions: page/route views, clicks,
 *      scroll depth, and time-on-page — with no per-element wiring.
 *   4. Queue events and flush them to POST /api/events in batches
 *      (and reliably on page hide via navigator.sendBeacon).
 *
 * Every event carries the Moodle-style descriptive fields (component,
 * event_name, description) AND machine fields (event_type, target_*),
 * so the same records power both the human-readable log and analytics.
 */
(function () {
  const SESSION_KEY = 'lf_session_id';
  const FLUSH_INTERVAL = 4000; // ms
  const MAX_BATCH = 25;

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = uuid();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }

  const queue = [];
  let context = { event_context: null, target_type: null, target_id: null }; // "current screen"

  function token() {
    return localStorage.getItem('lf_token');
  }

  /** Set the ambient context (called by the router when a screen changes). */
  function setContext(ctx) {
    context = Object.assign({ event_context: null, target_type: null, target_id: null }, ctx || {});
  }

  /**
   * Record an event.
   * @param {object} e - { component, event_name, description, event_type,
   *                        target_type, target_id, url, payload }
   */
  function log(e) {
    const evt = {
      session_id: sessionId,
      time: new Date().toISOString(),
      url: location.hash || location.pathname,
      event_context: e.event_context ?? context.event_context,
      target_type: e.target_type ?? context.target_type,
      target_id: e.target_id ?? context.target_id,
      component: e.component || 'System',
      event_name: e.event_name || 'Interaction',
      description: e.description || '',
      event_type: e.event_type || 'interaction',
      payload: e.payload || null,
    };
    queue.push(evt);
    if (queue.length >= MAX_BATCH) flush();
    // Let the app react (e.g. live-update the analytics page).
    window.dispatchEvent(new CustomEvent('lf:event', { detail: evt }));
    return evt;
  }

  function flush(useBeacon) {
    if (!queue.length) return;
    const batch = queue.splice(0, queue.length);
    const body = JSON.stringify({ events: batch });
    const url = '/api/events';

    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(url, {
      method: 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        token() ? { Authorization: 'Bearer ' + token() } : {}
      ),
      body,
      keepalive: true,
    }).catch(() => {
      // On failure, re-queue so we can retry on the next flush.
      queue.unshift(...batch);
    });
  }

  // ---------------------------------------------------------- auto-capture
  // Global click capture. Any element can add data-track-label / data-track
  // for a friendly name; otherwise we describe it from tag + text.
  document.addEventListener(
    'click',
    (ev) => {
      const el = ev.target.closest('a, button, [data-track], .card, .option, input, label');
      if (!el) return;
      const label =
        el.getAttribute('data-track-label') ||
        el.getAttribute('aria-label') ||
        (el.textContent || '').trim().slice(0, 60) ||
        el.tagName.toLowerCase();
      const tag = el.tagName.toLowerCase();
      log({
        component: 'Interface',
        event_name: 'Element clicked',
        event_type: 'click',
        description: `Clicked ${tag}${label ? ` "${label}"` : ''}.`,
        payload: {
          tag,
          label,
          id: el.id || null,
          classes: el.className || null,
          href: el.getAttribute && el.getAttribute('href'),
        },
      });
    },
    true
  );

  // Scroll depth (25/50/75/100%) — logged once per threshold per page.
  let scrollMarks = new Set();
  function resetScroll() {
    scrollMarks = new Set();
  }
  window.addEventListener(
    'scroll',
    () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) return;
      const pct = Math.round((doc.scrollTop / scrollable) * 100);
      [25, 50, 75, 100].forEach((m) => {
        if (pct >= m && !scrollMarks.has(m)) {
          scrollMarks.add(m);
          log({
            component: 'Interface',
            event_name: 'Page scrolled',
            event_type: 'scroll_depth',
            description: `Scrolled to ${m}% of the page.`,
            payload: { depth: m },
          });
        }
      });
    },
    { passive: true }
  );

  // Time-on-page: measured between route changes and on hide.
  let pageEnter = Date.now();
  function markTimeOnPage(reason) {
    const seconds = Math.round((Date.now() - pageEnter) / 1000);
    if (seconds < 1) return;
    log({
      component: 'Interface',
      event_name: 'Time on page',
      event_type: 'time_on_page',
      description: `Spent ${seconds}s on this screen (${reason}).`,
      payload: { seconds, reason },
    });
    pageEnter = Date.now();
  }

  // Flush + finalise on tab hide / navigation away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      markTimeOnPage('tab-hidden');
      flush(true);
    }
  });
  window.addEventListener('pagehide', () => {
    markTimeOnPage('page-hide');
    flush(true);
  });
  window.addEventListener('beforeunload', () => flush(true));

  // Periodic background flush.
  setInterval(() => flush(false), FLUSH_INTERVAL);

  // Public API
  window.Tracker = {
    sessionId,
    log,
    flush,
    setContext,
    resetScroll,
    markTimeOnPage,
  };
})();
