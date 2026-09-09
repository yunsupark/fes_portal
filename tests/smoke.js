#!/usr/bin/env node
// Smoke tests for the FES portal API.
// Credentials come from environment variables — never hardcoded.
// Required env vars for auth tests: SMOKE_EMAIL, SMOKE_PASSWORD
// Optional: BACKEND_URL (default: http://localhost:3001)
require('dotenv').config();

(async () => {
  const fail = (msg) => { console.error('SMOKE-FAIL:', msg); process.exit(2); };
  const ok   = (msg) => console.log('SMOKE-OK:', msg);
  const warn = (msg) => console.warn('SMOKE-WARN:', msg);

  const base    = process.env.BACKEND_URL || 'http://localhost:3001';
  const email   = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;
  const fetchFn = global.fetch || (await import('node-fetch')).default;

  const postJson = async (url, body) => {
    const r = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, body: j };
  };

  const getJson = async (url, headers = {}) => {
    const r = await fetchFn(url, { headers });
    const j = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, body: j };
  };

  // ── Auth ─────────────────────────────────────────────────────────────────────
  let token = null;
  if (email && password) {
    const res = await postJson(`${base}/api/auth/login`, { email, password });
    if (!res.ok || !res.body?.token) fail(`login failed for ${email}: ${JSON.stringify(res.body)}`);
    ok(`login OK for ${email}`);
    token = res.body.token;
  } else {
    warn('SMOKE_EMAIL / SMOKE_PASSWORD not set — skipping auth tests');
  }

  // ── Authenticated endpoints (skip if no token) ────────────────────────────
  if (token) {
    const authHdr = { Authorization: `Bearer ${token}` };

    const gen = await getJson(`${base}/api/general`, authHdr);
    if (!gen.ok) fail(`/api/general returned ${gen.status}`);
    ok('/api/general OK');

    const mpg = await getJson(`${base}/api/mpg`, authHdr);
    if (!mpg.ok) fail(`/api/mpg returned ${mpg.status}`);
    ok('/api/mpg OK');
    if (!Object.keys(mpg.body || {}).length) warn('/api/mpg returned empty object');

    const tech = await getJson(`${base}/api/techs?config=1`, authHdr);
    if (!tech.ok) fail(`/api/techs returned ${tech.status}`);
    if (!tech.body?.data || !tech.body?.categories) warn('/api/techs returned unexpected structure');
    ok('/api/techs OK');
  }

  // ── Public Explorer endpoint ──────────────────────────────────────────────
  const explorer = await getJson(`${base}/api/public/explorer`);

  if (explorer.status === 404) {
    ok('/api/public/explorer → 404 (no snapshot published yet — expected)');
  } else if (!explorer.ok) {
    fail(`/api/public/explorer returned ${explorer.status}: ${JSON.stringify(explorer.body)}`);
  } else {
    ok('/api/public/explorer returned data');

    // Must never expose fleet identity
    const bodyStr = JSON.stringify(explorer.body);
    if (/"fleet_id"/.test(bodyStr)) fail('/api/public/explorer response contains fleet_id — privacy leak');
    if (/"fleet_name"/.test(bodyStr)) fail('/api/public/explorer response contains fleet_name — privacy leak');
    ok('/api/public/explorer: no fleet_id / fleet_name in payload');

    // Every non-null pct must have a corresponding count ≥ 3
    const MIN_N = 3;
    const rows = explorer.body?.techRows || [];
    let suppressionViolation = false;
    for (const r of rows) {
      if (r.combined_pct != null && (r.n_combined ?? 0) < MIN_N) {
        warn(`suppression violation — combined_pct exposed with n_combined=${r.n_combined} for ${r.technology} ${r.year}`);
        suppressionViolation = true;
      }
      if (r.lh_pct != null && (r.n_lh ?? 0) < MIN_N) {
        warn(`suppression violation — lh_pct exposed with n_lh=${r.n_lh} for ${r.technology} ${r.year}`);
        suppressionViolation = true;
      }
      if (r.rh_pct != null && (r.n_rh ?? 0) < MIN_N) {
        warn(`suppression violation — rh_pct exposed with n_rh=${r.n_rh} for ${r.technology} ${r.year}`);
        suppressionViolation = true;
      }
    }
    const mpgRows = explorer.body?.mpgRows || [];
    for (const r of mpgRows) {
      if (r.combined_mpg != null && (r.n_combined ?? 0) < MIN_N) {
        warn(`suppression violation — combined_mpg exposed with n_combined=${r.n_combined} for ${r.duty_cycle} ${r.year}`);
        suppressionViolation = true;
      }
    }
    if (!suppressionViolation) ok('/api/public/explorer: all cells pass N≥3 suppression check');
  }

  // ── Rate-limit headers present on public routes ──────────────────────────
  const explorerRaw = await fetchFn(`${base}/api/public/explorer`);
  if (!explorerRaw.headers.get('ratelimit-limit') && !explorerRaw.headers.get('x-ratelimit-limit')) {
    warn('/api/public/explorer: no rate-limit header found');
  } else {
    ok('/api/public/explorer: rate-limit header present');
  }

  console.log('\nSMOKE TESTS PASSED');
  process.exit(0);
})().catch(e => {
  console.error('SMOKE-ERROR:', e?.message ?? e);
  process.exit(3);
});
