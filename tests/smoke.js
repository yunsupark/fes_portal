#!/usr/bin/env node
require('dotenv').config();
(async () => {
  const fail = (msg) => { console.error('SMOKE-FAIL:', msg); process.exit(2); };
  const ok = (msg) => console.log('SMOKE-OK:', msg);

  const base = process.env.BACKEND_URL || 'http://localhost:3001';
  try {
    const fetchFn = global.fetch || (await import('node-fetch')).default;

    // helper
    const postJson = async (url, body) => {
      const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      return { ok: r.ok, status: r.status, body: j };
    };

    // login test user 1
    const u1 = 'bstockton@wilsonlogistics.com';
    const res1 = await postJson(`${base}/api/auth/login`, { email: u1 });
    if (!res1.ok || !res1.body || !res1.body.token) fail(`login failed for ${u1}: ${JSON.stringify(res1)}`);
    ok(`login returned token for ${u1}`);
    const token = res1.body.token;

    // protected endpoints
    const headers = { Authorization: `Bearer ${token}` };

    const fetchJson = async (url) => {
      const r = await fetchFn(url, { headers });
      const j = await r.json().catch(() => null);
      return { ok: r.ok, status: r.status, body: j };
    };

    const gen = await fetchJson(`${base}/api/general`);
    if (!gen.ok) fail(`/api/general returned ${gen.status}`);
    ok('/api/general OK');

    const mpg = await fetchJson(`${base}/api/mpg`);
    if (!mpg.ok) fail(`/api/mpg returned ${mpg.status}`);
    ok('/api/mpg OK');

    const tech = await fetchJson(`${base}/api/techs?config=1`);
    if (!tech.ok) fail(`/api/techs returned ${tech.status}`);
    ok('/api/techs OK');
    // structure should include data and categories
    if (!tech.body.data || !tech.body.categories) {
      console.warn('SMOKE-WARN: /api/techs returned unexpected structure', tech.body);
    }
    
    // quick sanity checks
    if (!Object.keys(mpg.body).length) console.warn('SMOKE-WARN: /api/mpg returned empty object');
    if (!tech.body.data || !Object.keys(tech.body.data).length) console.warn('SMOKE-WARN: /api/techs data empty');
    // login second user to ensure auth works for another account
    const u2 = 'jarosinskis@schneider.com';
    const res2 = await postJson(`${base}/api/auth/login`, { email: u2 });
    if (!res2.ok || !res2.body || !res2.body.token) fail(`login failed for ${u2}: ${JSON.stringify(res2)}`);
    ok(`login returned token for ${u2}`);

    console.log('\nSMOKE TESTS PASSED');
    process.exit(0);
  } catch (e) {
    console.error('SMOKE-ERROR:', e && e.message ? e.message : e);
    process.exit(3);
  }
})();
