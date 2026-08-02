/**
 * api.js — thin wrapper around fetch that injects the auth token and
 * unwraps JSON / errors. Exposed as window.API.
 */
(function () {
  function token() {
    return localStorage.getItem('lf_token');
  }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token()) headers.Authorization = 'Bearer ' + token();

    const res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return null;
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      /* non-JSON response */
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  window.API = {
    // auth
    register: (name, email, password) => request('POST', '/api/auth/register', { name, email, password }),
    login: (email, password) => request('POST', '/api/auth/login', { email, password }),
    logout: () => request('POST', '/api/auth/logout'),
    me: () => request('GET', '/api/me'),
    // content
    courses: () => request('GET', '/api/courses'),
    course: (slug) => request('GET', '/api/courses/' + slug),
    lesson: (id) => request('GET', '/api/lessons/' + id),
    // quiz + progress
    submitQuiz: (lessonId, payload) => request('POST', `/api/quiz/${lessonId}/submit`, payload),
    progress: () => request('GET', '/api/progress'),
    // analytics
    analyticsSummary: () => request('GET', '/api/analytics/summary'),
    analyticsEvents: (limit = 100) => request('GET', '/api/analytics/events?limit=' + limit),
    exportUrl: () => '/api/analytics/export.csv',
  };
})();
