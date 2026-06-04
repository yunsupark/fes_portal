import React, { useState, useEffect, useRef } from "react";

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

// ─── Utility ──────────────────────────────────────────────────────────────────
const pct = (v) => v == null ? "—" : `${Math.round(v * 100)}%`;
const fmt = (n) => n?.toLocaleString() ?? "—";

function getMpgAlert(mpg, benchmarks, fuelType) {
  if (!mpg || isNaN(mpg) || mpg <= 0) return null;
  const b = benchmarks?.[fuelType];
  if (!b?.avg_mpg) return null;
  if (mpg < b.avg_mpg * 0.25) return 'low';
  if (mpg > b.avg_mpg * 2)    return 'high';
  return null;
}

// ─── Components ───────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [view, setView]           = useState('login'); // 'login' | 'forgot' | 'check-email'
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [err, setErr]             = useState("");
  const [loading, setLoading]     = useState(false);
  // Multi-fleet state: when login returns >1 fleet, show the picker instead of portal
  const [pendingFleets, setPendingFleets] = useState(null);  // array of fleet objects
  const [interimToken,  setInterimToken]  = useState(null);  // short-lived selection token

  const handleLogin = async (e) => {
    e.preventDefault();
    setErr("");
    if (!email || !email.includes("@")) return setErr("Valid email required");
    if (!password) return setErr("Password required");
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error === 'no_password') {
          setErr('No password set for this account. Use "Forgot password?" below to set one.');
        } else {
          setErr(body.error || 'Login failed');
        }
        return;
      }
      if (body.needs_fleet_selection) {
        // Contact belongs to more than one fleet — show the picker
        setPendingFleets(body.fleets);
        setInterimToken(body.interim_token);
        return;
      }
      onLogin(body.token, body.fleet);
    } catch (err) {
      setErr(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleFleetSelect = async (fleet) => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch('/api/auth/select-fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interim_token: interimToken, fleet_id: fleet.fleet_id }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErr(body.error || 'Failed to select fleet. Please sign in again.');
        setPendingFleets(null);
        setInterimToken(null);
        return;
      }
      onLogin(body.token, body.fleet);
    } catch (err) {
      setErr(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setErr("");
    if (!email || !email.includes("@")) return setErr("Valid email required");
    setLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      setView('check-email');
    } catch {
      setErr('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.loginBg}>
      <div style={styles.loginCard}>
        <div style={styles.loginLogo}>
          <img src="/nacfe-logo.png" alt="NACFE" style={styles.loginLogoImg} />
        </div>
        <h1 style={styles.loginTitle}>Fleet Efficiency Study</h1>
        <p style={styles.loginSub}>Fleet Portal</p>

        {/* Fleet picker — shown after login when a contact belongs to multiple fleets */}
        {pendingFleets && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#374151', textAlign: 'center' }}>
              Select which fleet to open:
            </p>
            {pendingFleets.map(f => (
              <button
                key={f.fleet_id}
                onClick={() => handleFleetSelect(f)}
                disabled={loading}
                style={{
                  background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8,
                  padding: '10px 16px', cursor: loading ? 'not-allowed' : 'pointer',
                  textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
                  opacity: loading ? 0.7 : 1,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = '#1c3660'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#D1D5DB'; }}
              >
                <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{f.fleet_name}</span>
                {f.fleet_city && (
                  <span style={{ fontSize: 12, color: '#6B7280' }}>{f.fleet_city}{f.fleet_state ? `, ${f.fleet_state}` : ''}</span>
                )}
              </button>
            ))}
            {err && <p style={styles.errMsg}>{err}</p>}
            <button type="button"
              onClick={() => { setPendingFleets(null); setInterimToken(null); setErr(''); }}
              style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
              ← Back to sign in
            </button>
          </div>
        )}

        {!pendingFleets && view === 'login' && (
          <form onSubmit={handleLogin} style={styles.loginForm}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Email</label>
              <input style={styles.input} type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Password</label>
              <input style={styles.input} type="password" value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {err && <p style={styles.errMsg}>{err}</p>}
            <button style={{...styles.btn, opacity: loading ? 0.7 : 1}} type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
            <button type="button" onClick={() => { setView('forgot'); setErr(''); }}
              style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
              Reset password
            </button>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgot} style={styles.loginForm}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#374151' }}>
              Enter your email and we'll send you a link to set your password.
            </p>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Email</label>
              <input style={styles.input} type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
            </div>
            {err && <p style={styles.errMsg}>{err}</p>}
            <button style={{...styles.btn, opacity: loading ? 0.7 : 1}} type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <button type="button" onClick={() => { setView('login'); setErr(''); }}
              style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
              ← Back to sign in
            </button>
          </form>
        )}

        {view === 'check-email' && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <p style={{ fontSize: 14, color: '#fff', lineHeight: 1.65, marginBottom: 16 }}>
              If <strong>{email}</strong> is registered, you'll receive a password reset link shortly.
              Check your inbox (and spam folder).
            </p>
            <button type="button" onClick={() => { setView('login'); setErr(''); }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              ← Back to sign in
            </button>
          </div>
        )}

        <p style={styles.loginFooter}>
          Need access? Contact <a href="mailto:yunsu.park@nacfe.org" style={styles.link}>yunsu.park@nacfe.org</a>
        </p>
      </div>
    </div>
  );
}


function ResetPasswordScreen({ token, onDone }) {
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [err, setErr]             = useState('');
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) return setErr('Password must be at least 8 characters');
    if (password !== confirm) return setErr('Passwords do not match');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json();
      if (!res.ok) return setErr(body.error || 'Failed to set password');
      setSuccess(true);
    } catch {
      setErr('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.loginBg}>
      <div style={styles.loginCard}>
        <div style={styles.loginLogo}>
          <img src="/nacfe-logo.png" alt="NACFE" style={styles.loginLogoImg} />
        </div>
        <h1 style={styles.loginTitle}>Fleet Efficiency Study</h1>
        <p style={styles.loginSub}>Set your password</p>
        {success ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <p style={{ fontSize: 14, color: '#15803D', fontWeight: 600, marginBottom: 12 }}>Password set successfully!</p>
            <button onClick={onDone} style={styles.btn}>Sign in →</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.loginForm}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>New password</label>
              <input style={styles.input} type="password" value={password}
                onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoFocus />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Confirm password</label>
              <input style={styles.input} type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)} placeholder="••••••••" />
            </div>
            {err && <p style={styles.errMsg}>{err}</p>}
            <button style={{...styles.btn, opacity: loading ? 0.7 : 1}} type="submit" disabled={loading}>
              {loading ? 'Setting password…' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function MpgChart({ chartData: cd = {}, fleetName }) {
  const {
    ownMpg = {}, peerMpg = {},
    sleeperAdoption = {}, dayCabAdoption = {},
    peerSleeperAdoption = {}, peerDayCabAdoption = {},
    dutyCycle = null,
  } = cd;

  const hasSleeper = Object.keys(sleeperAdoption).length > 0;
  const hasDayCab  = Object.keys(dayCabAdoption).length > 0;
  // Show peer adoption bars only for the cab type relevant to this fleet's duty cycle.
  // LH fleets benchmark against sleeper-cab peers; RH against day-cab peers.
  // If duty cycle is unknown, show whichever peer data exists.
  const showPeerSleeper = hasSleeper && (dutyCycle === 'LH' || (!dutyCycle && Object.keys(peerSleeperAdoption).length > 0));
  const showPeerDayCab  = hasDayCab  && (dutyCycle === 'RH' || (!dutyCycle && Object.keys(peerDayCabAdoption).length  > 0));

  const allYears = [...new Set([
    ...Object.keys(ownMpg), ...Object.keys(peerMpg),
    ...Object.keys(sleeperAdoption), ...Object.keys(dayCabAdoption),
  ].map(Number))].sort((a, b) => a - b);
  const displayYears = allYears.slice(-8);

  const data = displayYears.map(y => ({
    year: String(y),
    mpg:                ownMpg[y]               ?? null,
    peerMpg:            peerMpg[y]              ?? null,
    sleeperAdoption:    sleeperAdoption[y]       ?? null,
    dayCabAdoption:     dayCabAdoption[y]        ?? null,
    peerSleeperAdoption: peerSleeperAdoption[y]  ?? null,
    peerDayCabAdoption:  peerDayCabAdoption[y]   ?? null,
  }));

  const fmtPct = v => `${Math.round(v)}%`;
  const dcLabel = dutyCycle === 'LH' ? 'LH' : dutyCycle === 'RH' ? 'RH' : 'Peer';
  const peerLabel = `${dcLabel} Avg MPG`;
  const ownLabel  = fleetName ? `${fleetName} MPG` : 'Fleet MPG';
  const nameMap = {
    mpg:                 ownLabel,
    peerMpg:             peerLabel,
    sleeperAdoption:     'Sleeper adoption',
    dayCabAdoption:      'Day Cab adoption',
    peerSleeperAdoption: `${dcLabel} Avg Sleeper adopt.`,
    peerDayCabAdoption:  `${dcLabel} Avg Day Cab adopt.`,
  };

  return (
    <div style={styles.chartCard}>
      <h3 style={styles.chartTitle}>IFTA MPG & Tech Adoption</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{top:8, right:32, left:0, bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="year" stroke="#9CA3AF" tick={{fontSize:12}} />
          <YAxis yAxisId="left" stroke="#9CA3AF" tick={{fontSize:11}} />
          <YAxis yAxisId="right" orientation="right" domain={[0,100]} stroke="#9CA3AF" tickFormatter={fmtPct} tick={{fontSize:11}} />
          <Tooltip
            contentStyle={styles.tooltipStyle}
            labelStyle={{color:"#111827"}}
            formatter={(v, key) => [
              key.includes('doption') ? fmtPct(v) : v,
              nameMap[key] || key,
            ]}
          />
          <Legend formatter={key => nameMap[key] || key} wrapperStyle={{fontSize:10}} />
          <Line yAxisId="left"  dataKey="mpg"     name="mpg"     type="monotone" stroke="#A41C24" strokeWidth={2} dot={{r:3}} connectNulls />
          <Line yAxisId="left"  dataKey="peerMpg" name="peerMpg" type="monotone" stroke="#757373" strokeWidth={2} strokeDasharray="5 3" dot={{r:3}} connectNulls />
          {hasSleeper     && <Bar yAxisId="right" dataKey="sleeperAdoption"     name="sleeperAdoption"     fill="#3B82F6" />}
          {hasDayCab      && <Bar yAxisId="right" dataKey="dayCabAdoption"      name="dayCabAdoption"      fill="#10B981" />}
          {showPeerSleeper && <Bar yAxisId="right" dataKey="peerSleeperAdoption" name="peerSleeperAdoption" fill="#93C5FD" />}
          {showPeerDayCab  && <Bar yAxisId="right" dataKey="peerDayCabAdoption"  name="peerDayCabAdoption"  fill="#6EE7B7" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Interview Mode ───────────────────────────────────────────────────────────

function computeInterviewYears(pct, startYear, ramp, allYears) {
  if (pct === '' || pct == null) return Object.fromEntries(allYears.map(y => [y, '']));
  const maxYear = Math.max(...allYears);
  const numPct = Number(pct);
  const result = {};
  for (const yr of allYears) {
    if (yr < startYear) {
      result[yr] = '0';
    } else if (yr >= maxYear) {
      result[yr] = String(numPct);
    } else {
      const n = maxYear - startYear + 1;
      const p = yr - startYear;
      let fraction;
      if (n <= 1) fraction = 1;
      else if (ramp === 'quick') fraction = Math.pow((p + 1) / n, 0.3);
      else if (ramp === 'slow')  fraction = Math.pow((p + 1) / n, 2.5);
      else                        fraction = (p + 1) / n;
      result[yr] = String(Math.round(numPct * Math.min(fraction, 1)));
    }
  }
  return result;
}

function InterviewModal({ token, effectiveEditableYears, savedProgress, interviewInputsByCAB, onComplete, onSaveAndExit, onClose }) {
  const maxYear = Math.max(...effectiveEditableYears);
  const sortedYears = [...effectiveEditableYears].sort((a, b) => a - b);

  const hasResumable = savedProgress && savedProgress.step !== 'intro';
  const [step, setStep]               = useState(hasResumable ? 'resume-prompt' : 'intro');
  const [cabType, setCabType]         = useState(savedProgress?.cabType || 'Sleeper');
  const [categories, setCategories]   = useState({});
  const [groupInputs, setGroupInputs] = useState(savedProgress?.groupInputs || {});
  const [groupEdits, setGroupEdits]   = useState(savedProgress?.groupEdits || {});
  const [confirmExit, setConfirmExit] = useState(null);
  const [autoZero, setAutoZero]       = useState(savedProgress?.autoZero ?? false);
  const [reviewZeroAsked, setReviewZeroAsked] = useState(savedProgress?.reviewZeroAsked || {});
  const [isSecondCab, setIsSecondCab] = useState(savedProgress?.isSecondCab ?? false);
  const [fuelBenchmarks, setFuelBenchmarks] = useState({});
  const [categoriesCabType, setCategoriesCabType] = useState(null);
  const [pendingCabSwitch, setPendingCabSwitch] = useState(null); // { inputs, targetStep }
  const [fuelMissingYears, setFuelMissingYears] = useState([]);
  const pctRefs = useRef([]);

  // ── Equipment steps state ──────────────────────────────────────────
  // utilEdits: { year: [ {application, tractors, trailers, grossed_out_pct, cubed_out_pct, ave_length_haul, empty_miles_pct} ] }
  // equipEdits: { year: [ EMPTY_EQUIP_ROW ] }
  const equipYears = sortedYears.slice(-2); // at most last 2 editable years
  const [utilEdits,  setUtilEdits]  = useState(() => {
    if (savedProgress?.utilEdits) return savedProgress.utilEdits;
    const init = {};
    equipYears.forEach(yr => { init[yr] = [EMPTY_UTIL_ROW()]; });
    return init;
  });
  const [equipEdits, setEquipEdits] = useState(() => {
    if (savedProgress?.equipEdits) return savedProgress.equipEdits;
    const init = {};
    equipYears.forEach(yr => { init[yr] = [EMPTY_EQUIP_ROW()]; });
    return init;
  });
  const [equipYear,  setEquipYear]  = useState(savedProgress?.equipYear ?? equipYears[equipYears.length - 1] ?? maxYear);
  const [makeModels,   setMakeModels]   = useState([]);
  const [engineModels, setEngineModels] = useState([]);
  const ENGINE_MAKE_LIMITS_LOCAL = {
    'Freightliner': ['Detroit', 'Cummins'],
    'Kenworth':     ['Paccar', 'Cummins'],
    'Peterbilt':    ['Paccar', 'Cummins'],
    'Volvo':        ['Volvo', 'Cummins'],
    'International':['International', 'Cummins'],
    'Tesla':        null,
    'Rivian':       null,
  };

  useEffect(() => {
    if (!token) return;
    fetch('/api/fleet-equip/reference', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : {})
      .then(d => { setMakeModels(d.makeModels || []); setEngineModels(d.engineModels || []); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/fuel/benchmarks', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : {}).then(b => setFuelBenchmarks(b)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/techs?cab_type=${encodeURIComponent(cabType)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(t => {
      setCategories(t.categories || {});
      setCategoriesCabType(cabType);
    }).catch(() => {});
  }, [cabType, token]);

  const getVisibleTechs = (groupName) =>
    (categories[groupName] || []).filter(t => {
      const cabOk = cabType === 'Day Cab'
        ? (t.applies_daycab == null || t.applies_daycab !== 0)
        : (t.applies_sleeper == null || t.applies_sleeper !== 0);
      return cabOk && t.active_to == null;
    });

  const visibleGroups = Object.keys(categories).filter(g => getVisibleTechs(g).length > 0);

  // Apply a pending cab-type switch once the new cab's categories have loaded
  useEffect(() => {
    if (!pendingCabSwitch) return;
    if (categoriesCabType !== cabType) return; // categories not yet refreshed for new cab
    if (visibleGroups.length === 0) return;
    const { inputs, targetStep } = pendingCabSwitch;
    if (inputs) {
      const carried = {};
      for (const [grp, techInputs] of Object.entries(inputs)) {
        const applicable = getVisibleTechs(grp);
        const groupCarry = {};
        for (const tech of applicable) {
          if (techInputs[tech.label]) groupCarry[tech.label] = { ...techInputs[tech.label] };
        }
        if (Object.keys(groupCarry).length > 0) carried[grp] = groupCarry;
      }
      setGroupInputs(carried);
      const newEdits = {};
      for (const grp of Object.keys(carried)) {
        newEdits[grp] = computeGroupEditsFromInputs(grp, carried[grp] || {});
      }
      setGroupEdits(newEdits);
    } else {
      setGroupInputs({});
      setGroupEdits({});
    }
    setStep({ group: visibleGroups[0], phase: targetStep });
    setPendingCabSwitch(null);
  }, [categories, pendingCabSwitch]); // eslint-disable-line

  const computeGroupEditsFromInputs = (groupName, inputs) => {
    const techs = getVisibleTechs(groupName);
    const result = Object.fromEntries(sortedYears.map(yr => [yr, {}]));
    for (const tech of techs) {
      const inp = (inputs || {})[tech.label] || {};
      const startYear = Number(inp.startYear) || maxYear;
      const ramp = inp.ramp || 'steady';
      const yearVals = computeInterviewYears(inp.pct ?? '', startYear, ramp, sortedYears);
      for (const yr of sortedYears) result[yr][tech.label] = yearVals[yr];
    }
    return result;
  };

  const currentGroupIdx = typeof step === 'object' ? visibleGroups.indexOf(step.group) : -1;
  const totalGroups = visibleGroups.length;
  const progressPct =
    step === 'interview-complete' ? 100
    : step === 'final-review'     ? 95
    : step === 'fleet-equip'      ? 88
    : step === 'equip-util'       ? 82
    : step === 'equip-intro'      ? 78
    : step === 'fuel-done'        ? 75
    : step === 'fuel-entry'       ? 68
    : step === 'fuel-setup'       ? 62
    : step === 'done'                  ? 58
    : step === 'second-cab-prompt'     ? 58
    : step === 'second-cab-carryover'  ? 58
    : typeof step === 'object'
      ? Math.round(((currentGroupIdx + (step.phase === 'review' ? 0.5 : 0)) / totalGroups) * 55)
      : 0;

  const mergeGroupEdits = (editsMap) => {
    const merged = Object.fromEntries(sortedYears.map(yr => [yr, {}]));
    for (const g of visibleGroups) {
      const ge = editsMap[g] || {};
      for (const yr of sortedYears) Object.assign(merged[yr], ge[yr] || {});
    }
    return merged;
  };

  const buildFuelRowsFromEdits = (editsMap, inputsMap) => {
    const fuelState = inputsMap['__fuel__'] || {};
    const selectedTypes = fuelState.fuelTypes || [];
    const firstYear = fuelState.firstYear || maxYear;
    const fuelYears = sortedYears.filter(y => y >= firstYear);
    const fuelEdits = editsMap['__fuel__'] || {};
    const rows = [];
    for (const yr of fuelYears) {
      for (const ft of selectedTypes) {
        const miles = (fuelEdits[yr] || {})[`${ft}__miles`] ?? '';
        const vol   = (fuelEdits[yr] || {})[`${ft}__vol`]   ?? '';
        if (miles !== '' || vol !== '') {
          rows.push({ year: yr, fuel_type: ft, ifta_miles: miles !== '' ? miles : null, volume: vol !== '' ? vol : null });
        }
      }
    }
    return rows;
  };

  // Whether there's any meaningful progress to save (past intro)
  const hasProgress = typeof step === 'object' || step === 'done' ||
    step === 'second-cab-prompt' || step === 'second-cab-carryover' ||
    step === 'fuel-setup' || step === 'fuel-entry' || step === 'fuel-done' ||
    step === 'equip-intro' || step === 'equip-util' || step === 'fleet-equip' ||
    step === 'final-review' || step === 'interview-complete';

  const handleCloseRequest = () => {
    if (!hasProgress || step === 'intro' || step === 'resume-prompt') {
      onClose();
    } else {
      setConfirmExit('ask');
    }
  };

  const handleSaveAndExit = () => {
    const progressState = { step, cabType, groupInputs, groupEdits, autoZero, reviewZeroAsked, isSecondCab, utilEdits, equipEdits, equipYear };
    const fuelRows = buildFuelRowsFromEdits(groupEdits, groupInputs);
    onSaveAndExit(cabType, mergeGroupEdits(groupEdits), progressState, fuelRows, utilEdits, equipEdits);
  };

  // Build finalized tech+fuel edits (applying zeros), used by both complete paths
  const buildFinalTechFuel = () => {
    let finalInputs = groupInputs;
    let finalEdits  = groupEdits;
    for (const grp of visibleGroups) {
      const declined = !autoZero && reviewZeroAsked[grp] === false;
      if (!declined) {
        finalInputs = applyZeroToGroup(grp, finalInputs);
        finalEdits  = applyZeroToGroupEdits(grp, finalInputs, finalEdits);
      }
    }
    // Clear values for years before the fleet's data start year (fuel firstYear)
    const fleetFirstYear = Number((finalInputs['__fuel__'] || {}).firstYear || 0);
    if (fleetFirstYear) {
      finalEdits = Object.fromEntries(
        Object.entries(finalEdits).map(([grp, yearMap]) => [
          grp,
          Object.fromEntries(
            Object.entries(yearMap || {}).map(([yr, techs]) => [
              yr,
              Number(yr) < fleetFirstYear
                ? Object.fromEntries(Object.keys(techs).map(k => [k, '']))
                : techs,
            ])
          ),
        ])
      );
    }
    return { finalInputs, finalEdits };
  };

  // Build util/equip payloads for saving
  const buildUtilRows = (yr) => {
    const pctRatio = s => s !== '' && s != null ? parseFloat(s) / 100 : null;
    return (utilEdits[yr] || []).filter(r => r.application).map(r => ({
      application:      r.application,
      tractors:         r.tractors         !== '' ? parseInt(r.tractors)         : null,
      trailers:         r.trailers          !== '' ? parseInt(r.trailers)          : null,
      grossed_out_perc: pctRatio(r.grossed_out_pct),
      cubed_out_perc:   pctRatio(r.cubed_out_pct),
      ave_length_haul:  r.ave_length_haul  !== '' ? parseInt(r.ave_length_haul)  : null,
      empty_miles_perc: pctRatio(r.empty_miles_pct),
    }));
  };

  const buildEquipRows = (yr) =>
    (equipEdits[yr] || []).filter(r => r.qty || r.tractor_make || r.cab_type);

  // Returns a copy of groupInputs for `groupName` with blanks zeroed
  const applyZeroToGroup = (groupName, inputs) => {
    const techs = getVisibleTechs(groupName);
    const existing = inputs[groupName] || {};
    const updated = { ...existing };
    for (const tech of techs) {
      const inp = existing[tech.label];
      if (!inp || inp.pct === '' || inp.pct == null) {
        updated[tech.label] = { startYear: maxYear, ramp: 'steady', ...(existing[tech.label] || {}), pct: '0' };
      }
    }
    return { ...inputs, [groupName]: updated };
  };

  // Fill zeros into computed groupEdits for all-blank tech values
  const applyZeroToGroupEdits = (groupName, inputs, editsMap) => {
    const fleetFirstYear = Number((inputs['__fuel__'] || {}).firstYear || 0);
    const techs = getVisibleTechs(groupName);
    const ge = { ...(editsMap[groupName] || {}) };
    for (const yr of sortedYears) {
      ge[yr] = { ...(ge[yr] || {}) };
      if (fleetFirstYear && Number(yr) < fleetFirstYear) {
        for (const tech of techs) ge[yr][tech.label] = '';
        continue;
      }
      for (const tech of techs) {
        const inp = (inputs[groupName] || {})[tech.label];
        if (!inp || inp.pct === '' || inp.pct == null) {
          if (ge[yr][tech.label] === '' || ge[yr][tech.label] == null) ge[yr][tech.label] = '0';
        }
      }
    }
    return { ...editsMap, [groupName]: ge };
  };

  const overlay  = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' };
  const card     = { background: '#fff', borderRadius: 14, padding: '28px 32px', maxWidth: 780, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 18 };
  const bPrim    = { background: '#1c3660', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' };
  const bGhost   = { background: '#fff', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 7, padding: '9px 18px', fontSize: 14, cursor: 'pointer' };
  const bDanger  = { background: '#fff', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 7, padding: '9px 18px', fontSize: 14, cursor: 'pointer' };
  const h2style  = { fontSize: 19, fontWeight: 700, color: '#1c3660', margin: 0 };

  const ProgressBar = ({ label }) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
        <span>{label}</span><span>{progressPct}%</span>
      </div>
      <div style={{ height: 4, background: '#E5E7EB', borderRadius: 2 }}>
        <div style={{ height: 4, background: '#1c3660', borderRadius: 2, width: `${progressPct}%`, transition: 'width 0.3s' }} />
      </div>
    </div>
  );

  const CloseBtn = () => (
    <button onClick={handleCloseRequest} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1, padding: 0 }}>×</button>
  );

  // ── Exit confirmation overlay ────────────────────────────────────
  const ExitConfirm = () => {
    if (!confirmExit) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', maxWidth: 400, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {confirmExit === 'ask' ? (
            <>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Save your progress?</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
                Your answers so far will be filled into the adoption table. You can resume the interview later to complete the remaining groups.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={handleSaveAndExit} style={bPrim}>Save progress & exit</button>
                <button onClick={() => setConfirmExit('sure')} style={bDanger}>Exit without saving</button>
                <button onClick={() => setConfirmExit(null)} style={bGhost}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Are you sure?</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
                All interview progress will be lost and the adoption table will not be updated.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmExit(null)} style={bGhost}>Cancel</button>
                <button onClick={onClose} style={bDanger}>Yes, discard</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Resume prompt ────────────────────────────────────────────────
  if (step === 'resume-prompt') {
    const savedStep = savedProgress.step;
    const groupLabel = typeof savedStep === 'object'
      ? `${savedStep.group} (${savedStep.phase === 'review' ? 'reviewing' : 'entering data'})`
      : savedStep === 'done' ? 'final review' : '';
    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Technology Adoption Interview</h2>
            <CloseBtn />
          </div>
          <div style={{ background: '#F0F7FF', borderRadius: 8, padding: '16px 18px', fontSize: 13, color: '#374151' }}>
            <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#1c3660' }}>You have a saved interview in progress.</p>
            {groupLabel && <p style={{ margin: 0, color: '#6B7280' }}>Last position: <strong>{groupLabel}</strong> · Cab type: <strong>{savedProgress.cabType}</strong></p>}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => {
              setStep(savedProgress.step);
              setCabType(savedProgress.cabType);
              setGroupInputs(savedProgress.groupInputs);
              setGroupEdits(savedProgress.groupEdits);
            }} style={{ ...bPrim, flex: 1 }}>Pick up where I left off</button>
            <button onClick={() => {
              setStep('intro');
              setCabType('Sleeper');
              setGroupInputs({});
              setGroupEdits({});
            }} style={{ ...bGhost, flex: 1 }}>Start over</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Intro + cab type ──────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={h2style}>Fleet Efficiency Study New Fleet Interview</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>We will start with the technology adoption section.</p>
            </div>
            <CloseBtn />
          </div>
          <ProgressBar label="Introduction" />
          <div style={{ background: '#F0F7FF', borderRadius: 8, padding: '14px 18px', fontSize: 13, color: '#374151', lineHeight: 1.65 }}>
            <p style={{ margin: '0 0 10px', fontWeight: 700, color: '#1c3660' }}>What does adoption percent mean?</p>
            <p style={{ margin: '0 0 10px' }}>
              The percent of trucks or trailers <strong>purchased in the year</strong> that were equipped with the technology.
              For example, if filling out the technology adoption for sleeper cabs and 100 sleeper tractors were purchased in {maxYear} and 50 were equipped with full side skirts, the adoption percent is <strong>50%</strong> — regardless of how many other tractors already exist in the fleet with full side skirts.
            </p>
            <p style={{ margin: 0, color: '#6B7280', fontSize: 12 }}>
              For <strong>Practices</strong>, the percentage applies to the whole fleet of the cab type.
            </p>
          </div>
          <div>
            <p style={{ margin: '0 0 12px', fontWeight: 600, color: '#111827', fontSize: 14 }}>
              Which cab type represents the greatest proportion of your fleet?
            </p>
            <div style={{ display: 'flex', gap: 14 }}>
              {['Sleeper', 'Day Cab'].map(ct => (
                <button key={ct} onClick={() => setCabType(ct)} style={{
                  flex: 1, padding: '14px 20px', borderRadius: 10, border: '2px solid',
                  borderColor: cabType === ct ? '#1c3660' : '#D1D5DB',
                  background:  cabType === ct ? '#EFF6FF' : '#fff',
                  color:       cabType === ct ? '#1c3660' : '#374151',
                  fontSize: 15, fontWeight: cabType === ct ? 700 : 400, cursor: 'pointer',
                }}>{ct}</button>
              ))}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: autoZero ? '#F0FDF4' : '#FAFAFA' }}>
            <input
              type="checkbox"
              checked={autoZero}
              onChange={e => setAutoZero(e.target.checked)}
              style={{ marginTop: 2, accentColor: '#1c3660', width: 16, height: 16, flexShrink: 0 }}
            />
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Auto-fill 0% for skipped technologies</span>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>
                When checked, any technology you skip will automatically be recorded as 0% adoption. Leave unchecked if you prefer to decide at review time.
              </p>
            </div>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={onClose} style={bGhost}>Cancel</button>
            <button onClick={() => {
              if (!visibleGroups.length) return;
              const otherCab = cabType === 'Day Cab' ? 'Sleeper' : 'Day Cab';
              const otherInputs = interviewInputsByCAB?.[otherCab];
              const hasOtherInputs = otherInputs && Object.keys(otherInputs).length > 0;
              if (hasOtherInputs) setStep('carryover-prompt');
              else setStep({ group: visibleGroups[0], phase: 'input' });
            }} style={{ ...bPrim, opacity: visibleGroups.length > 0 ? 1 : 0.5 }}>
              Start →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Carry-over prompt ─────────────────────────────────────────────
  if (step === 'carryover-prompt') {
    const otherCab = cabType === 'Day Cab' ? 'Sleeper' : 'Day Cab';
    const otherInputs = interviewInputsByCAB?.[otherCab] || {};

    const applyCarryover = () => {
      // Pre-populate groupInputs from the other cab's answers, filtered to techs applicable to this cab
      setGroupInputs(() => {
        const carried = {};
        for (const [groupName, techInputs] of Object.entries(otherInputs)) {
          const applicableTechs = getVisibleTechs(groupName);
          const groupCarry = {};
          for (const tech of applicableTechs) {
            if (techInputs[tech.label]) groupCarry[tech.label] = { ...techInputs[tech.label] };
          }
          if (Object.keys(groupCarry).length > 0) carried[groupName] = groupCarry;
        }
        return carried;
      });
      setStep({ group: visibleGroups[0], phase: 'input' });
    };

    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Technology Adoption Interview</h2>
            <CloseBtn />
          </div>
          <ProgressBar label="Introduction" />
          <div style={{ background: '#F0F7FF', borderRadius: 8, padding: '16px 18px', fontSize: 13, color: '#374151' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#1c3660' }}>
              You already answered questions for {otherCab} trucks.
            </p>
            <p style={{ margin: 0, color: '#6B7280' }}>
              Would you like to pre-fill your {cabType} answers using your {otherCab} responses for technologies that apply to both cab types? You can still review and change each answer.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={applyCarryover} style={{ ...bPrim, flex: 1 }}>Yes, carry over answers</button>
            <button onClick={() => { setGroupInputs({}); setStep({ group: visibleGroups[0], phase: 'input' }); }} style={{ ...bGhost, flex: 1 }}>No, start fresh</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Group input ───────────────────────────────────────────────────
  if (typeof step === 'object' && step.phase === 'input') {
    const groupName = step.group;
    const techs = getVisibleTechs(groupName);
    const inputs = groupInputs[groupName] || {};
    const isPractices = groupName === 'Practices';

    const setInput = (techLabel, field, val) =>
      setGroupInputs(prev => ({
        ...prev,
        [groupName]: {
          ...(prev[groupName] || {}),
          [techLabel]: { startYear: maxYear, ramp: 'steady', ...(prev[groupName]?.[techLabel] || {}), [field]: val },
        },
      }));

    const handleBack = () =>
      currentGroupIdx === 0
        ? setStep('intro')
        : setStep({ group: visibleGroups[currentGroupIdx - 1], phase: 'review' });

    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>{groupName}</h2>
            <CloseBtn />
          </div>
          <ProgressBar label={`Group ${currentGroupIdx + 1} of ${totalGroups}: ${groupName}`} />
          {isPractices && (
            <p style={{ margin: 0, fontSize: 12, color: '#92400E', background: '#FFF7ED', borderRadius: 6, padding: '8px 12px' }}>
              For Practices, the percentage applies to the whole fleet of the cab type — not just newly purchased trucks.
            </p>
          )}
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            {isPractices
              ? `Enter the fleet-wide % of ${cabType.toLowerCase()} trucks with each practice, when your fleet first started, and how quickly adoption ramped up.`
              : `Enter the % of ${cabType.toLowerCase()} trucks purchased in ${maxYear} with the technology, the year your fleet first started buying that technology on ${cabType.toLowerCase()} trucks, and how quickly adoption ramped up.`}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F3F4F6' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#374151', fontWeight: 600, minWidth: 200 }}>Technology</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: '#374151', fontWeight: 600, minWidth: 85 }}>% in {maxYear}</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: '#374151', fontWeight: 600, minWidth: 130 }}>Year First Purchased</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: '#374151', fontWeight: 600, minWidth: 170 }}>Adoption Trend</th>
                </tr>
              </thead>
              <tbody>
                {techs.map((tech, i) => {
                  const inp = inputs[tech.label] || {};
                  const isZero = inp.pct === '0';
                  const hasPct = inp.pct !== '' && inp.pct != null;
                  const singleYear = Number(inp.startYear || maxYear) >= maxYear;
                  const yearRampDisabled = !hasPct || isZero;
                  return (
                    <tr key={tech.label} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '9px 12px', color: '#111827' }} title={tech.desc}>{tech.label}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                          <input
                            ref={el => pctRefs.current[i] = el}
                            type="number" min="0" max="100"
                            value={inp.pct ?? ''}
                            onChange={e => {
                              let val = e.target.value;
                              if (val !== '' && val !== '-') {
                                const n = Number(val);
                                if (n < 0) val = '0';
                                else if (n > 100) val = '100';
                              }
                              setInput(tech.label, 'pct', val);
                              if (val === '0' && i + 1 < techs.length) {
                                setTimeout(() => pctRefs.current[i + 1]?.focus(), 0);
                              }
                            }}
                            placeholder="—"
                            style={{ width: 50, padding: '4px 6px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 13, textAlign: 'center' }}
                          />
                          <span style={{ fontSize: 12, color: '#6B7280' }}>%</span>
                        </div>
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                        <select value={inp.startYear ?? maxYear} onChange={e => setInput(tech.label, 'startYear', e.target.value)} disabled={yearRampDisabled}
                          style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 13, opacity: yearRampDisabled ? 0.25 : 1 }}>
                          {sortedYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                        <select value={inp.ramp ?? 'steady'} onChange={e => setInput(tech.label, 'ramp', e.target.value)} disabled={yearRampDisabled || singleYear}
                          style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 13, opacity: (yearRampDisabled || singleYear) ? 0.25 : 1 }}>
                          <option value="steady">Increasing steadily</option>
                          <option value="quick">Adopted quickly</option>
                          <option value="slow">Adopting slowly</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={handleBack} style={bGhost}>← Back</button>
            <button onClick={() => {
              const allInputs = autoZero ? applyZeroToGroup(groupName, groupInputs) : groupInputs;
              if (autoZero) setGroupInputs(allInputs);
              const computed = computeGroupEditsFromInputs(groupName, allInputs[groupName] || {});
              setGroupEdits(prev => ({ ...prev, [groupName]: computed }));
              setStep({ group: groupName, phase: 'review' });
            }} style={bPrim}>Review →</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Group review ──────────────────────────────────────────────────
  if (typeof step === 'object' && step.phase === 'review') {
    const groupName = step.group;
    const techs = getVisibleTechs(groupName);
    const reviewData = groupEdits[groupName] || {};

    const minStart = techs.reduce((min, tech) => {
      const inp = groupInputs[groupName]?.[tech.label];
      if (!inp?.pct && inp?.pct !== 0) return min;
      return Math.min(min, Number(inp.startYear || maxYear));
    }, maxYear);
    const displayYears = sortedYears.filter(y => y >= Math.min(minStart, maxYear - 4));

    const setReviewCell = (yr, techLabel, val) =>
      setGroupEdits(prev => ({
        ...prev,
        [groupName]: { ...(prev[groupName] || {}), [yr]: { ...(prev[groupName]?.[yr] || {}), [techLabel]: val } },
      }));

    const isLast = currentGroupIdx + 1 >= totalGroups;

    // Determine if there are skipped techs (no pct entered) for this group
    const skippedTechs = !autoZero ? techs.filter(tech => {
      const inp = groupInputs[groupName]?.[tech.label];
      return !inp || inp.pct === '' || inp.pct == null;
    }) : [];
    const showZeroPrompt = !autoZero && skippedTechs.length > 0 && !(groupName in reviewZeroAsked);

    const handleAdvance = () => {
      // If prompt was shown and user hasn't answered yet, treat as "no" (don't zero)
      // but we still record it as declined so we don't keep asking
      if (showZeroPrompt) {
        setReviewZeroAsked(prev => ({ ...prev, [groupName]: false }));
      }
      if (isLast) setStep(isSecondCab ? 'done' : 'second-cab-prompt');
      else setStep({ group: visibleGroups[currentGroupIdx + 1], phase: 'input' });
    };

    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Review: {groupName}</h2>
            <CloseBtn />
          </div>
          <ProgressBar label={`Group ${currentGroupIdx + 1} of ${totalGroups}: ${groupName}`} />
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            Projected adoption percentages based on your inputs. Adjust any values before continuing.
          </p>
          {showZeroPrompt && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
              <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#92400E' }}>
                {skippedTechs.length} technology{skippedTechs.length !== 1 ? ' values were' : ' value was'} skipped in this group.
                Would you like to record them as <strong>0%</strong> adoption?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => {
                  const zeroed = applyZeroToGroup(groupName, groupInputs);
                  setGroupInputs(zeroed);
                  const computed = computeGroupEditsFromInputs(groupName, zeroed[groupName] || {});
                  setGroupEdits(prev => ({ ...prev, [groupName]: computed }));
                  setReviewZeroAsked(prev => ({ ...prev, [groupName]: true }));
                }} style={{ ...bPrim, padding: '6px 14px', fontSize: 12 }}>Yes, fill 0%</button>
                <button onClick={() => setReviewZeroAsked(prev => ({ ...prev, [groupName]: false }))}
                  style={{ ...bGhost, padding: '6px 14px', fontSize: 12 }}>No, leave blank</button>
              </div>
            </div>
          )}
          {!autoZero && !showZeroPrompt && (groupName in reviewZeroAsked) && reviewZeroAsked[groupName] === false && skippedTechs.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: '#6B7280', fontStyle: 'italic' }}>
              Skipped technologies will be recorded as 0% when the interview is submitted.
            </p>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F3F4F6' }}>
                  <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', minWidth: 200, position: 'sticky', left: 0, background: '#F3F4F6', zIndex: 1 }}>Technology</th>
                  {displayYears.map(y => (
                    <th key={y} style={{ padding: '7px 10px', textAlign: 'center', fontWeight: y === maxYear ? 700 : 500, color: y === maxYear ? '#1c3660' : '#6B7280', minWidth: 62 }}>{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {techs.map((tech, i) => {
                  const rowBg = i % 2 === 0 ? '#fff' : '#FAFAFA';
                  return (
                    <tr key={tech.label} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '6px 12px', color: '#111827', position: 'sticky', left: 0, background: rowBg, zIndex: 1 }} title={tech.desc}>{tech.label}</td>
                      {displayYears.map(yr => {
                        const val = (reviewData[yr] || {})[tech.label];
                        return (
                          <td key={yr} style={{ padding: '3px 5px', textAlign: 'center', background: yr === maxYear ? '#EFF6FF' : rowBg }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                              <input type="number" min="0" max="100" value={val ?? ''} onChange={e => setReviewCell(yr, tech.label, e.target.value)}
                                style={{ width: 42, padding: '3px 4px', borderRadius: 3, border: '1px solid #D1D5DB', fontSize: 12, textAlign: 'center' }} />
                              <span style={{ fontSize: 10, color: '#9CA3AF' }}>%</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep({ group: groupName, phase: 'input' })} style={bGhost}>← Edit</button>
            <button onClick={handleAdvance} style={bPrim}>
              {isLast ? 'Finish →' : 'Save & Continue →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Second cab type prompt ────────────────────────────────────────
  if (step === 'second-cab-prompt') {
    const otherCab = cabType === 'Day Cab' ? 'Sleeper' : 'Day Cab';
    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Technology Adoption Complete</h2>
            <CloseBtn />
          </div>
          <ProgressBar label={`${cabType} complete`} />
          <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '14px 18px', fontSize: 13, color: '#374151' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#15803D' }}>
              {cabType} technology adoption recorded.
            </p>
            <p style={{ margin: 0, color: '#6B7280' }}>
              Would you also like to fill in technology adoption for <strong>{otherCab}</strong> trucks?
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('second-cab-carryover')} style={{ ...bPrim, flex: 1 }}>
              Yes, add {otherCab} data →
            </button>
            <button onClick={() => setStep('done')} style={{ ...bGhost, flex: 1 }}>
              No, continue to fuel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Second cab carryover prompt ───────────────────────────────────
  if (step === 'second-cab-carryover') {
    const otherCab = cabType === 'Day Cab' ? 'Sleeper' : 'Day Cab';
    const firstCabInputs = groupInputs; // capture before switching

    const switchCab = (carryover) => {
      // Save first cab tech data to DB (fire-and-forget)
      const mergedEdits = mergeGroupEdits(groupEdits);
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      for (const [yr, techs] of Object.entries(mergedEdits)) {
        const hasData = Object.values(techs).some(v => v !== '' && v != null);
        if (hasData) fetch(`/api/techs/${yr}`, { method: 'PUT', headers, body: JSON.stringify({ cab_type: cabType, techs }) });
      }
      setIsSecondCab(true);
      setGroupEdits({});
      setReviewZeroAsked({});
      setCabType(otherCab);
      setPendingCabSwitch({ inputs: carryover ? firstCabInputs : null, targetStep: carryover ? 'review' : 'input' });
    };

    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Add {otherCab} Data</h2>
            <CloseBtn />
          </div>
          <ProgressBar label={`Starting ${otherCab} cab type`} />
          <div style={{ background: '#F0F7FF', borderRadius: 8, padding: '14px 18px', fontSize: 13, color: '#374151', lineHeight: 1.65 }}>
            <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#1c3660' }}>
              Would you like to pre-fill {otherCab} answers from your {cabType} responses?
            </p>
            <p style={{ margin: 0, color: '#6B7280' }}>
              Technologies that don't apply to {otherCab} will be filtered out. You can review and adjust each value before saving.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => switchCab(true)} style={{ ...bPrim, flex: 1 }}>
              Yes, pre-fill from {cabType}
            </button>
            <button onClick={() => switchCab(false)} style={{ ...bGhost, flex: 1 }}>
              No, start fresh
            </button>
          </div>
          <button onClick={() => setStep('second-cab-prompt')} style={{ ...bGhost, alignSelf: 'flex-start', fontSize: 12, padding: '5px 12px' }}>← Back</button>
        </div>
      </div>
    );
  }

  // ── Fuel setup ────────────────────────────────────────────────────
  if (step === 'fuel-setup') {
    const allFuelTypes = ['Diesel', 'Biodiesel', 'CNG', 'LNG'];
    const fuelState = groupInputs['__fuel__'] || {};
    const selectedTypes = fuelState.fuelTypes || ['Diesel'];
    const minFirstYear = sortedYears.length >= 2 ? sortedYears[sortedYears.length - 2] : maxYear;
    const firstYear = fuelState.firstYear || minFirstYear;

    const toggleFuelType = (ft) => {
      const next = selectedTypes.includes(ft)
        ? selectedTypes.filter(f => f !== ft)
        : [...selectedTypes, ft];
      setGroupInputs(prev => ({ ...prev, '__fuel__': { ...fuelState, fuelTypes: next.length ? next : selectedTypes } }));
    };

    const setFirstYear = (yr) =>
      setGroupInputs(prev => ({ ...prev, '__fuel__': { ...fuelState, firstYear: Number(yr) } }));

    const fuelYears = sortedYears.filter(y => y >= firstYear);
    const selectableYears = sortedYears.filter(y => y <= minFirstYear);

    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Fuel (IFTA)</h2>
            <CloseBtn />
          </div>
          <ProgressBar label="Fuel Data" />
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            Next, we'll collect your IFTA fuel and mileage data. This helps calculate fleet-wide MPG.
          </p>
          <div>
            <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: 14, color: '#111827' }}>Which fuel type(s) does your fleet purchase?</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {allFuelTypes.map(ft => (
                <button key={ft} onClick={() => toggleFuelType(ft)} style={{
                  padding: '8px 18px', borderRadius: 8, border: '2px solid',
                  borderColor: selectedTypes.includes(ft) ? '#1c3660' : '#D1D5DB',
                  background:  selectedTypes.includes(ft) ? '#EFF6FF' : '#fff',
                  color:       selectedTypes.includes(ft) ? '#1c3660' : '#374151',
                  fontSize: 13, fontWeight: selectedTypes.includes(ft) ? 700 : 400, cursor: 'pointer',
                }}>{ft}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 14, color: '#111827' }}>How far back do you have IFTA data available?</p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6B7280' }}>At minimum the last 2 years are required. You may go further back.</p>
            <select value={firstYear} onChange={e => setFirstYear(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13 }}>
              {selectableYears.map(y => <option key={y} value={y}>{y}{y === minFirstYear ? ' (minimum — 2 years)' : ''}</option>)}
            </select>
            {fuelYears.length > 1 && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6B7280' }}>
                You'll enter data for {fuelYears.length} year{fuelYears.length > 1 ? 's' : ''}: {fuelYears.join(', ')}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep({ group: visibleGroups[totalGroups - 1], phase: 'review' })} style={bGhost}>← Back</button>
            <button onClick={() => setStep('fuel-entry')} style={bPrim}>Enter Fuel Data →</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Fuel entry ────────────────────────────────────────────────────
  if (step === 'fuel-entry') {
    const fuelState = groupInputs['__fuel__'] || {};
    const selectedTypes = fuelState.fuelTypes || ['Diesel'];
    const fuelEntryMinFirst = sortedYears.length >= 2 ? sortedYears[sortedYears.length - 2] : maxYear;
    const firstYear = fuelState.firstYear || fuelEntryMinFirst;
    const fuelYears = sortedYears.filter(y => y >= firstYear);
    const fuelEdits = groupEdits['__fuel__'] || {};

    const setFuelCell = (yr, ft, field, val) =>
      setGroupEdits(prev => {
        const ye = { ...(prev['__fuel__'] || {}) };
        ye[yr] = { ...(ye[yr] || {}) };
        const key = `${ft}__${field}`;
        ye[yr][key] = val;
        return { ...prev, '__fuel__': ye };
      });

    const getFuelCell = (yr, ft, field) => (fuelEdits[yr] || {})[`${ft}__${field}`] ?? '';

    const calcMpg = (miles, vol) => {
      const m = parseFloat(miles), v = parseFloat(vol);
      return m > 0 && v > 0 ? m / v : null;
    };

    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Fuel (IFTA) — Data Entry</h2>
            <CloseBtn />
          </div>
          <ProgressBar label="Fuel Data" />
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            Enter IFTA miles and gallons (or DGE for CNG/LNG) for each year. MPG calculates automatically.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead>
                <tr style={{ background: '#F3F4F6' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', minWidth: 110 }}>Fuel Type</th>
                  {fuelYears.map(y => (
                    <th key={y} colSpan={3} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: y === maxYear ? 700 : 500, color: y === maxYear ? '#1c3660' : '#374151', borderLeft: '2px solid #E5E7EB', minWidth: 210 }}>{y}</th>
                  ))}
                </tr>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={{ padding: '4px 12px' }} />
                  {fuelYears.map(y => (
                    <React.Fragment key={y}>
                      <th style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11, color: '#6B7280', fontWeight: 600, borderLeft: '2px solid #E5E7EB', minWidth: 80 }}>IFTA Miles</th>
                      <th style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11, color: '#6B7280', fontWeight: 600, minWidth: 80 }}>Gal / DGE</th>
                      <th style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11, color: '#6B7280', fontWeight: 600, minWidth: 55 }}>MPG</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedTypes.map((ft, fi) => {
                  const isCng = ['CNG', 'LNG'].includes(ft);
                  return (
                    <tr key={ft} style={{ borderBottom: '1px solid #F3F4F6', background: fi % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#374151' }}>{ft}</td>
                      {fuelYears.map(yr => {
                        const miles = getFuelCell(yr, ft, 'miles');
                        const vol   = getFuelCell(yr, ft, 'vol');
                        const mpg   = calcMpg(miles, vol);
                        const alert = getMpgAlert(mpg, fuelBenchmarks, ft);
                        const b     = fuelBenchmarks?.[ft];
                        const alertMsg = alert === 'low'
                          ? `Below 25% of ${ft} avg (${b?.avg_mpg?.toFixed(2)} MPG)`
                          : alert === 'high'
                          ? `More than 2× ${ft} avg (${b?.avg_mpg?.toFixed(2)} MPG)`
                          : null;
                        return (
                          <React.Fragment key={yr}>
                            <td style={{ padding: '4px 6px', borderLeft: '2px solid #E5E7EB' }}>
                              <input type="number" value={miles} onChange={e => setFuelCell(yr, ft, 'miles', e.target.value)}
                                placeholder="—" style={{ width: 80, padding: '4px 6px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 12, textAlign: 'right' }} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <input type="number" value={vol} onChange={e => setFuelCell(yr, ft, 'vol', e.target.value)}
                                  placeholder="—" style={{ width: 80, padding: '4px 6px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 12, textAlign: 'right' }} />
                                <span style={{ fontSize: 10, color: '#9CA3AF' }}>{isCng ? 'DGE' : 'gal'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                              {mpg != null ? (
                                <div>
                                  <span style={{ fontWeight: 600, color: alert ? '#DC2626' : '#1c3660', fontSize: 12 }}>
                                    {mpg.toFixed(2)}
                                    {alert && <span title={alertMsg} style={{ marginLeft: 3, cursor: 'help' }}>⚠</span>}
                                  </span>
                                  {alertMsg && <div style={{ fontSize: 10, color: '#DC2626', lineHeight: 1.2, maxWidth: 80 }}>{alertMsg}</div>}
                                </div>
                              ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep('fuel-setup')} style={bGhost}>← Back</button>
            <button onClick={() => setStep('fuel-done')} style={bPrim}>Continue →</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Fuel done ─────────────────────────────────────────────────────
  if (step === 'fuel-done') {
    const fuelState = groupInputs['__fuel__'] || {};
    const selectedTypes = fuelState.fuelTypes || ['Diesel'];
    const fuelDoneMinFirst = sortedYears.length >= 2 ? sortedYears[sortedYears.length - 2] : maxYear;
    const firstYear = fuelState.firstYear || fuelDoneMinFirst;
    const fuelYears = sortedYears.filter(y => y >= firstYear);

    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Fuel Data Complete</h2>
            <CloseBtn />
          </div>
          <ProgressBar label="Fuel complete — equipment data next" />
          <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '14px 18px', fontSize: 13, color: '#374151' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#15803D' }}>Fuel data recorded</p>
            <p style={{ margin: 0, color: '#6B7280' }}>
              {fuelYears.length} year{fuelYears.length !== 1 ? 's' : ''} · {selectedTypes.join(', ')}
            </p>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>
            Next, we'll collect equipment utilization and fleet equipment data. These sections are <strong>optional</strong> but help us better understand your fleet.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep('fuel-entry')} style={bGhost}>← Back</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('final-review')} style={bGhost}>Skip, go to review →</button>
              <button onClick={() => setStep('equip-intro')} style={bPrim}>Continue →</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Equipment intro ───────────────────────────────────────────────
  if (step === 'equip-intro') {
    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Equipment Data</h2>
            <CloseBtn />
          </div>
          <ProgressBar label="Optional: Equipment utilization & fleet equipment" />
          <div style={{ background: '#F0F7FF', borderRadius: 8, padding: '14px 18px', fontSize: 13, color: '#374151', lineHeight: 1.65 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#1c3660' }}>This section is optional</p>
            <p style={{ margin: '0 0 6px' }}>
              Equipment utilization and fleet equipment data help us better understand how fleets operate.
              You only need to enter data for up to <strong>{equipYears.length} year{equipYears.length !== 1 ? 's' : ''}</strong> ({equipYears.join(', ')}).
            </p>
            <p style={{ margin: 0, color: '#6B7280', fontSize: 12 }}>
              You can skip either or both sections and fill them in later from the Data page.
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep('fuel-done')} style={bGhost}>← Back</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('final-review')} style={bGhost}>Skip both, go to review →</button>
              <button onClick={() => setStep('equip-util')} style={bPrim}>Start with Utilization →</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Equipment utilization inline entry ────────────────────────────
  if (step === 'equip-util') {
    const UTIL_COLS = [
      { key: 'tractors',        label: 'Tractors',      type: 'int' },
      { key: 'trailers',        label: 'Trailers',      type: 'int' },
      { key: 'grossed_out_pct', label: 'Grossed Out %', type: 'pct' },
      { key: 'cubed_out_pct',   label: 'Cubed Out %',   type: 'pct' },
      { key: 'ave_length_haul', label: 'Avg Haul (mi)', type: 'int' },
      { key: 'empty_miles_pct', label: 'Empty Miles %', type: 'pct' },
    ];
    const setUtilCell = (yr, idx, field, val) =>
      setUtilEdits(prev => {
        const rows = [...(prev[yr] || [])];
        rows[idx] = { ...rows[idx], [field]: val };
        return { ...prev, [yr]: rows };
      });
    const addUtilRow = (yr) =>
      setUtilEdits(prev => ({ ...prev, [yr]: [...(prev[yr] || []), EMPTY_UTIL_ROW()] }));
    const removeUtilRow = (yr, idx) =>
      setUtilEdits(prev => {
        const rows = [...(prev[yr] || [])];
        rows.splice(idx, 1);
        return { ...prev, [yr]: rows.length ? rows : [EMPTY_UTIL_ROW()] };
      });

    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Equipment Utilization</h2>
            <CloseBtn />
          </div>
          <ProgressBar label="Equipment Utilization (optional)" />
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            Enter the number of tractors and trailers per application type, and utilization details. One row per application (e.g. OTR, Regional, Local).
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {equipYears.map(yr => (
              <button key={yr} onClick={() => setEquipYear(yr)} style={{
                padding: '4px 14px', borderRadius: 6, border: '1px solid', fontSize: 13, cursor: 'pointer',
                fontWeight: equipYear === yr ? 700 : 400,
                borderColor: equipYear === yr ? '#1c3660' : '#D1D5DB',
                background:  equipYear === yr ? '#1c3660' : '#fff',
                color:       equipYear === yr ? '#fff'    : '#374151',
              }}>{yr}</button>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
              <thead>
                <tr style={{ background: '#F3F4F6' }}>
                  <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', minWidth: 140 }}>Application</th>
                  {UTIL_COLS.map(c => (
                    <th key={c.key} style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600, color: '#374151', minWidth: 90 }}>{c.label}</th>
                  ))}
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {(utilEdits[equipYear] || [EMPTY_UTIL_ROW()]).map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '4px 6px' }}>
                      <input value={row.application} onChange={e => setUtilCell(equipYear, idx, 'application', e.target.value)}
                        placeholder="e.g. OTR" style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 12 }} />
                    </td>
                    {UTIL_COLS.map(c => (
                      <td key={c.key} style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <input type="number" value={row[c.key]} onChange={e => setUtilCell(equipYear, idx, c.key, e.target.value)}
                          style={{ width: 72, padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 12, textAlign: 'center' }} />
                      </td>
                    ))}
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <button onClick={() => removeUtilRow(equipYear, idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14 }} title="Remove">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => addUtilRow(equipYear)} style={{ ...bGhost, fontSize: 12, padding: '5px 14px', alignSelf: 'flex-start' }}>+ Add row</button>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep('equip-intro')} style={bGhost}>← Back</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('final-review')} style={bGhost}>Skip fleet equipment, go to review →</button>
              <button onClick={() => setStep('fleet-equip')} style={bPrim}>Continue to Fleet Equipment →</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Fleet equipment inline entry ──────────────────────────────────
  if (step === 'fleet-equip') {
    const tractorMakes = [...new Set(makeModels.map(m => m.make))].sort();
    const setEquipCell = (yr, idx, field, val) =>
      setEquipEdits(prev => {
        const rows = [...(prev[yr] || [])];
        if (field === 'tractor_make') rows[idx] = { ...rows[idx], tractor_make: val, tractor_model: '', engine_make: '', engine_model: '' };
        else if (field === 'engine_make') rows[idx] = { ...rows[idx], engine_make: val, engine_model: '' };
        else rows[idx] = { ...rows[idx], [field]: val };
        return { ...prev, [yr]: rows };
      });
    const addEquipRow = (yr) =>
      setEquipEdits(prev => ({ ...prev, [yr]: [...(prev[yr] || []), EMPTY_EQUIP_ROW()] }));
    const removeEquipRow = (yr, idx) =>
      setEquipEdits(prev => {
        const rows = [...(prev[yr] || [])];
        rows.splice(idx, 1);
        return { ...prev, [yr]: rows.length ? rows : [EMPTY_EQUIP_ROW()] };
      });

    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={{ ...card, maxWidth: 900 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Fleet Equipment</h2>
            <CloseBtn />
          </div>
          <ProgressBar label="Fleet Equipment (optional)" />
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            Enter the tractors purchased in each year. One row per tractor make/model combination.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {equipYears.map(yr => (
              <button key={yr} onClick={() => setEquipYear(yr)} style={{
                padding: '4px 14px', borderRadius: 6, border: '1px solid', fontSize: 13, cursor: 'pointer',
                fontWeight: equipYear === yr ? 700 : 400,
                borderColor: equipYear === yr ? '#1c3660' : '#D1D5DB',
                background:  equipYear === yr ? '#1c3660' : '#fff',
                color:       equipYear === yr ? '#fff'    : '#374151',
              }}>{yr}</button>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
              <thead>
                <tr style={{ background: '#F3F4F6' }}>
                  {[['qty','Qty',60],['cab_type','Cab Type',100],['tractor_make','Make',120],['tractor_model','Model',130],['engine_make','Engine Make',120],['engine_model','Engine Model',130]].map(([key,label,w]) => (
                    <th key={key} style={{ padding: '7px 8px', textAlign: 'left', fontWeight: 600, color: '#374151', minWidth: w }}>{label}</th>
                  ))}
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {(equipEdits[equipYear] || [EMPTY_EQUIP_ROW()]).map((row, idx) => {
                  const makeModelsForMake = makeModels.filter(m => m.make === row.tractor_make).map(m => m.model);
                  const engineMakeLimits = ENGINE_MAKE_LIMITS_LOCAL[row.tractor_make];
                  const availEngMakes = engineMakeLimits === null ? [] : engineMakeLimits
                    ? engineMakeLimits
                    : [...new Set(engineModels.map(m => m.make))].sort();
                  const availEngModels = engineModels.filter(m => m.make === row.engine_make).map(m => m.model);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '4px 6px' }}>
                        <input type="number" value={row.qty} onChange={e => setEquipCell(equipYear, idx, 'qty', e.target.value)}
                          style={{ width: 52, padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 12, textAlign: 'center' }} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select value={row.cab_type} onChange={e => setEquipCell(equipYear, idx, 'cab_type', e.target.value)}
                          style={{ padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 12 }}>
                          <option value="">—</option>
                          {['Sleeper', 'Day Cab'].map(ct => <option key={ct} value={ct}>{ct}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select value={row.tractor_make} onChange={e => setEquipCell(equipYear, idx, 'tractor_make', e.target.value)}
                          style={{ padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 12 }}>
                          <option value="">—</option>
                          {tractorMakes.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select value={row.tractor_model} onChange={e => setEquipCell(equipYear, idx, 'tractor_model', e.target.value)}
                          style={{ padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 12 }}>
                          <option value="">—</option>
                          {makeModelsForMake.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        {engineMakeLimits === null ? (
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>N/A</span>
                        ) : (
                          <select value={row.engine_make} onChange={e => setEquipCell(equipYear, idx, 'engine_make', e.target.value)}
                            style={{ padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 12 }}>
                            <option value="">—</option>
                            {availEngMakes.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        {engineMakeLimits === null ? (
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>N/A</span>
                        ) : (
                          <select value={row.engine_model} onChange={e => setEquipCell(equipYear, idx, 'engine_model', e.target.value)}
                            style={{ padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 12 }}>
                            <option value="">—</option>
                            {availEngModels.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <button onClick={() => removeEquipRow(equipYear, idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14 }} title="Remove">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button onClick={() => addEquipRow(equipYear)} style={{ ...bGhost, fontSize: 12, padding: '5px 14px', alignSelf: 'flex-start' }}>+ Add row</button>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep('equip-util')} style={bGhost}>← Back</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('final-review')} style={bGhost}>Skip, go to review →</button>
              <button onClick={() => setStep('final-review')} style={bPrim}>Continue to Review →</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Final review ──────────────────────────────────────────────────
  if (step === 'final-review') {
    const fuelState = groupInputs['__fuel__'] || {};
    const selectedFuelTypes = fuelState.fuelTypes || ['Diesel'];
    const fuelMinFirstYear = sortedYears.length >= 2 ? sortedYears[sortedYears.length - 2] : maxYear;
    const fuelFirstYear = fuelState.firstYear || fuelMinFirstYear;
    const fuelYears = sortedYears.filter(y => y >= fuelFirstYear);
    const hasFuel = fuelYears.length > 0;
    const utilEntered = equipYears.some(yr => (utilEdits[yr] || []).some(r => r.application));
    const equipEntered = equipYears.some(yr => (equipEdits[yr] || []).some(r => r.qty || r.tractor_make));

    // Pre-compute finalized tech edits for display (apply zeros)
    let displayInputs = groupInputs;
    let displayEdits  = groupEdits;
    for (const grp of visibleGroups) {
      const declined = !autoZero && reviewZeroAsked[grp] === false;
      if (!declined) {
        displayInputs = applyZeroToGroup(grp, displayInputs);
        displayEdits  = applyZeroToGroupEdits(grp, displayInputs, displayEdits);
      }
    }
    const reviewYears = sortedYears.slice(-4); // show last 4 years in tech table

    const sectionStyle = { borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' };
    const sectionHead  = {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 16px', background: '#F3F4F6',
    };
    const tdBase  = { padding: '5px 10px', fontSize: 12, borderBottom: '1px solid #F3F4F6' };
    const thBase2 = { padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F9FAFB', textAlign: 'center', borderBottom: '1px solid #E5E7EB' };

    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={{ ...card, maxWidth: 860 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Final Review</h2>
            <CloseBtn />
          </div>
          <ProgressBar label="Review before submitting" />
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            Review what you've entered. Click <strong>Edit</strong> on any section to go back and make changes.
          </p>

          {/* ── Technology Adoption ── */}
          <div style={sectionStyle}>
            <div style={sectionHead}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Technology Adoption — {cabType}</span>
              <button onClick={() => setStep({ group: visibleGroups[0], phase: 'input' })} style={{ ...bGhost, fontSize: 12, padding: '4px 12px' }}>Edit</button>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...thBase2, textAlign: 'left', minWidth: 180, position: 'sticky', left: 0, top: 0, zIndex: 2 }}>Technology</th>
                    {reviewYears.map(y => <th key={y} style={{ ...thBase2, minWidth: 58, position: 'sticky', top: 0, zIndex: 1 }}>{y}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visibleGroups.flatMap(grp => {
                    const techs = getVisibleTechs(grp);
                    return [
                      <tr key={`g-${grp}`} style={{ background: '#F3F4F6' }}>
                        <td colSpan={reviewYears.length + 1} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: 1, textTransform: 'uppercase' }}>{grp}</td>
                      </tr>,
                      ...techs.map((tech, ti) => (
                        <tr key={tech.label} style={{ background: ti % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ ...tdBase, color: '#374151', position: 'sticky', left: 0, background: ti % 2 === 0 ? '#fff' : '#FAFAFA' }}>{tech.label}</td>
                          {reviewYears.map(yr => {
                            const val = (displayEdits[grp]?.[yr] || {})[tech.label];
                            return (
                              <td key={yr} style={{ ...tdBase, textAlign: 'center', color: val == null || val === '' ? '#D1D5DB' : '#111827' }}>
                                {val != null && val !== '' ? `${Math.round(val)}%` : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Fuel (IFTA) ── */}
          <div style={sectionStyle}>
            <div style={sectionHead}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Fuel (IFTA)</span>
              <button onClick={() => setStep('fuel-setup')} style={{ ...bGhost, fontSize: 12, padding: '4px 12px' }}>Edit</button>
            </div>
            {!hasFuel ? (
              <p style={{ margin: 0, padding: '12px 16px', fontSize: 12, color: '#9CA3AF' }}>No fuel data entered</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thBase2, textAlign: 'left', minWidth: 100 }}>Year</th>
                      <th style={{ ...thBase2, textAlign: 'left', minWidth: 100 }}>Fuel Type</th>
                      <th style={{ ...thBase2, minWidth: 120 }}>IFTA Miles</th>
                      <th style={{ ...thBase2, minWidth: 120 }}>Volume (gal/DGE)</th>
                      <th style={{ ...thBase2, minWidth: 80 }}>MPG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fuelYears.flatMap((yr, yi) =>
                      selectedFuelTypes.map((ft, fi) => {
                        const miles = (groupEdits['__fuel__']?.[yr] || {})[`${ft}__miles`] ?? '';
                        const vol   = (groupEdits['__fuel__']?.[yr] || {})[`${ft}__vol`]   ?? '';
                        const mpg   = miles !== '' && vol !== '' && parseFloat(vol) > 0
                          ? (parseFloat(miles) / parseFloat(vol)).toFixed(2) : '—';
                        const bg = (yi * selectedFuelTypes.length + fi) % 2 === 0 ? '#fff' : '#FAFAFA';
                        return (
                          <tr key={`${yr}-${ft}`} style={{ background: bg }}>
                            <td style={{ ...tdBase, color: '#374151' }}>{yr}</td>
                            <td style={{ ...tdBase, color: '#374151' }}>{ft}</td>
                            <td style={{ ...tdBase, textAlign: 'center', color: miles !== '' ? '#111827' : '#D1D5DB' }}>{miles !== '' ? Number(miles).toLocaleString() : '—'}</td>
                            <td style={{ ...tdBase, textAlign: 'center', color: vol !== '' ? '#111827' : '#D1D5DB' }}>{vol !== '' ? Number(vol).toLocaleString() : '—'}</td>
                            <td style={{ ...tdBase, textAlign: 'center', color: mpg !== '—' ? '#111827' : '#D1D5DB', fontWeight: mpg !== '—' ? 600 : 400 }}>{mpg}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Equipment Utilization ── */}
          <div style={sectionStyle}>
            <div style={sectionHead}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Equipment Utilization</span>
              <button onClick={() => setStep('equip-util')} style={{ ...bGhost, fontSize: 12, padding: '4px 12px' }}>Edit</button>
            </div>
            {!utilEntered ? (
              <p style={{ margin: 0, padding: '12px 16px', fontSize: 12, color: '#9CA3AF' }}>Skipped (optional)</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Year','Application','Tractors','Trailers','Grossed Out %','Cubed Out %','Avg Haul (mi)','Empty Miles %'].map(h => (
                        <th key={h} style={{ ...thBase2, textAlign: h === 'Year' || h === 'Application' ? 'left' : 'center', minWidth: h === 'Application' ? 130 : 80 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {equipYears.flatMap(yr =>
                      (utilEdits[yr] || []).filter(r => r.application).map((r, i) => (
                        <tr key={`${yr}-${i}`} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ ...tdBase, color: '#374151' }}>{yr}</td>
                          <td style={{ ...tdBase, color: '#374151' }}>{r.application}</td>
                          {['tractors','trailers','grossed_out_pct','cubed_out_pct','ave_length_haul','empty_miles_pct'].map(k => (
                            <td key={k} style={{ ...tdBase, textAlign: 'center', color: r[k] !== '' && r[k] != null ? '#111827' : '#D1D5DB' }}>
                              {r[k] !== '' && r[k] != null ? (k.endsWith('_pct') ? `${r[k]}%` : r[k]) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Fleet Equipment ── */}
          <div style={sectionStyle}>
            <div style={sectionHead}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Fleet Equipment</span>
              <button onClick={() => setStep('fleet-equip')} style={{ ...bGhost, fontSize: 12, padding: '4px 12px' }}>Edit</button>
            </div>
            {!equipEntered ? (
              <p style={{ margin: 0, padding: '12px 16px', fontSize: 12, color: '#9CA3AF' }}>Skipped (optional)</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Year','Qty','Cab Type','Make','Model','Engine Make','Engine Model'].map(h => (
                        <th key={h} style={{ ...thBase2, textAlign: h === 'Year' ? 'left' : 'center', minWidth: h === 'Model' || h === 'Engine Model' ? 120 : 70 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {equipYears.flatMap(yr =>
                      (equipEdits[yr] || []).filter(r => r.qty || r.tractor_make || r.cab_type).map((r, i) => (
                        <tr key={`${yr}-${i}`} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ ...tdBase, color: '#374151' }}>{yr}</td>
                          {[r.qty, r.cab_type, r.tractor_make, r.tractor_model, r.engine_make, r.engine_model].map((v, vi) => (
                            <td key={vi} style={{ ...tdBase, textAlign: 'center', color: v ? '#111827' : '#D1D5DB' }}>{v || '—'}</td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {fuelMissingYears.length > 0 && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#991B1B' }}>
                MPG data required for {fuelMissingYears.join(', ')}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#B91C1C' }}>
                You have adoption data for these years but no fuel (IFTA) data. Please go back and enter fuel data starting from {Math.min(...fuelMissingYears)}.
              </p>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            {fuelMissingYears.length > 0 && (
              <button onClick={() => { setFuelMissingYears([]); setStep('fuel-setup'); }} style={bGhost}>← Fix fuel data</button>
            )}
            <button onClick={() => {
              const fuelFirstYear = Number((groupInputs['__fuel__'] || {}).firstYear || 0);
              const missing = fuelFirstYear
                ? sortedYears.filter(yr =>
                    Number(yr) < fuelFirstYear &&
                    visibleGroups.some(grp =>
                      Object.values(groupEdits[grp]?.[yr] || {}).some(v => v !== '' && v != null)
                    )
                  )
                : [];
              if (missing.length > 0) { setFuelMissingYears(missing); return; }
              setFuelMissingYears([]);
              setStep('interview-complete');
            }} style={bPrim}>Looks good →</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Interview complete — submit or save for later ──────────────────
  if (step === 'interview-complete') {
    return (
      <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
        <ExitConfirm />
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={h2style}>Ready to Submit</h2>
            <CloseBtn />
          </div>
          <ProgressBar label="Complete" />
          <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '16px 20px', fontSize: 13, color: '#374151' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#15803D', fontSize: 14 }}>Your interview is complete</p>
            <p style={{ margin: 0, lineHeight: 1.65 }}>
              All data has been collected. You can <strong>submit now</strong> to officially log this data for the Fleet Efficiency Study,
              or <strong>save your progress</strong> and submit from the Data page when you're ready.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[true, false].map(submit => (
              <button key={String(submit)} onClick={() => {
                const { finalInputs, finalEdits } = buildFinalTechFuel();
                const fuelRows = buildFuelRowsFromEdits(finalEdits, finalInputs);
                onComplete(cabType, mergeGroupEdits(finalEdits), finalInputs, fuelRows, utilEdits, equipEdits, submit);
              }} style={{ ...(submit ? bPrim : bGhost), textAlign: 'center' }}>
                {submit ? 'Submit Now' : 'Save data, submit later from Data page'}
              </button>
            ))}
          </div>
          <button onClick={() => setStep('final-review')} style={{ ...bGhost, alignSelf: 'flex-start', fontSize: 12, padding: '5px 12px' }}>← Back to review</button>
        </div>
      </div>
    );
  }

  // ── Done (tech only — transition to fuel) ─────────────────────────
  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && handleCloseRequest()}>
      <ExitConfirm />
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={h2style}>Technology Adoption Complete</h2>
          <CloseBtn />
        </div>
        <ProgressBar label="Technology complete — fuel data next" />
        <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>
          All technology groups are done. Next, we'll collect your IFTA fuel data so we can calculate fleet MPG.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => setStep('fuel-setup')} style={bPrim}>Continue to Fuel →</button>
        </div>
      </div>
    </div>
  );
}


function TechAdoptionCard({ token, onSave, editableYears = [2024, 2025], submittedYears = [] }) {
  const [techData, setTechData]         = useState({});
  const [otherTechData, setOtherTechData] = useState({});
  const [categories, setCategories]     = useState({});
  const [yearMeta, setYearMeta]         = useState({});
  const [years, setYears]               = useState([]);
  const [selectedCabType, setSelectedCabType]     = useState('Day Cab');
  const [edits, setEdits]               = useState({});
  const [saving, setSaving]             = useState(false);
  const scrollRef = useRef(null);
  const [saveMsg, setSaveMsg]           = useState('');
  const [openCats, setOpenCats]         = useState({});
  const [copySource, setCopySource]     = useState({});
  const [minDataYear, setMinDataYear]   = useState(null);

  const dataYears = new Set(Object.keys(techData).map(Number));
  const maxEditableYear = Math.max(...editableYears, 2025);
  const hasDataForCabType = dataYears.size > 0;
  const effectiveEditableYears = hasDataForCabType
    ? editableYears.filter(y => !minDataYear || y >= minDataYear)
    : Array.from({ length: maxEditableYear - 2003 + 1 }, (_, i) => 2003 + i);

  const allTechs = Object.entries(categories).flatMap(([cat, arr]) => arr.map(t => ({...t, category: cat})));
  const readOnlyYears = years.filter(y => !effectiveEditableYears.includes(y)).sort((a, b) => a - b);
  const colCount = readOnlyYears.length + effectiveEditableYears.length + 1;

  const fetchData = async (cabType) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const param = cabType ? `?cab_type=${encodeURIComponent(cabType)}` : '';
      const res = await fetch(`/api/techs${param}`, { headers });
      if (!res.ok) return;
      const t = await res.json();

      // Also fetch other cab type for copy-from options
      const otherCab = (cabType === 'Day Cab' ? 'Sleeper' : 'Day Cab');
      const otherRes = await fetch(`/api/techs?cab_type=${encodeURIComponent(otherCab)}`, { headers });
      if (otherRes.ok) {
        const ot = await otherRes.json();
        setOtherTechData(ot.data || {});
      }

      setTechData(t.data || {});
      setCategories(t.categories || {});
      setYearMeta(t.meta || {});
      setCopySource({});

      // If no data for this cab type, make all years 2003–max editable (no slice)
      const knownDataYears = Object.keys(t.data || {}).map(Number);
      const hasData = knownDataYears.length > 0;
      const minDataYr = hasData ? Math.min(...knownDataYears) : null;
      setMinDataYear(minDataYr);
      const maxYr = Math.max(...editableYears, 2025);
      const effEditable = hasData
        ? editableYears.filter(y => !minDataYr || y >= minDataYr)
        : Array.from({ length: maxYr - 2003 + 1 }, (_, i) => 2003 + i);
      const known = new Set([...knownDataYears, ...effEditable]);
      const sorted = [...known]
        .filter(y => !minDataYr || y >= minDataYr)
        .sort((a, b) => b - a);
      setYears(sorted);

      setOpenCats(prev => {
        const next = {...prev};
        Object.keys(t.categories || {}).forEach(cat => { if (!(cat in next)) next[cat] = true; });
        return next;
      });
      // init edits from existing data, keyed by cab type
      setEdits(prev => {
        const cabEdits = { ...(prev[cabType] || {}) };
        effEditable.forEach(yr => {
          const yrData = t.data?.[yr] ?? t.data?.[String(yr)] ?? null;
          const updated = { ...(cabEdits[yr] || {}) };
          Object.values(t.categories || {}).forEach(techs_ => {
            techs_.forEach(tech => {
              if (yrData) {
                const v = yrData[tech.label];
                updated[tech.label] = v != null ? String(Math.round(v * 100)) : '';
              }
            });
          });
          cabEdits[yr] = updated;
        });
        return { ...prev, [cabType]: cabEdits };
      });
      setSaveMsg('');
    } catch (err) { console.error(err); }
  };

  // Initial load: determine default cab type, then fetch
  useEffect(() => {
    if (!token) return;
    (async () => {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`/api/techs`, { headers });
      if (!res.ok) return;
      const t = await res.json();
      const available = t.availableCabTypes || [];
      // pre-select Day Cab if available, else the last in list, else 'Day Cab'
      const defaultCab = available.includes('Day Cab') ? 'Day Cab'
        : available.length ? available[available.length - 1]
        : 'Day Cab';
      setSelectedCabType(defaultCab);
      // now fetch data for that cab type
      await fetchData(defaultCab);
    })();
  }, [token]);

  // Scroll to rightmost (latest years) whenever the year list changes
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [years]);

  const handleCabTypeChange = (ct) => {
    setSelectedCabType(ct);
    fetchData(ct);
  };

  const handleCopy = (yr, src) => {
    if (src === 'prior-same') {
      const serverData = techData[yr - 1] || {};
      const editData   = ((edits[selectedCabType] || {})[yr - 1]) || {};
      setEdits(prev => {
        const cabEdits = { ...(prev[selectedCabType] || {}) };
        cabEdits[yr] = Object.fromEntries(allTechs.map(tech => {
          const editVal = editData[tech.label];
          if (editVal !== '' && editVal != null) return [tech.label, editVal];
          const v = serverData[tech.label];
          return [tech.label, v != null ? String(Math.round(v * 100)) : ''];
        }));
        return { ...prev, [selectedCabType]: cabEdits };
      });
    } else {
      const sourceData = src === 'current-other' ? (otherTechData[yr] || {}) : (otherTechData[yr - 1] || {});
      setEdits(prev => {
        const cabEdits = { ...(prev[selectedCabType] || {}) };
        cabEdits[yr] = Object.fromEntries(allTechs.map(tech => {
          const v = sourceData[tech.label];
          return [tech.label, v != null ? String(Math.round(v * 100)) : ''];
        }));
        return { ...prev, [selectedCabType]: cabEdits };
      });
    }
  };

  const handleSave = async () => {
    if (!selectedCabType) { setSaveMsg('Select a cab type first.'); return; }
    setSaving(true); setSaveMsg('');
    try {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const cabEdits = edits[selectedCabType] || {};
      const yearsToSave = effectiveEditableYears.filter(yr => {
        const e = cabEdits[yr];
        return e && Object.values(e).some(v => v !== '' && v !== null && v !== undefined);
      });
      const results = await Promise.all(yearsToSave.map(yr =>
        fetch(`/api/techs/${yr}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ cab_type: selectedCabType, techs: cabEdits[yr] }),
        })
      ));
      if (results.some(r => !r.ok)) {
        setSaveMsg('Error saving. Please try again.');
        return;
      }
      setSaveMsg('Saved!');
      onSave?.();
    } catch (err) { setSaveMsg('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={styles.chartCard}>
      {/* Header */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <h3 style={{...styles.chartTitle, marginBottom:0}}>Technology Adoption</h3>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <label style={{fontSize:13, fontWeight:600, color:'#374151'}}>Cab Type:</label>
          <select
            value={selectedCabType}
            onChange={e => handleCabTypeChange(e.target.value)}
            style={{padding:'6px 10px', borderRadius:8, background:'#F9FAFB', color:'#111827', border:'1px solid #D1D5DB', fontSize:13}}>
            <option value='Day Cab'>Day Cab</option>
            <option value='Sleeper'>Sleeper</option>
          </select>
          {saveMsg && <span style={{fontSize:13, color: saveMsg === 'Saved!' ? '#16A34A' : '#DC2626'}}>{saveMsg}</span>}
          {effectiveEditableYears.every(y => submittedYears.includes(y)) ? (
            <button style={{...styles.btnPrimary, opacity: 0.5}} disabled>Submitted</button>
          ) : (
            <button onClick={handleSave} disabled={saving} style={{...styles.btnPrimary, opacity: saving ? 0.7 : 1}}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} style={{overflowX:'auto'}}>
        <table style={{...styles.heatTable, minWidth: readOnlyYears.length * 72 + 260 + effectiveEditableYears.length * 150}}>
          <thead>
            <tr>
              <th style={{...styles.heatTh, minWidth:220, position:'sticky', left:0, zIndex:3, background:'#fff'}}>Technology</th>
              {readOnlyYears.map(y => <th key={y} style={styles.heatThYear}>{y}</th>)}
              {effectiveEditableYears.map(y => {
                if (submittedYears.includes(y)) {
                  return <th key={y} style={styles.heatThYear}>{y} ✓</th>;
                }
                if (dataYears.has(y)) {
                  return <th key={y} style={styles.heatThYear}>{y}</th>;
                }
                const otherCab = selectedCabType === 'Day Cab' ? 'Sleeper' : 'Day Cab';
                const hasPriorYear    = y - 1 >= 2003;
                const hasPriorSame    = hasPriorYear && (
                  Object.keys(techData[y - 1] || {}).length > 0 ||
                  Object.values((edits[selectedCabType] || {})[y - 1] || {}).some(v => v !== '' && v != null)
                );
                const hasCurrentOther = Object.keys(otherTechData[y]      || {}).length > 0;
                const hasPriorOther   = hasPriorYear && Object.keys(otherTechData[y - 1] || {}).length > 0;
                const anySource = hasPriorSame || hasCurrentOther || hasPriorOther;
                const defaultSrc = hasPriorSame ? 'prior-same' : hasCurrentOther ? 'current-other' : hasPriorOther ? 'prior-other' : 'current-other';
                const src = copySource[y] ?? defaultSrc;
                return (
                  <th key={y} style={{...styles.heatThYear, background:'#EFF6FF', minWidth:150}}>
                    <div>{y} ✎</div>
                    <div style={{display:'flex', alignItems:'center', gap:3, marginTop:4, justifyContent:'center', flexWrap:'wrap'}}>
                      <span style={{fontSize:9, color:'#6B7280', whiteSpace:'nowrap'}}>Copy:</span>
                      <select
                        value={src}
                        onChange={e => setCopySource(prev => ({...prev, [y]: e.target.value}))}
                        style={{fontSize:9, padding:'1px 2px', borderRadius:3, border:'1px solid #D1D5DB', maxWidth:100}}
                      >
                        {y - 1 >= 2003 && <option value="prior-same"    disabled={!hasPriorSame}    style={{color: hasPriorSame    ? 'inherit' : '#9CA3AF'}}>{y - 1} · {selectedCabType}</option>}
                        <option value="current-other" disabled={!hasCurrentOther} style={{color: hasCurrentOther ? 'inherit' : '#9CA3AF'}}>{y} · {otherCab}</option>
                        {y - 1 >= 2003 && <option value="prior-other"   disabled={!hasPriorOther}   style={{color: hasPriorOther   ? 'inherit' : '#9CA3AF'}}>{y - 1} · {otherCab}</option>}
                      </select>
                      <button
                        onClick={() => handleCopy(y, src)}
                        disabled={!anySource}
                        style={{padding:'1px 5px', borderRadius:3, border:'1px solid #D1D5DB', background: anySource ? '#fff' : '#F3F4F6', color: anySource ? '#374151' : '#9CA3AF', fontSize:9, cursor: anySource ? 'pointer' : 'default'}}
                      >Go</button>
                    </div>
                  </th>
                );
              })}
            </tr>
            {/* Cab Type read-only row */}
            <tr style={{background:'#F9FAFB'}}>
              <td style={{padding:'5px 12px', fontSize:12, fontWeight:600, color:'#374151', position:'sticky', left:0, zIndex:2, background:'#F9FAFB'}}>Cab Type</td>
              {readOnlyYears.map(y => (
                <td key={y} style={{...styles.heatCell, fontSize:12, color:'#6B7280'}}>
                  {yearMeta[y]?.cab_type || '—'}
                </td>
              ))}
              {effectiveEditableYears.map(y => {
                const isReadOnly = submittedYears.includes(y) || dataYears.has(y);
                return (
                  <td key={y} style={{...styles.heatCell, fontSize:12, color: isReadOnly ? '#6B7280' : '#374151', background: isReadOnly ? 'transparent' : '#EFF6FF', fontWeight:500}}>
                    {yearMeta[y]?.cab_type || selectedCabType}
                  </td>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Object.entries(categories).flatMap(([cat, techs_]) => {
              const isOpen = openCats[cat] !== false;
              const visibleTechs = techs_.filter(t => {
                // Must apply to the selected cab type (null means applies to both)
                const cabOk = selectedCabType === 'Day Cab'
                  ? (t.applies_daycab == null ? true : t.applies_daycab !== 0)
                  : (t.applies_sleeper == null ? true : t.applies_sleeper !== 0);
                if (!cabOk) return false;
                // Only show active techs (no active_to date)
                if (t.active_to != null) return false;
                // Show if active in at least one editable year
                return editableYears.some(y =>
                  t.active_from == null || t.active_from <= y
                );
              });
              const rows = [];
              rows.push(
                <tr key={`cat-${cat}`} style={{cursor:'pointer'}} onClick={() => setOpenCats(p => ({...p, [cat]: !isOpen}))}>
                  <td style={{...styles.heatCatRow, position:'sticky', left:0, zIndex:2}}>{isOpen ? '▼' : '▶'} {cat}</td>
                  {Array.from({length: colCount - 1}).map((_, i) => <td key={i} style={{background:'#F3F4F6'}} />)}
                </tr>
              );
              if (isOpen) {
                visibleTechs.forEach(tech => {
                  rows.push(
                    <tr key={tech.label} style={styles.heatRow}>
                      <td style={{...styles.heatTechLabel, position:'sticky', left:0, zIndex:1, background:'#fff'}} title={tech.desc}>{tech.label}</td>
                      {readOnlyYears.map(y => (
                        <td key={y} style={styles.heatCell}>
                          <HeatCell value={(techData[y] || {})[tech.label]} />
                        </td>
                      ))}
                      {effectiveEditableYears.map(y => {
                        if (submittedYears.includes(y) || dataYears.has(y)) {
                          const dbVal = (techData[y] || {})[tech.label];
                          const editVal = ((edits[selectedCabType] || {})[y] || {})[tech.label];
                          const displayVal = dbVal != null ? dbVal : (submittedYears.includes(y) && editVal !== '' && editVal != null ? Number(editVal) / 100 : 0);
                          return (
                            <td key={y} style={styles.heatCell}>
                              <HeatCell value={displayVal} />
                            </td>
                          );
                        }
                        return (
                          <td key={y} style={{...styles.heatCell, background:'#F0F7FF', padding:'4px 8px'}}>
                            <div style={styles.pctInputWrap}>
                              <input
                                style={{...styles.techInput, fontSize:12, padding:'4px 24px 4px 6px'}}
                                type="number" min="0" max="100"
                                value={((edits[selectedCabType] || {})[y] || {})[tech.label] ?? ''}
                                onChange={e => {
                                  let val = e.target.value;
                                  if (val !== '' && val !== '-') {
                                    const n = Number(val);
                                    if (n < 0) val = '0';
                                    else if (n > 100) val = '100';
                                  }
                                  setEdits(prev => {
                                    const cabEdits = { ...(prev[selectedCabType] || {}) };
                                    cabEdits[y] = { ...(cabEdits[y] || {}), [tech.label]: val };
                                    return { ...prev, [selectedCabType]: cabEdits };
                                  });
                                }}
                                placeholder="—"
                              />
                              <span style={styles.pctSign}>%</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                });
              }
              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeatCell({ value }) {
  if (value == null) return <span style={styles.heatNull}>—</span>;
  const intensity = value;
  const bg = `rgba(22, 163, 74, ${intensity})`;
  const color = intensity > 0.5 ? "#FFFFFF" : "#111827";
  return (
    <span style={{...styles.heatValue, background: bg, color}}>
      {pct(value)}
    </span>
  );
}

function SubmissionHistory({ token, saveCount, submittedYears = [], editableYears = [2024, 2025], isNewFleet = false, onSubmit }) {
  const [status, setStatus]           = useState(null);
  const [submitModal, setSubmitModal] = useState(null);
  const [submittingAll, setSubmittingAll] = useState(false);
  const scrollRef = useRef(null);
  const YEARS = [...editableYears].sort((a, b) => a - b);

  const loadStatus = () => {
    if (!token) return;
    fetch('/api/submission-status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStatus(d); })
      .catch(console.error);
  };
  useEffect(loadStatus, [token, saveCount]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [YEARS.length]);

  const techThreshold = (yr, cabType) => status?.techTotals?.[yr]?.[cabType] ?? 0;

  const fuelCnt = (yr) => status?.fuel?.[yr]?.cnt ?? 0;

  // Yellow: at least fuel has been entered — enough to enable submission (modal shows what's incomplete)
  const isYellow = (yr) => {
    if (!status) return false;
    return fuelCnt(yr) >= 1;
  };

  // Green: all sections have entries AND at least one cab_type meets its tech threshold
  const isGreen = (yr) => {
    if (!status) return false;
    const hasFuel = fuelCnt(yr) >= 1;
    const hasUtil = (status.utilization?.[yr] || 0) >= 1;
    const hasEquip = (status.fleetEquip?.[yr] || 0) >= 1;
    const techByType = status.tech?.[yr] || {};
    const hasTech = Object.entries(techByType).some(([ct, n]) => {
      const t = techThreshold(yr, ct);
      return t === 0 || n >= t;
    });
    return hasFuel && hasUtil && hasEquip && hasTech;
  };

  // All 4 sections have at least one entry (for cell coloring)
  const allFilled = (yr) => {
    if (!status) return false;
    return fuelCnt(yr) >= 1
      && (status.utilization?.[yr] ?? 0) >= 1
      && (status.fleetEquip?.[yr]  ?? 0) >= 1
      && Object.keys(status.tech?.[yr] || {}).length > 0;
  };

  const getIncomplete = (yr) => {
    if (!status) return [];
    const items = [];
    if ((status.utilization?.[yr] || 0) === 0) items.push('Equipment Utilization: no rows entered');
    if ((status.fleetEquip?.[yr]  || 0) === 0) items.push('Fleet Equipment: no rows entered');
    if (fuelCnt(yr) === 0) items.push('Fuel (IFTA): no rows entered');
    const techByType = status.tech?.[yr] || {};
    if (Object.keys(techByType).length === 0) {
      items.push('Tech Adoption: no data entered');
    } else {
      Object.entries(techByType).forEach(([ct, n]) => {
        const threshold = techThreshold(yr, ct);
        if (n < threshold) items.push(`Tech Adoption (${ct}): ${n} of ${threshold} technologies entered`);
      });
    }
    return items;
  };

  // Cell display helpers
  const sectionCell = (key, yr) => {
    if (!status) return { text: '—', color: '#374151' };
    const cnt = status[key]?.[yr] ?? 0;
    if (submittedYears.includes(yr)) {
      return cnt > 0
        ? { text: '✓ Complete', color: '#16A34A' }
        : { text: 'Not entered', color: '#9CA3AF' };
    }
    if (cnt === 0) return { text: 'Not Started', color: '#DC2626' };
    const color = allFilled(yr) ? '#16A34A' : '#D97706';
    return { text: cnt === 1 ? '1 entry' : `${cnt} entries`, color };
  };

  const fuelCellDisplay = (yr) => {
    if (!status) return { text: '—', color: '#374151' };
    const cnt = fuelCnt(yr);
    if (submittedYears.includes(yr)) {
      return cnt > 0
        ? { text: '✓ Complete', color: '#16A34A' }
        : { text: 'Not entered', color: '#9CA3AF' };
    }
    if (cnt === 0) return { text: 'Not Started', color: '#DC2626' };
    const color = allFilled(yr) ? '#16A34A' : '#D97706';
    return { text: status.fuel[yr].fuel_types || (cnt === 1 ? '1 entry' : `${cnt} entries`), color };
  };

  const techCellDisplay = (yr) => {
    if (!status) return { text: '—', color: '#374151' };
    const byType = status.tech?.[yr];
    const hasAny = byType && Object.keys(byType).length > 0;
    if (submittedYears.includes(yr)) {
      return hasAny
        ? { text: '✓ Complete', color: '#16A34A' }
        : { text: 'Not entered', color: '#9CA3AF' };
    }
    if (!hasAny) return { text: 'Not Started', color: '#DC2626' };
    const text = Object.entries(byType).sort(([a],[b]) => a.localeCompare(b)).map(([ct, n]) => `${ct}: ${n}/${techThreshold(yr, ct)}`).join(', ');
    const color = allFilled(yr) ? '#16A34A' : '#D97706';
    return { text, color };
  };

  const handleSubmitConfirm = (yr) => {
    setSubmitModal(null);
    onSubmit?.(yr);
  };

  const handleSubmitAll = async () => {
    setSubmittingAll(true);
    try {
      await fetch('/api/submit-all', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      loadStatus();
    } catch (err) { console.error(err); }
    finally { setSubmittingAll(false); }
  };

  const cellStyle  = { padding:'8px 16px', textAlign:'center', fontSize:13, borderBottom:'1px solid #F3F4F6', color:'#374151' };
  const headStyle  = { padding:'8px 16px', textAlign:'center', fontWeight:700, fontSize:13, color:'#1c3660', borderBottom:'2px solid #E5E7EB', background:'#F9FAFB' };
  const labelStyle = { padding:'8px 12px', fontSize:13, fontWeight:600, color:'#374151', borderBottom:'1px solid #F3F4F6', position:'sticky', left:0, background:'#fff', whiteSpace:'nowrap' };

  const SubmitBtn = ({ yr }) => {
    const hasAnyData = fuelCnt(yr) > 0
      || Object.keys(status?.tech?.[yr] || {}).length > 0
      || (status?.utilization?.[yr] || 0) > 0
      || (status?.fleetEquip?.[yr]  || 0) > 0;

    if (submittedYears.includes(yr)) {
      // A submission record exists for this year.  Only show "Submitted" if the
      // year actually has data — otherwise it's a phantom record and should read
      // "Not completed" so the fleet knows to still enter data for that year.
      return hasAnyData
        ? <span style={{color:'#16A34A', fontWeight:700, fontSize:13}}>✓ Submitted</span>
        : <span style={{color:'#9CA3AF', fontSize:13}}>Not completed</span>;
    }
    if (!hasAnyData) {
      // No submission record AND no data — just show a dash, no submit button
      return <span style={{color:'#D1D5DB', fontSize:13}}>—</span>;
    }
    const yellow = isYellow(yr);
    const green  = isGreen(yr);
    return (
      <button
        onClick={() => yellow && setSubmitModal(yr)}
        style={{
          padding:'5px 14px', borderRadius:6, border:'none', fontSize:12, fontWeight:700,
          cursor: yellow ? 'pointer' : 'not-allowed',
          background: green ? '#16A34A' : yellow ? '#F59E0B' : '#D1D5DB',
          color:      green ? '#fff'    : yellow ? '#1c3660' : '#9CA3AF',
          whiteSpace:'nowrap',
        }}
      >
        Submit {yr}
      </button>
    );
  };

  return (
    <div style={styles.chartCard}>
      <h3 style={{...styles.chartTitle, marginBottom:16}}>Submission Status</h3>
      <div ref={scrollRef} style={{overflowX:'auto', width:'100%'}}>
      <table style={{borderCollapse:'collapse', minWidth: `${YEARS.length * 120 + 180}px`}}>
        <thead>
          <tr>
            <th style={{...headStyle, textAlign:'left', position:'sticky', left:0, zIndex:2}}>Section</th>
            {YEARS.map(y => <th key={y} style={headStyle}>{y}</th>)}
          </tr>
        </thead>
        <tbody>
          {[
            { label: 'Equipment Utilization', key: 'utilization' },
            { label: 'Fleet Equipment',       key: 'fleetEquip'  },
          ].map(({ label, key }) => (
            <tr key={key}>
              <td style={labelStyle}>{label}</td>
              {YEARS.map(y => {
                const { text, color } = sectionCell(key, y);
                return <td key={y} style={{...cellStyle, color, fontWeight: color === '#DC2626' ? 400 : 600}}>{text}</td>;
              })}
            </tr>
          ))}
          <tr>
            <td style={labelStyle}>Fuel (IFTA)</td>
            {YEARS.map(y => {
              const { text, color } = fuelCellDisplay(y);
              return <td key={y} style={{...cellStyle, color, fontWeight: color === '#DC2626' ? 400 : 600}}>{text}</td>;
            })}
          </tr>
          <tr>
            <td style={{...labelStyle, borderBottom:'none'}}>Tech Adoption</td>
            {YEARS.map(y => {
              const { text, color } = techCellDisplay(y);
              return <td key={y} style={{...cellStyle, borderBottom:'none', fontSize:12, color, fontWeight: color === '#DC2626' ? 400 : 600}}>{text}</td>;
            })}
          </tr>
        </tbody>
        <tfoot>
          {!isNewFleet && (
            <tr>
              <td style={{position:'sticky', left:0, background:'#fff', zIndex:1}} />
              {YEARS.map(y => (
                <td key={y} style={{padding:'10px 16px', textAlign:'center'}}>
                  <SubmitBtn yr={y} />
                </td>
              ))}
            </tr>
          )}
        </tfoot>
      </table>
      </div>

      {isNewFleet && (
        <div style={{textAlign:'center', marginTop:14}}>
          <button
            onClick={handleSubmitAll}
            disabled={submittingAll || !isYellow(YEARS[0])}
            style={{
              padding:'8px 24px', borderRadius:6, border:'none', fontSize:13, fontWeight:700,
              cursor: isYellow(YEARS[0]) ? 'pointer' : 'not-allowed',
              background: isGreen(YEARS[0]) ? '#16A34A' : isYellow(YEARS[0]) ? '#F59E0B' : '#D1D5DB',
              color:      isGreen(YEARS[0]) ? '#fff'    : isYellow(YEARS[0]) ? '#1c3660' : '#9CA3AF',
            }}
          >
            {submittingAll ? 'Submitting…' : 'Submit Initial Data'}
          </button>
        </div>
      )}

      {submitModal != null && (() => {
        const yr = submitModal;
        const incomplete = getIncomplete(yr);
        return (
          <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000}}>
            <div style={{background:'#fff', borderRadius:12, padding:32, maxWidth:480, width:'90%', boxShadow:'0 8px 40px rgba(0,0,0,0.25)'}}>
              <h3 style={{margin:'0 0 16px', color:'#1c3660', fontSize:17}}>Submit {yr} Data</h3>
              {incomplete.length > 0 && (
                <div style={{marginBottom:16}}>
                  <p style={{margin:'0 0 8px', fontSize:13, fontWeight:600, color:'#374151'}}>The following entries are incomplete:</p>
                  <ul style={{margin:0, paddingLeft:20}}>
                    {incomplete.map((item, i) => (
                      <li key={i} style={{fontSize:13, color:'#6B7280', marginBottom:4}}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', marginBottom:20}}>
                <p style={{margin:0, fontSize:13, color:'#991B1B', fontWeight:600}}>
                  Warning: Once submitted, {yr} data cannot be changed.
                </p>
              </div>
              <div style={{display:'flex', justifyContent:'flex-end', gap:10}}>
                <button
                  onClick={() => setSubmitModal(null)}
                  style={{padding:'8px 18px', borderRadius:8, border:'1px solid #D1D5DB', background:'#F9FAFB', color:'#374151', fontSize:13, cursor:'pointer', fontWeight:600}}>
                  Cancel
                </button>
                <button
                  onClick={() => handleSubmitConfirm(yr)}
                  style={{padding:'8px 18px', borderRadius:8, border:'none', background:'#F59E0B', color:'#1c3660', fontSize:13, cursor:'pointer', fontWeight:700}}>
                  Submit {yr}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Fleet Details Table ─────────────────────────────────────────────────────
const APPLICATION_OPTIONS = [
  'Van OTR (>400 mi/day)', 'Van regional (<400 mi/day)', 'Dedicated Van',
  'LTL', 'Flatbed', 'Reefer', 'Tank', 'Intermodal', 'Metro P&D', 'Other',
];

const EMPTY_UTIL_ROW = () => ({
  application: '', tractors: '', trailers: '',
  grossed_out_pct: '', cubed_out_pct: '', ave_length_haul: '', empty_miles_pct: '',
});

function FleetDetailsTable({ token, onSave, editableYears = [2024, 2025], submittedYears = [], minDataYear = null }) {
  const NUM_YEARS = 5;
  const editableYearsKey = editableYears.join(',');

  const [data,            setData]           = useState({});
  const [edits,           setEdits]          = useState({});
  const [years,           setYears]          = useState([]);
  const [selectedYear,    setSelectedYear]   = useState(null);
  const [saving,          setSaving]         = useState(false);
  const [status,          setStatus]         = useState(null);
  const [showCopyPicker,  setShowCopyPicker] = useState(false);

  const ratioPct = v => v != null ? (parseFloat(v) * 100).toFixed(1) : '';
  const pctRatio = s => s !== '' && s != null ? parseFloat(s) / 100 : null;

  const toEditRow = row => ({
    application:     row.application     ?? '',
    tractors:        row.tractors        ?? '',
    trailers:        row.trailers        ?? '',
    grossed_out_pct: ratioPct(row.grossed_out_perc),
    cubed_out_pct:   ratioPct(row.cubed_out_perc),
    ave_length_haul: row.ave_length_haul ?? '',
    empty_miles_pct: ratioPct(row.empty_miles_perc),
  });

  const loadData = async () => {
    const r = await fetch('/api/fleet-details', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const d = await r.json();
    setData(d);
    // Build year list: DB years + 2024/2025, sorted descending, take NUM_YEARS
    const dbYears = Object.keys(d).map(Number);
    const oldestDbYear = dbYears.length > 0 ? Math.min(...dbYears) : null;
    const floorYear = oldestDbYear ?? minDataYear;
    const visibleEditable = floorYear != null
      ? editableYears.filter(y => y >= floorYear)
      : editableYears;
    const yrList  = [...new Set([...dbYears, ...visibleEditable])].sort((a, b) => b - a).slice(0, Math.max(NUM_YEARS, visibleEditable.length + 3));
    setYears(yrList);
    const editableInList = yrList.filter(y => visibleEditable.includes(y));
    setSelectedYear(prev => prev ?? (editableInList.length ? Math.min(...editableInList) : yrList[0]));
    // Seed edits for all displayed years
    const init = {};
    yrList.forEach(yr => {
      const yd = d[yr] || {};
      init[yr] = {
        utilization: (yd.utilization || []).map(toEditRow),
      };
      if (init[yr].utilization.length === 0) init[yr].utilization = [EMPTY_UTIL_ROW()];
    });
    setEdits(init);
  };

  useEffect(() => { if (token) loadData(); }, [token, editableYearsKey, minDataYear]);

  useEffect(() => {
    if (selectedYear == null) return;
    setEdits(prev => prev[selectedYear] ? prev : {
      ...prev, [selectedYear]: { utilization: [EMPTY_UTIL_ROW()] },
    });
  }, [selectedYear]);

  const setUtilCell = (yr, idx, field, val) =>
    setEdits(prev => {
      const rows = [...(prev[yr]?.utilization || [])];
      rows[idx] = { ...rows[idx], [field]: val };
      return { ...prev, [yr]: { ...prev[yr], utilization: rows } };
    });

  const addRow = (yr, template = null) =>
    setEdits(prev => ({
      ...prev,
      [yr]: { ...prev[yr], utilization: [...(prev[yr]?.utilization || []), template ? { ...template } : EMPTY_UTIL_ROW()] },
    }));

  const removeRow = (yr, idx) => {
    setEdits(prev => {
      const rows = [...(prev[yr]?.utilization || [])];
      rows[idx] = { ...rows[idx], _remove: !rows[idx]._remove };
      return { ...prev, [yr]: { ...prev[yr], utilization: rows } };
    });
  };

  const handleSave = async () => {
    if (selectedYear == null) return;
    setSaving(true); setStatus(null);
    try {
      const e = edits[selectedYear] || {};
      const allRows = e.utilization || [];
      // Delete rows marked for removal that exist in DB
      await Promise.all(
        allRows
          .filter(r => r._remove && r.application && (data[selectedYear]?.utilization || []).some(s => s.application === r.application))
          .map(r => fetch(`/api/fleet-details/${selectedYear}/${encodeURIComponent(r.application)}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
          }))
      );
      await fetch(`/api/fleet-details/${selectedYear}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          utilization: allRows.filter(r => !r._remove && r.application).map(r => ({
            application:      r.application,
            tractors:         r.tractors       !== '' ? parseInt(r.tractors)        : null,
            trailers:         r.trailers        !== '' ? parseInt(r.trailers)        : null,
            grossed_out_perc: pctRatio(r.grossed_out_pct),
            cubed_out_perc:   pctRatio(r.cubed_out_pct),
            ave_length_haul:  r.ave_length_haul !== '' ? parseInt(r.ave_length_haul) : null,
            empty_miles_perc: pctRatio(r.empty_miles_pct),
          })),
        }),
      });
      await loadData();
      setStatus('saved');
      onSave?.();
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const UTIL_COLS = [
    { key: 'tractors',        label: 'Tractors',      type: 'int' },
    { key: 'trailers',        label: 'Trailers',      type: 'int' },
    { key: 'grossed_out_pct', label: 'Grossed Out %', type: 'pct', dbKey: 'grossed_out_perc' },
    { key: 'cubed_out_pct',   label: 'Cubed Out %',   type: 'pct', dbKey: 'cubed_out_perc'   },
    { key: 'ave_length_haul', label: 'Avg Haul (mi)', type: 'int' },
    { key: 'empty_miles_pct', label: 'Empty Miles %', type: 'pct', dbKey: 'empty_miles_perc' },
  ];

  // All non-empty utilization rows across all years for copy picker
  const allExistingRows = Object.entries(edits)
    .sort(([a], [b]) => b - a)
    .flatMap(([yr, yd]) =>
      (yd.utilization || [])
        .filter(r => r.application)
        .map(r => ({ year: parseInt(yr), row: r }))
    );

  const utilRows = (edits[selectedYear] || {}).utilization || [];
  const isSelectedEditable = editableYears.includes(selectedYear) && !submittedYears.includes(selectedYear);

  return (
    <div style={styles.chartCard}>
      {/* Header */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8}}>
        <h3 style={{...styles.chartTitle, marginBottom:0}}>Equipment Utilization</h3>
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          {[...years].sort((a, b) => a - b).map(yr => {
            const yrEditable = editableYears.includes(yr) && !submittedYears.includes(yr);
            const isSelected = yr === selectedYear;
            return (
              <button key={yr} onClick={() => setSelectedYear(yr)} style={{
                padding:'4px 14px', borderRadius:6, border:'1px solid',
                fontSize:13, cursor:'pointer', fontWeight: isSelected ? 700 : 400,
                borderColor: isSelected ? '#1c3660' : yrEditable ? '#1c3660' : '#D1D5DB',
                background:  isSelected ? '#1c3660' : yrEditable ? '#EFF6FF' : '#fff',
                color:       isSelected ? '#fff'    : yrEditable ? '#1c3660' : '#374151',
              }}>{yr}{yrEditable ? ' ✎' : ''}</button>
            );
          })}
          {status === 'saved' && <span style={{color:'#16a34a', fontSize:13}}>Saved.</span>}
          {status === 'error'  && <span style={{color:'#dc2626', fontSize:13}}>Error saving.</span>}
          {submittedYears.includes(selectedYear) ? (
            <button style={{...styles.btnPrimary, opacity: 0.5}} disabled>Submitted</button>
          ) : (
            <button style={{...styles.btnPrimary, opacity: saving ? 0.7 : 1}} onClick={handleSave} disabled={saving || !isSelectedEditable}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      <div style={{overflowX:'auto', marginBottom:12}}>
        <table style={styles.detailTable}>
          <thead>
            <tr>
              <th style={{...styles.detailTh, minWidth:70}}></th>
              <th style={{...styles.detailThLabel, minWidth:180}}>Application</th>
              {UTIL_COLS.map(c => <th key={c.key} style={styles.detailTh}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {utilRows.length === 0
              ? <tr><td colSpan={UTIL_COLS.length + 2} style={{...styles.detailTd, color:'#9CA3AF', textAlign:'center'}}>No data</td></tr>
              : utilRows.map((row, idx) => (
                <tr key={idx} style={row._remove ? {opacity:0.45} : {}}>
                  <td style={{...styles.detailTd, textAlign:'center'}}>
                    {isSelectedEditable && (
                      <button onClick={() => removeRow(selectedYear, idx)} style={{
                        background: row._remove ? '#FEF3C7' : '#FEE2E2',
                        border: `1px solid ${row._remove ? '#FCD34D' : '#FECACA'}`,
                        color: row._remove ? '#92400E' : '#DC2626',
                        borderRadius:4, padding:'2px 8px', fontSize:12, cursor:'pointer', whiteSpace:'nowrap',
                      }}>{row._remove ? 'Undo' : 'Remove'}</button>
                    )}
                  </td>
                  <td style={{...styles.detailTdLabel, ...styles.detailTdEditable}}>
                    <select style={{...styles.detailInput, textAlign:'left'}}
                      value={row.application}
                      onChange={e => setUtilCell(selectedYear, idx, 'application', e.target.value)}
                      disabled={!isSelectedEditable}>
                      <option value="">— select —</option>
                      {APPLICATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  {UTIL_COLS.map(col => (
                    <td key={col.key} style={{...styles.detailTd, ...styles.detailTdEditable}}>
                      <input style={styles.detailInput} type="number"
                        value={row[col.key] ?? ''}
                        onChange={e => setUtilCell(selectedYear, idx, col.key, e.target.value)}
                        placeholder="—" disabled={!isSelectedEditable} />
                    </td>
                  ))}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* Add / Copy row controls */}
      {isSelectedEditable && <div style={{display:'flex', gap:8, marginBottom:20, alignItems:'flex-start'}}>
        <button onClick={() => addRow(selectedYear)} style={{...styles.btnGhost, fontSize:13}}>+ Add Row</button>
        <div style={{position:'relative'}}>
          <button onClick={() => setShowCopyPicker(p => !p)} style={{...styles.btnGhost, fontSize:13}}>
            + Copy from Existing
          </button>
          {showCopyPicker && (
            <div style={{position:'absolute', top:'100%', left:0, marginTop:4, background:'#fff', border:'1px solid #D1D5DB', borderRadius:8, boxShadow:'0 4px 20px rgba(0,0,0,0.15)', zIndex:200, minWidth:360, maxHeight:300, overflowY:'auto'}}>
              {allExistingRows.length === 0
                ? <div style={{padding:16, color:'#9CA3AF', fontSize:13}}>No existing rows to copy from.</div>
                : (() => {
                    const byYear = allExistingRows.reduce((acc, item) => {
                      if (!acc[item.year]) acc[item.year] = [];
                      acc[item.year].push(item);
                      return acc;
                    }, {});
                    return Object.entries(byYear).sort(([a],[b]) => b-a).map(([yr, items]) => (
                      <div key={yr}>
                        <div style={{padding:'6px 12px', background:'#F3F4F6', fontSize:11, fontWeight:700, color:'#1c3660', textTransform:'uppercase', letterSpacing:'0.05em'}}>{yr}</div>
                        {items.map((item, i) => (
                          <button key={i} onClick={() => { addRow(selectedYear, item.row); setShowCopyPicker(false); }} style={{
                            display:'block', width:'100%', textAlign:'left', padding:'8px 14px',
                            border:'none', borderBottom:'1px solid #F3F4F6', background:'none',
                            cursor:'pointer', fontSize:13, color:'#374151',
                          }}>
                            {[item.row.application, item.row.tractors ? `${item.row.tractors} tractors` : null, item.row.trailers ? `${item.row.trailers} trailers` : null].filter(Boolean).join(' · ')}
                          </button>
                        ))}
                      </div>
                    ));
                  })()
              }
              <div style={{padding:8, borderTop:'1px solid #F3F4F6'}}>
                <button onClick={() => setShowCopyPicker(false)} style={{...styles.btnGhost, fontSize:12, width:'100%'}}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>}

    </div>
  );
}

// ─── Fuel Table ──────────────────────────────────────────────────────────────
const FUEL_OPTIONS    = ['Diesel', 'Biodiesel', 'CNG', 'LNG'];

const EMPTY_FUEL_ROW  = () => ({ fuel_type: 'Diesel', ifta_miles: '', volume: '' });

function FuelTable({ token, onSave, editableYears = [2024, 2025], submittedYears = [], minDataYear = null }) {
  const NUM_YEARS = 5;
  const editableYearsKey = editableYears.join(',');

  const [rows,         setRows]         = useState([]);
  const [edits,        setEdits]        = useState({});
  const [years,        setYears]        = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [status,       setStatus]       = useState(null);
  const [benchmarks,   setBenchmarks]   = useState({});

  const loadData = async () => {
    const r = await fetch('/api/fuel', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const data = await r.json();
    setRows(data);
    const dbYears = [...new Set(data.map(r => r.year))];
    const oldestDbYear = dbYears.length > 0 ? Math.min(...dbYears) : null;
    const floorYear = oldestDbYear ?? minDataYear;
    const visibleEditable = floorYear != null
      ? editableYears.filter(y => y >= floorYear)
      : editableYears;
    const yrList  = [...new Set([...dbYears, ...visibleEditable])].sort((a, b) => b - a).slice(0, Math.max(NUM_YEARS, visibleEditable.length + 3));
    setYears(yrList);
    setSelectedYear(prev => prev ?? Math.min(...(visibleEditable.length ? visibleEditable : yrList)));
    // Seed edits for editable years from existing data
    const init = {};
    editableYears.forEach(yr => {
      const yrRows = data.filter(r => r.year === yr);
      init[yr] = yrRows.length
        ? yrRows.map(r => ({
            mpg_id:     r.mpg_id,
            fuel_type:  r.fuel_type || 'Diesel',
            ifta_miles: r.ifta_miles ?? '',
            volume:     ['CNG','LNG'].includes(r.fuel_type) ? (r.nat_gas_dge ?? '') : (r.ifta_fuel ?? ''),
          }))
        : [EMPTY_FUEL_ROW()];
    });
    setEdits(init);
  };

  useEffect(() => { if (token) loadData(); }, [token, editableYearsKey]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/fuel/benchmarks', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : {})
      .then(b => setBenchmarks(b))
      .catch(() => {});
  }, [token]);

  const isEditable = editableYears.includes(selectedYear) && !submittedYears.includes(selectedYear);

  const setCell = (yr, idx, field, val) =>
    setEdits(prev => {
      const r = [...(prev[yr] || [])];
      r[idx] = { ...r[idx], [field]: val };
      return { ...prev, [yr]: r };
    });

  const addRow    = (yr) => setEdits(prev => ({ ...prev, [yr]: [...(prev[yr] || []), EMPTY_FUEL_ROW()] }));
  const removeRow = (yr, idx) => {
    setEdits(prev => {
      const r = [...(prev[yr] || [])];
      r[idx] = { ...r[idx], _remove: !r[idx]._remove };
      return { ...prev, [yr]: r };
    });
  };

  const handleSave = async () => {
    if (!isEditable) return;
    setSaving(true); setStatus(null);
    try {
      const allRows = edits[selectedYear] || [];
      // Delete rows marked for removal that exist in DB
      await Promise.all(
        allRows
          .filter(r => r._remove && r.mpg_id)
          .map(r => fetch(`/api/fuel/row/${r.mpg_id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
          }))
      );
      const saveRows = allRows.filter(r => !r._remove && r.fuel_type);
      await fetch(`/api/fuel/${selectedYear}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: saveRows }),
      });
      await loadData();
      setStatus('saved');
      onSave?.();
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // Rows to display for selected year
  const displayRows = isEditable
    ? (edits[selectedYear] || [])
    : rows.filter(r => r.year === selectedYear);


  return (
    <div style={styles.chartCard}>
      {/* Header */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8}}>
        <h3 style={{...styles.chartTitle, marginBottom:0}}>Fuel (IFTA)</h3>
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          {[...years].sort((a, b) => a - b).map(yr => {
            const yrEditable = editableYears.includes(yr) && !submittedYears.includes(yr);
            const isSelected = yr === selectedYear;
            return (
              <button key={yr} onClick={() => setSelectedYear(yr)} style={{
                padding:'4px 14px', borderRadius:6, border:'1px solid',
                fontSize:13, cursor:'pointer', fontWeight: isSelected ? 700 : 400,
                borderColor: isSelected ? '#1c3660' : yrEditable ? '#1c3660' : '#D1D5DB',
                background:  isSelected ? '#1c3660' : yrEditable ? '#EFF6FF' : '#fff',
                color:       isSelected ? '#fff'    : yrEditable ? '#1c3660' : '#374151',
              }}>{yr}{yrEditable ? ' ✎' : ''}</button>
            );
          })}
          {status === 'saved' && <span style={{color:'#16a34a', fontSize:13}}>Saved.</span>}
          {status === 'error'  && <span style={{color:'#dc2626', fontSize:13}}>Error saving.</span>}
          {submittedYears.includes(selectedYear) ? (
            <button style={{...styles.btnPrimary, opacity: 0.5}} disabled>Submitted</button>
          ) : isEditable ? (
            <button style={{...styles.btnPrimary, opacity: saving ? 0.7 : 1}} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          ) : null}
        </div>
      </div>

      <div style={{overflowX:'auto'}}>
        <table style={styles.detailTable}>
          <thead>
            <tr>
              {isEditable && <th style={{...styles.detailTh, minWidth:70}}></th>}
              <th style={{...styles.detailTh, minWidth:130}}>Fuel Type</th>
              <th style={{...styles.detailTh, minWidth:110}}>IFTA Miles</th>
              <th style={{...styles.detailTh, minWidth:110}}>IFTA Gallons / DGE</th>
              <th style={{...styles.detailTh, minWidth:80}}>MPG</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0
              ? <tr><td colSpan={isEditable ? 5 : 4} style={{...styles.detailTd, color:'#9CA3AF', textAlign:'center'}}>No data for this year</td></tr>
              : displayRows.map((row, idx) => {
                  const isCng = ['CNG','LNG'].includes(row.fuel_type);
                  const vol = row.volume != null ? row.volume : (isCng ? row.nat_gas_dge : row.ifta_fuel);
                  const miles = parseFloat(row.ifta_miles), galDge = parseFloat(vol);
                  const mpgNum = miles > 0 && galDge > 0 ? miles / galDge : null;
                  const mpgVal = mpgNum != null ? mpgNum.toFixed(2) : null;
                  const mpgAlert = getMpgAlert(mpgNum, benchmarks, row.fuel_type);
                  const b = benchmarks[row.fuel_type];
                  const alertMsg = mpgAlert === 'low'
                    ? `MPG is less than 25% of the ${row.fuel_type} fleet average (${b?.avg_mpg?.toFixed(2)}). Please check your entries.`
                    : mpgAlert === 'high'
                    ? `MPG is more than double the ${row.fuel_type} fleet average (${b?.avg_mpg?.toFixed(2)}). Please check your entries.`
                    : null;
                  return (
                    <tr key={idx} style={row._remove ? {opacity:0.45} : {}}>
                      {isEditable && (
                        <td style={{...styles.detailTd, textAlign:'center'}}>
                          <button onClick={() => removeRow(selectedYear, idx)} style={{
                            background: row._remove ? '#FEF3C7' : '#FEE2E2',
                            border: `1px solid ${row._remove ? '#FCD34D' : '#FECACA'}`,
                            color: row._remove ? '#92400E' : '#DC2626',
                            borderRadius:4, padding:'2px 8px', fontSize:12, cursor:'pointer',
                          }}>{row._remove ? 'Undo' : 'Remove'}</button>
                        </td>
                      )}
                      <td style={{...styles.detailTd, ...(isEditable ? styles.detailTdEditable : {})}}>
                        {isEditable ? (
                          <select style={{...styles.detailInput, textAlign:'left'}}
                            value={row.fuel_type}
                            onChange={e => setCell(selectedYear, idx, 'fuel_type', e.target.value)}>
                            {FUEL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : row.fuel_type || '—'}
                      </td>
                      <td style={{...styles.detailTd, ...(isEditable ? styles.detailTdEditable : {})}}>
                        {isEditable ? (
                          <input style={styles.detailInput} type="number"
                            value={row.ifta_miles ?? ''}
                            onChange={e => setCell(selectedYear, idx, 'ifta_miles', e.target.value)}
                            placeholder="—" />
                        ) : row.ifta_miles != null ? fmt(row.ifta_miles) : '—'}
                      </td>
                      <td style={{...styles.detailTd, ...(isEditable ? styles.detailTdEditable : {})}}>
                        {isEditable ? (
                          <div style={{display:'flex', alignItems:'center', gap:4}}>
                            <input style={{...styles.detailInput, width:130}} type="number"
                              value={row.volume ?? ''}
                              onChange={e => setCell(selectedYear, idx, 'volume', e.target.value)}
                              placeholder="—" />
                            <span style={{fontSize:11, color:'#6B7280', whiteSpace:'nowrap'}}>{isCng ? 'DGE' : 'gal'}</span>
                          </div>
                        ) : (() => {
                          const v = isCng ? row.nat_gas_dge : row.ifta_fuel;
                          return v != null ? `${fmt(v)} ${isCng ? 'DGE' : 'gal'}` : '—';
                        })()}
                      </td>
                      <td style={{...styles.detailTd, textAlign:'center', fontSize:13}}>
                        <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:4}}>
                          <span style={{fontWeight: mpgVal ? 600 : 400, color: mpgAlert ? '#DC2626' : mpgVal ? '#1c3660' : '#9CA3AF'}}>
                            {mpgVal ?? '—'}
                          </span>
                          {alertMsg && (
                            <span title={alertMsg} style={{cursor:'help', fontSize:14, color:'#DC2626', lineHeight:1}}>⚠</span>
                          )}
                        </div>
                        {alertMsg && (
                          <div style={{fontSize:10, color:'#DC2626', maxWidth:140, lineHeight:1.3, marginTop:2}}>{alertMsg}</div>
                        )}
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>

      {isEditable && (
        <button onClick={() => addRow(selectedYear)} style={{...styles.btnGhost, fontSize:13, marginTop:12}}>+ Add Row</button>
      )}
    </div>
  );
}

// ─── Fleet Equipment Table ────────────────────────────────────────────────────
const EMPTY_EQUIP_ROW = () => ({
  qty: '', cab_type: '', tractor_make: '', tractor_model: '',
  engine_make: '', engine_model: '', engine_rating: '',
  transmission_make: '', transmission_model: '',
  axle_make: '', axle_model: '', axle_ratio: '',
});

// Engine make restrictions by tractor make. null = N/A (electric/fuel cell), undefined = show all
const ENGINE_MAKE_LIMITS = {
  'Freightliner': ['Detroit', 'Cummins'],
  'Kenworth':     ['Paccar', 'Cummins'],
  'Peterbilt':    ['Paccar', 'Cummins'],
  'Volvo':        ['Volvo', 'Cummins'],
  'International':['International', 'Cummins'],
  'Tesla':        null,
  'Hyundai':      null,
};
// Specific make+model combos that are electric/fuel-cell (engine = N/A)
const NA_MODELS = new Set(['Freightliner:eCascadia', 'Kenworth:T680e']);

// Reusable dropdown that falls back to a text input when "Other" is chosen.
// External resets are handled by re-keying EquipCell, which remounts this component.
function SelectOrOther({ options, value, onChange, placeholder = '—', inputType = 'text', width, disabled = false }) {
  const [isOther, setIsOther] = useState(() => value !== '' && value != null && !options.includes(value));
  const inputStyle = { border:'1px solid #D1D5DB', borderRadius:4, padding:'3px 6px', fontSize:13, background:'#fff', width: width || '100%', boxSizing:'border-box' };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:3}}>
      <select value={isOther ? '__other__' : (value || '')} onChange={e => {
        if (e.target.value === '__other__') { setIsOther(true); }
        else { setIsOther(false); onChange(e.target.value); }
      }} style={inputStyle} disabled={disabled}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
        <option value="__other__">Other</option>
      </select>
      {isOther && (
        <input type={inputType} value={value} onChange={e => onChange(e.target.value)}
          placeholder="Enter manually…" style={{...inputStyle, borderColor:'#A41C24'}} autoFocus disabled={disabled} />
      )}
    </div>
  );
}

const EQUIP_COLS = [
  { key: 'qty',                label: 'Qty',           width: 65  },
  { key: 'cab_type',           label: 'Cab Type',      width: 120 },
  { key: 'tractor_make',       label: 'Tractor Make',  width: 140 },
  { key: 'tractor_model',      label: 'Tractor Model', width: 150 },
  { key: 'engine_make',        label: 'Engine Make',   width: 130 },
  { key: 'engine_model',       label: 'Engine Model',  width: 130 },
  { key: 'engine_rating',      label: 'Engine Rating', width: 110 },
  { key: 'transmission_make',  label: 'Trans Make',    width: 110 },
  { key: 'transmission_model', label: 'Trans Model',   width: 120 },
  { key: 'axle_make',          label: 'Axle Make',     width: 100 },
  { key: 'axle_model',         label: 'Axle Model',    width: 100 },
  { key: 'axle_ratio',         label: 'Axle Ratio',    width: 90  },
];

function EquipCell({ colKey, row, onChange, makeModels, engineModels, disabled = false }) {
  const tractorMake = row.tractor_make;
  const engineMake  = row.engine_make;
  const isNA        = ENGINE_MAKE_LIMITS[tractorMake] === null || NA_MODELS.has(`${tractorMake}:${row.tractor_model}`);
  const inputStyle  = { border:'1px solid #D1D5DB', borderRadius:4, padding:'3px 6px', fontSize:13, width:'100%', boxSizing:'border-box' };

  if (colKey === 'qty') {
    return <input type="number" value={row.qty ?? ''} onChange={e => onChange(e.target.value)}
      placeholder="0" style={{...inputStyle, textAlign:'center'}} disabled={disabled} />;
  }
  if (colKey === 'cab_type') {
    return <SelectOrOther options={['Day Cab', 'Sleeper']} value={row.cab_type} onChange={onChange} placeholder="— select —" disabled={disabled} />;
  }
  if (colKey === 'tractor_make') {
    const makes = [...new Set(makeModels.map(m => m.make))];
    return <SelectOrOther options={makes} value={row.tractor_make} onChange={onChange} placeholder="— select —" disabled={disabled} />;
  }
  if (colKey === 'tractor_model') {
    const models = makeModels.filter(m => m.make === tractorMake).map(m => m.model);
    return models.length
      ? <SelectOrOther options={models} value={row.tractor_model} onChange={onChange} placeholder="— select —" disabled={disabled} />
      : <input type="text" value={row.tractor_model ?? ''} onChange={e => onChange(e.target.value)} placeholder="Model" style={inputStyle} disabled={disabled} />;
  }
  if (colKey === 'engine_make') {
    if (isNA) return <span style={{color:'#9CA3AF', fontSize:13}}>N/A</span>;
    const restricted = ENGINE_MAKE_LIMITS[tractorMake];
    const allMakes   = [...new Set(engineModels.map(e => e.make))];
    return <SelectOrOther options={restricted || allMakes} value={row.engine_make} onChange={onChange} placeholder="— select —" disabled={disabled} />;
  }
  if (colKey === 'engine_model') {
    if (isNA) return <span style={{color:'#9CA3AF', fontSize:13}}>N/A</span>;
    const models = engineModels.filter(e => e.make === engineMake).map(e => e.model);
    return models.length
      ? <SelectOrOther options={models} value={row.engine_model} onChange={onChange} placeholder="— select —" disabled={disabled} />
      : <input type="text" value={row.engine_model ?? ''} onChange={e => onChange(e.target.value)} placeholder="Model" style={inputStyle} disabled={disabled} />;
  }
  if (colKey === 'axle_ratio') {
    return <input type="number" step="0.01" value={row.axle_ratio ?? ''} onChange={e => onChange(e.target.value)}
      placeholder="0.00" style={{...inputStyle, textAlign:'center'}} disabled={disabled} />;
  }
  // default: free text
  return <input type="text" value={row[colKey] ?? ''} onChange={e => onChange(e.target.value)}
    placeholder="—" style={inputStyle} disabled={disabled} />;
}

function FleetEquipTable({ token, onSave, editableYears = [2024, 2025], submittedYears = [], minDataYear = null }) {
  const editableYearsKey = editableYears.join(',');
  const [data,         setData]         = useState({});
  const [edits,        setEdits]        = useState({});
  const [years,        setYears]        = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [status,       setStatus]       = useState(null);
  const [makeModels,   setMakeModels]   = useState([]);
  const [engineModels, setEngineModels] = useState([]);

  const loadData = async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const [refRes, equipRes] = await Promise.all([
      fetch('/api/fleet-equip/reference', { headers }),
      fetch('/api/fleet-equip',           { headers }),
    ]);
    if (refRes.ok) {
      const ref = await refRes.json();
      setMakeModels(ref.makeModels   || []);
      setEngineModels(ref.engineModels || []);
    }
    if (!equipRes.ok) return;
    const d = await equipRes.json();
    setData(d);
    const dbYears = Object.keys(d).map(Number);
    const oldestDbYear = dbYears.length > 0 ? Math.min(...dbYears) : null;
    const floorYear = oldestDbYear ?? minDataYear;
    const visibleEditable = floorYear != null
      ? editableYears.filter(y => y >= floorYear)
      : editableYears;
    const yrList = [...new Set([...dbYears, ...visibleEditable])].sort((a, b) => b - a);
    setYears(yrList);
    setSelectedYear(prev => prev ?? Math.min(...(visibleEditable.length ? visibleEditable : yrList)));
    const init = {};
    yrList.forEach(yr => { init[yr] = (d[yr] || []).map(row => ({ ...row })); });
    editableYears.forEach(yr => { if (!init[yr] || init[yr].length === 0) init[yr] = [EMPTY_EQUIP_ROW()]; });
    setEdits(init);
  };

  useEffect(() => { if (token) loadData(); }, [token, editableYearsKey, minDataYear]);

  useEffect(() => {
    if (selectedYear == null) return;
    setEdits(prev => prev[selectedYear] ? prev : { ...prev, [selectedYear]: [EMPTY_EQUIP_ROW()] });
    setYears(prev => prev.includes(selectedYear) ? prev : [...prev, selectedYear].sort((a, b) => b - a));
  }, [selectedYear]);

  const setCell = (yr, idx, field, val) =>
    setEdits(prev => {
      const rows = [...(prev[yr] || [])];
      if (field === 'tractor_make') rows[idx] = { ...rows[idx], tractor_make: val, tractor_model: '', engine_make: '', engine_model: '' };
      else if (field === 'engine_make') rows[idx] = { ...rows[idx], engine_make: val, engine_model: '' };
      else rows[idx] = { ...rows[idx], [field]: val };
      return { ...prev, [yr]: rows };
    });

  const addRow = (yr, template = null) =>
    setEdits(prev => ({
      ...prev,
      [yr]: [...(prev[yr] || []), template ? { ...template, fleet_equip_id: undefined } : EMPTY_EQUIP_ROW()],
    }));

  const removeRow = (yr, idx) => {
    setEdits(prev => {
      const rows = [...(prev[yr] || [])];
      rows[idx] = { ...rows[idx], _remove: !rows[idx]._remove };
      return { ...prev, [yr]: rows };
    });
  };

  const handleSave = async () => {
    if (selectedYear == null) return;
    setSaving(true); setStatus(null);
    try {
      const allRows = edits[selectedYear] || [];
      // Delete rows marked for removal that exist in DB
      await Promise.all(
        allRows
          .filter(r => r._remove && r.fleet_equip_id)
          .map(r => fetch(`/api/fleet-equip/row/${r.fleet_equip_id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
          }))
      );
      const rows = allRows.filter(r => !r._remove && (r.qty || r.tractor_make || r.cab_type));
      await fetch(`/api/fleet-equip/${selectedYear}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows }),
      });
      await loadData();
      setStatus('saved');
      onSave?.();
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // Build flat list of all non-empty rows across all years for the copy picker
  const allExistingRows = Object.entries(edits)
    .sort(([a], [b]) => b - a)
    .flatMap(([yr, rows]) =>
      rows
        .filter(r => !r._remove && (r.tractor_make || r.cab_type || r.qty))
        .map(r => ({ year: parseInt(yr), row: r }))
    );

  const [showCopyPicker, setShowCopyPicker] = useState(false);

  const copyRow = (sourceRow) => {
    addRow(selectedYear, sourceRow);
    setShowCopyPicker(false);
  };

  const displayRows       = edits[selectedYear] || data[selectedYear] || [];
  const allYearsForTabs   = [...years].sort((a, b) => a - b);
  const isSelectedEditable = editableYears.includes(selectedYear) && !submittedYears.includes(selectedYear);

  return (
    <div style={styles.chartCard}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8}}>
        <h3 style={{...styles.chartTitle, marginBottom:0}}>Fleet Equipment</h3>
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          {allYearsForTabs.map(yr => {
            const yrEditable = editableYears.includes(yr) && !submittedYears.includes(yr);
            const isSelected = yr === selectedYear;
            return (
              <button key={yr} onClick={() => setSelectedYear(yr)} style={{
                padding:'4px 14px', borderRadius:6, border:'1px solid',
                fontSize:13, cursor:'pointer', fontWeight: isSelected ? 700 : 400,
                borderColor: isSelected ? '#1c3660' : yrEditable ? '#1c3660' : '#D1D5DB',
                background:  isSelected ? '#1c3660' : yrEditable ? '#EFF6FF' : '#fff',
                color:       isSelected ? '#fff'    : yrEditable ? '#1c3660' : '#374151',
              }}>{yr}{yrEditable ? ' ✎' : ''}</button>
            );
          })}
          {status === 'saved' && <span style={{color:'#16a34a', fontSize:13}}>Saved.</span>}
          {status === 'error'  && <span style={{color:'#dc2626', fontSize:13}}>Error saving.</span>}
          {submittedYears.includes(selectedYear) ? (
            <button style={{...styles.btnPrimary, opacity: 0.5}} disabled>Submitted</button>
          ) : (
            <button style={{...styles.btnPrimary, opacity: saving ? 0.7 : 1}} onClick={handleSave} disabled={saving || !isSelectedEditable}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      <div style={{overflowX:'auto'}}>
        <table style={styles.detailTable}>
          <thead>
            <tr>
              <th style={{...styles.detailTh, minWidth:70}}></th>
              {EQUIP_COLS.map(c => <th key={c.key} style={{...styles.detailTh, minWidth: c.width}}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0
              ? <tr><td colSpan={EQUIP_COLS.length + 1} style={{...styles.detailTd, color:'#9CA3AF', textAlign:'center'}}>No data for this year</td></tr>
              : displayRows.map((row, idx) => (
                <tr key={idx} style={row._remove ? {opacity:0.45} : {}}>
                  <td style={{...styles.detailTd, textAlign:'center'}}>
                    {isSelectedEditable && (
                      <button onClick={() => removeRow(selectedYear, idx)} style={{
                        background: row._remove ? '#FEF3C7' : '#FEE2E2',
                        border: `1px solid ${row._remove ? '#FCD34D' : '#FECACA'}`,
                        color: row._remove ? '#92400E' : '#DC2626',
                        borderRadius:4, padding:'2px 8px', fontSize:12, cursor:'pointer', whiteSpace:'nowrap',
                      }}>{row._remove ? 'Undo' : 'Remove'}</button>
                    )}
                  </td>
                  {EQUIP_COLS.map(col => (
                    <td key={col.key} style={{...styles.detailTd, ...styles.detailTdEditable, verticalAlign:'top'}}>
                      <EquipCell
                        key={`${idx}-${col.key}-${row.tractor_make}-${row.engine_make}`}
                        colKey={col.key}
                        row={row}
                        onChange={val => setCell(selectedYear, idx, col.key, val)}
                        makeModels={makeModels}
                        engineModels={engineModels}
                        disabled={!isSelectedEditable}
                      />
                    </td>
                  ))}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* Add row / Copy row controls */}
      {isSelectedEditable && <div style={{display:'flex', gap:8, marginTop:12, alignItems:'flex-start'}}>
        <button onClick={() => addRow(selectedYear)} style={{...styles.btnGhost, fontSize:13}}>+ Add Row</button>
        <div style={{position:'relative'}}>
          <button onClick={() => setShowCopyPicker(p => !p)} style={{...styles.btnGhost, fontSize:13}}>
            + Copy from Existing
          </button>
          {showCopyPicker && (
            <div style={{position:'absolute', top:'100%', left:0, marginTop:4, background:'#fff', border:'1px solid #D1D5DB', borderRadius:8, boxShadow:'0 4px 20px rgba(0,0,0,0.15)', zIndex:200, minWidth:380, maxHeight:320, overflowY:'auto'}}>
              {allExistingRows.length === 0
                ? <div style={{padding:16, color:'#9CA3AF', fontSize:13}}>No existing rows to copy from.</div>
                : (() => {
                    const byYear = allExistingRows.reduce((acc, item) => {
                      if (!acc[item.year]) acc[item.year] = [];
                      acc[item.year].push(item);
                      return acc;
                    }, {});
                    return Object.entries(byYear).sort(([a],[b]) => b-a).map(([yr, items]) => (
                      <div key={yr}>
                        <div style={{padding:'6px 12px', background:'#F3F4F6', fontSize:11, fontWeight:700, color:'#1c3660', textTransform:'uppercase', letterSpacing:'0.05em'}}>
                          {yr}
                        </div>
                        {items.map((item, i) => (
                          <button key={i} onClick={() => copyRow(item.row)} style={{
                            display:'block', width:'100%', textAlign:'left', padding:'8px 14px',
                            border:'none', borderBottom:'1px solid #F3F4F6', background:'none',
                            cursor:'pointer', fontSize:13, color:'#374151',
                          }}>
                            {[item.row.tractor_make, item.row.tractor_model, item.row.cab_type, item.row.qty ? `qty: ${item.row.qty}` : null].filter(Boolean).join(' · ')}
                          </button>
                        ))}
                      </div>
                    ));
                  })()
              }
              <div style={{padding:8, borderTop:'1px solid #F3F4F6'}}>
                <button onClick={() => setShowCopyPicker(false)} style={{...styles.btnGhost, fontSize:12, width:'100%'}}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}

function DataEntryForm({ fleet, categories = {}, prevTech = {}, generalData = {}, onCancel, onSave }) {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const prevGeneral = generalData[prevYear] || {};
  // build list of all tech entries from categories
  const allTechs = Object.entries(categories).flatMap(([cat, arr]) => arr.map(t => ({...t, category: cat})));

  const [step, setStep] = useState(0); // 0=general, 1=techs, 2=review
  const [general, setGeneral] = useState({
    sleepers: "",
    dayCabs: "",
    trailers: "",
    ecmMiles: "",
    ecmFuel: "",
  });
  const [techs, setTechs] = useState(() => {
    const init = {};
    allTechs.forEach(t => { init[t.key] = prevTech[t.key] != null ? String(Math.round(prevTech[t.key]*100)) : ""; });
    return init;
  });

  const setG = (k, v) => setGeneral(p => ({...p, [k]: v}));
  const setT = (k, v) => setTechs(p => ({...p, [k]: v}));

  const steps = ["Fleet Metrics", "Technology Adoption", "Review & Submit"];

  return (
    <div style={styles.entryOverlay}>
      <div style={styles.entryModal}>
        <div style={styles.entryHeader}>
          <div>
            <h2 style={styles.entryTitle}>{currentYear} Data Entry</h2>
            <p style={styles.entrySub}>{fleet.name}</p>
          </div>
          <button style={styles.btnClose} onClick={onCancel}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={styles.stepRow}>
          {steps.map((s, i) => (
            <div key={i} style={styles.stepItem}>
              <div style={{
                ...styles.stepDot,
                background: i <= step ? "#A41C24" : "#F3F4F6",
                color: i <= step ? "#FFFFFF" : "#9CA3AF"
              }}>{i < step ? "✓" : i+1}</div>
              <span style={{...styles.stepLabel, color: i === step ? "#A41C24" : "#9CA3AF"}}>{s}</span>
              {i < steps.length-1 && <div style={{...styles.stepLine, background: i < step ? "#A41C24" : "#E5E7EB"}} />}
            </div>
          ))}
        </div>

        <div style={styles.entryBody}>
          {step === 0 && (
            <div>
              <p style={styles.entryNote}>
                Previous year ({prevYear}) shown in grey. Update any values that changed.
              </p>
              <div style={styles.entryGrid}>
                {[
                  {k:"sleepers", label:"Sleeper Tractors Purchased", prev: prevGeneral.sleepers, unit:""},
                  {k:"dayCabs",  label:"Day Cab Tractors Purchased",  prev: prevGeneral.dayCabs,  unit:""},
                  {k:"trailers", label:"Trailers Purchased",           prev: prevGeneral.trailers, unit:""},
                  {k:"ecmMiles", label:"ECM Miles (total fleet)",      prev: prevGeneral.ecmMiles, unit:""},
                  {k:"ecmFuel",  label:"ECM Fuel (gallons)",           prev: prevGeneral.ecmFuel,  unit:""},
                ].map(({k, label, prev}) => (
                  <div key={k} style={styles.entryField}>
                    <label style={styles.entryLabel}>{label}</label>
                    <div style={styles.entryInputRow}>
                      <span style={styles.entryPrev}>{fmt(prev) || prev}</span>
                      <span style={styles.entryArrow}>→</span>
                      <input
                        style={styles.entryInput}
                        type="number"
                        value={general[k]}
                        onChange={e => setG(k, e.target.value)}
                        placeholder={`Enter ${currentYear} value`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <p style={styles.entryNote}>
                Values are % of fleet (0–100). Pre-filled from {prevYear}. Update any that changed.
              </p>
              {Object.entries(categories).map(([cat, techs_]) => (
                <div key={cat} style={styles.techSection}>
                  <h4 style={styles.techCatHead}>{cat}</h4>
                  <div style={styles.techGrid}>
                    {techs_.map(tech => (
                      <div key={tech.key} style={styles.techField}>
                        <label style={styles.techLabel} title={tech.desc}>
                          {tech.label}
                          <span style={styles.infoIcon} title={tech.desc}>ⓘ</span>
                        </label>
                        <div style={styles.entryInputRow}>
                          <span style={styles.entryPrev}>{pct(prevTech[tech.key])}</span>
                          <span style={styles.entryArrow}>→</span>
                          <div style={styles.pctInputWrap}>
                            <input
                              style={styles.techInput}
                              type="number"
                              min="0" max="100"
                              value={techs[tech.key]}
                              onChange={e => setT(tech.key, e.target.value)}
                              placeholder="0–100"
                            />
                            <span style={styles.pctSign}>%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div>
              <p style={styles.entryNote}>Review your entries before submitting. You can go back to make changes.</p>
              <div style={styles.reviewSection}>
                <h4 style={styles.techCatHead}>Fleet Metrics — {currentYear}</h4>
                <div style={styles.reviewGrid}>
                  {[
                    ["Sleeper Tractors", general.sleepers || "—"],
                    ["Day Cabs",         general.dayCabs  || "—"],
                    ["Trailers",         general.trailers || "—"],
                    ["ECM Miles",        general.ecmMiles || "—"],
                    ["ECM Fuel (gal)",   general.ecmFuel  || "—"],
                  ].map(([l,v]) => (
                    <div key={l} style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>{l}</span>
                      <span style={styles.reviewValue}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={styles.reviewSection}>
                <h4 style={styles.techCatHead}>Technology Adoption — changed from {prevYear}</h4>
                <div style={styles.reviewGrid}>
                  {allTechs
                    .filter(t => techs[t.key] !== "" && String(Math.round((prevTech[t.key]??0)*100)) !== techs[t.key])
                    .map(t => (
                      <div key={t.key} style={styles.reviewItem}>
                        <span style={styles.reviewLabel}>{t.label}</span>
                        <span style={styles.reviewValue}>
                          {pct(prevTech[t.key])} → <strong style={{color:"#F5A623"}}>{techs[t.key]}%</strong>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={styles.entryFooter}>
          {step > 0 && (
            <button style={styles.btnGhost} onClick={() => setStep(s => s-1)}>← Back</button>
          )}
          <div style={{flex:1}} />
          {step < 2
            ? <button style={styles.btnPrimary} onClick={() => setStep(s => s+1)}>Continue →</button>
            : <button style={styles.btnSuccess} onClick={() => { alert("Submission saved! (Connect to POST /api/submissions)"); onSave(); }}>
                ✓ Submit {currentYear} Data
              </button>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Admin View ──────────────────────────────────────────────────────────────

function SortHeader({ label, field, sort, setSort }) {
  const active = sort.field === field;
  const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕';
  return (
    <th
      onClick={() => setSort(s => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' }))}
      style={{ fontWeight: 600, paddingBottom: 8, paddingRight: 16, cursor: 'pointer', userSelect: 'none',
               color: active ? '#1c3660' : '#6B7280', whiteSpace: 'nowrap', fontSize: 12 }}
    >
      {label}<span style={{ opacity: active ? 1 : 0.4, fontSize: 10 }}>{arrow}</span>
    </th>
  );
}

const DUTY_CYCLES = ['RH', 'LH'];

function TechFormFields({ form, setForm, techGroups, labelStyle, inputStyle }) {
  const checkStyle = { width: 15, height: 15, cursor: 'pointer' };
  return (
    <>
      <div>
        <label style={labelStyle}>Tech Group *</label>
        <select
          style={inputStyle}
          value={form.tech_group}
          onChange={e => setForm(p => ({ ...p, tech_group: e.target.value, tech_group_new: '' }))}
          required={form.tech_group !== '__new__'}
        >
          <option value="">— Select group —</option>
          {techGroups.map(g => <option key={g} value={g}>{g}</option>)}
          <option value="__new__">New group…</option>
        </select>
        {form.tech_group === '__new__' && (
          <input
            style={{ ...inputStyle, marginTop: 6 }}
            placeholder="Enter new group name"
            value={form.tech_group_new}
            onChange={e => setForm(p => ({ ...p, tech_group_new: e.target.value }))}
            required
            autoFocus
          />
        )}
      </div>
      <div>
        <label style={labelStyle}>Technology Name *</label>
        <input style={inputStyle} value={form.technology} onChange={e => setForm(p => ({ ...p, technology: e.target.value }))} required />
      </div>
      <div>
        <label style={labelStyle}>Description *</label>
        <input style={inputStyle} value={form.tech_expl} onChange={e => setForm(p => ({ ...p, tech_expl: e.target.value }))} required />
      </div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '4px 0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" style={checkStyle} checked={form.applies_sleeper} onChange={e => setForm(p => ({ ...p, applies_sleeper: e.target.checked }))} />
          Applies to Sleeper
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" style={checkStyle} checked={form.applies_daycab} onChange={e => setForm(p => ({ ...p, applies_daycab: e.target.checked }))} />
          Applies to Day Cab
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Active From (year)</label>
          <input style={inputStyle} type="number" min="2000" max="2100" value={form.active_from} onChange={e => setForm(p => ({ ...p, active_from: e.target.value }))} placeholder={String(new Date().getFullYear())} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Active To (year) <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(blank = current)</span></label>
          <input style={inputStyle} type="number" min="2000" max="2100" value={form.active_to} onChange={e => setForm(p => ({ ...p, active_to: e.target.value }))} placeholder="Current" />
        </div>
      </div>
    </>
  );
}

// ─── Admin Charts ─────────────────────────────────────────────────────────────

const CHART_COLORS_30 = [
  '#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd',
  '#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf',
  '#393b79','#637939','#8c6d31','#843c39','#7b4173',
  '#3182bd','#e6550d','#31a354','#756bb1','#636363',
  '#6baed6','#fd8d3c','#74c476','#9e9ac8','#969696',
  '#5254a3','#6b6ecf','#9c9ede','#cedb9c','#b5cf6b',
];

/** Wraps a Recharts chart with a title bar and ↓ PNG download button. */
function AdminChartCard({ title, children }) {
  const ref = useRef(null);
  const download = () => {
    const svg = ref.current?.querySelector('svg');
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width  = width  * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      Object.assign(document.createElement('a'), {
        download: `${title}.png`, href: canvas.toDataURL('image/png'),
      }).click();
    };
    img.src = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    );
  };
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '18px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>{title}</h3>
        <button onClick={download} title="Download as PNG"
          style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6,
                   padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#374151' }}>
          ↓ PNG
        </button>
      </div>
      <div ref={ref}>{children}</div>
    </div>
  );
}

function AdminChartsPage({ token }) {
  const [groupData, setGroupData] = useState({});   // { group: { techs[], data[] } }
  const [catData,   setCatData]   = useState({ groups: [], data: [] });
  const [mpgRows,   setMpgRows]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState(null);

  useEffect(() => {
    const hdrs = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/admin/charts/adoption', { headers: hdrs }).then(r => r.json()),
      fetch('/api/admin/charts/mpg',      { headers: hdrs }).then(r => r.json()),
    ]).then(([adData, mpgData]) => {
      const techRows = adData.techRows || [];
      const catRows  = adData.catRows  || [];

      // Sorted year list from tech data
      const years = [...new Set(techRows.map(r => r.year))].sort((a, b) => a - b);

      // --- per-group datasets ---
      const byGrp = {};
      for (const r of techRows) {
        if (!byGrp[r.tech_group]) byGrp[r.tech_group] = {};
        if (!byGrp[r.tech_group][r.technology]) byGrp[r.tech_group][r.technology] = {};
        byGrp[r.tech_group][r.technology][r.year] = parseFloat(r.adoption);
      }
      const grpData = {};
      for (const [grp, techMap] of Object.entries(byGrp)) {
        const techs = Object.keys(techMap).sort();
        grpData[grp] = {
          techs,
          data: years.map(yr => {
            const pt = { year: String(yr) };
            for (const t of techs) pt[t] = techMap[t][yr] ?? null;
            return pt;
          }),
        };
      }
      setGroupData(grpData);

      // --- category data ---
      const catYrMap = {};
      for (const r of catRows) {
        if (!catYrMap[r.year]) catYrMap[r.year] = { year: String(r.year) };
        catYrMap[r.year][r.tech_group] = parseFloat(r.adoption);
      }
      const catGroups = [...new Set(catRows.map(r => r.tech_group))].sort();
      setCatData({ groups: catGroups, data: years.map(yr => catYrMap[yr] || { year: String(yr) }) });

      // --- MPG / FHWA data ---
      setMpgRows((mpgData.rows || []).map(r => ({
        year:                  String(r.year),
        'Average MPG':         r.fleet_mpg  != null ? parseFloat(r.fleet_mpg)  : null,
        'All US Trucks (FHWA)': r.fhwa_mpg  != null ? parseFloat(r.fhwa_mpg)   : null,
        'Business as Usual':   r.bau_mpg    != null ? parseFloat(r.bau_mpg)    : null,
        adoption:              r.adoption   != null ? parseFloat(r.adoption)   : null,
      })));
      setLoading(false);
    }).catch(e => { setErr(e.message); setLoading(false); });
  }, [token]);

  if (loading) return (
    <div style={{ padding: 80, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
      Loading chart data…
    </div>
  );
  if (err) return (
    <div style={{ padding: 40, color: '#DC2626', fontSize: 13 }}>Error loading charts: {err}</div>
  );

  // ── Diagnostic view ── (remove once charts render correctly)
  const techGroupList = Object.keys(groupData);
  return (
    <div style={{ maxWidth: 1280, margin: '24px auto', padding: '0 20px', fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '16px 20px', border: '1px solid #E5E7EB' }}>
        <strong>Data summary (diagnostic):</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
          <li>MPG rows: {mpgRows.length}</li>
          <li>Category groups: {catData.groups.join(', ') || '(none)'}</li>
          <li>Tech groups: {techGroupList.join(', ') || '(none)'}</li>
          {techGroupList.map(g => (
            <li key={g}>{g}: {groupData[g].techs.length} techs, {groupData[g].data.length} years</li>
          ))}
        </ul>
      </div>
    </div>
  );

  const CC = CHART_COLORS_30;
  const fmtPct = v => `${Math.round(v)}%`;
  const fmtMpg = v => `${parseFloat(v).toFixed(2)}`;
  const hasBau = mpgRows.some(r => r['Business as Usual'] != null);

  const groupOrder = ['Tractor Aerodynamics','Trailer Aerodynamics','Powertrain',
                      'Chassis','Idle Reduction','Practices'];
  const sortedGroups = [
    ...groupOrder.filter(g => groupData[g]),
    ...Object.keys(groupData).filter(g => !groupOrder.includes(g)).sort(),
  ];

  const CH = 300;
  const BH = 360;

  return (
    <div style={{ maxWidth: 1280, margin: '24px auto', padding: '0 20px',
                  display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── MPG charts (side by side) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px,1fr))', gap: 20 }}>

        <AdminChartCard title="IFTA MPG">
          <ResponsiveContainer width="100%" height={CH}>
            <LineChart data={mpgRows} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="year" stroke="#9CA3AF" tick={{ fontSize: 10 }} />
              <YAxis stroke="#9CA3AF" tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v, n) => [v != null ? `${fmtMpg(v)} mpg` : '—', n]} contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Average MPG"          stroke="#1f77b4" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="All US Trucks (FHWA)" stroke="#111"    strokeWidth={2} dot={false} connectNulls />
              {hasBau && <Line type="monotone" dataKey="Business as Usual" stroke="#d62728" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />}
            </LineChart>
          </ResponsiveContainer>
        </AdminChartCard>

        <AdminChartCard title="IFTA MPG and Adoption">
          <ResponsiveContainer width="100%" height={CH}>
            <ComposedChart data={mpgRows} margin={{ top: 8, right: 40, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="year" stroke="#9CA3AF" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left"  stroke="#9CA3AF" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#2ca02c" tick={{ fontSize: 10 }} tickFormatter={fmtPct} />
              <Tooltip formatter={(v, n) => {
                if (n === 'Adoption') return [v != null ? fmtPct(v) : '—', n];
                return [v != null ? `${fmtMpg(v)} mpg` : '—', n];
              }} contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="left"  type="monotone" dataKey="Average MPG"          stroke="#1f77b4" strokeWidth={2} dot={false} connectNulls />
              <Line yAxisId="left"  type="monotone" dataKey="All US Trucks (FHWA)" stroke="#111"    strokeWidth={2} dot={false} connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="adoption" name="Adoption" stroke="#2ca02c" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </AdminChartCard>
      </div>

      {/* ── Adoption by Category ── */}
      <AdminChartCard title="Adoption Percent by Technology Category">
        <ResponsiveContainer width="100%" height={CH}>
          <LineChart data={catData.data} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="year" stroke="#9CA3AF" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tickFormatter={fmtPct} stroke="#9CA3AF" tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v, n) => [v != null ? fmtPct(v) : '—', n]} contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {catData.groups.map((grp, i) => (
              <Line key={grp} type="monotone" dataKey={grp}
                stroke={CC[i % CC.length]} strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </AdminChartCard>

      {/* ── Per-group charts (2-column grid) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(540px,1fr))', gap: 20 }}>
        {sortedGroups.map(grp => {
          const { techs, data } = groupData[grp];
          const h = techs.length > 10 ? BH : CH;
          return (
            <AdminChartCard key={grp} title={grp}>
              <ResponsiveContainer width="100%" height={h}>
                <LineChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="year" stroke="#9CA3AF" tick={{ fontSize: 9 }} />
                  <YAxis domain={[0, 100]} tickFormatter={fmtPct} stroke="#9CA3AF" tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v, n) => [v != null ? fmtPct(v) : '—', n]} contentStyle={{ fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {techs.map((tech, i) => (
                    <Line key={tech} type="monotone" dataKey={tech}
                      stroke={CC[i % CC.length]} strokeWidth={1.5} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </AdminChartCard>
          );
        })}
      </div>
    </div>
  );
}

function AdminView({ token, onSignOut }) {
  const { adminName, isAdminRole } = (() => {
    try {
      const { first_name, last_name, admin_role } = JSON.parse(atob(token.split('.')[1]));
      return {
        adminName: [first_name, last_name].filter(Boolean).join(' ') || 'Admin',
        isAdminRole: admin_role === 'admin',
      };
    } catch { return { adminName: 'Admin', isAdminRole: false }; }
  })();
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedFleet, setExpandedFleet] = useState(null);
  const [fleetSort, setFleetSort] = useState({ field: 'last_submitted_year', dir: 'desc' });
  const [contactSort, setContactSort] = useState({ field: 'last_name', dir: 'asc' });
  const [contactFilter, setContactFilter] = useState('active'); // 'active' | 'inactive' | 'all'

  // Admin contacts
  const [adminContacts, setAdminContacts] = useState([]);
  const [showNacfeUsers, setShowNacfeUsers] = useState(false);
  const [nacfeUserForm, setNacfeUserForm] = useState({ first_name: '', last_name: '', email: '', phone: '', admin_role: 'user' });
  const [nacfeUserSaving, setNacfeUserSaving] = useState(false);
  const [showNacfeUserForm, setShowNacfeUserForm] = useState(false);
  const nacfeDropdownRef = React.useRef(null);

  // Card collapse state
  const [fleetsCollapsed,    setFleetsCollapsed]    = useState(false);
  const [contactsCollapsed,  setContactsCollapsed]  = useState(false);
  const [techsCollapsed,     setTechsCollapsed]     = useState(false);

  // Settings panel
  const [showSettings,    setShowSettings]    = useState(false);
  const [settingsForm,    setSettingsForm]    = useState({ editable_year_from: '', editable_year_to: '', invite_email_template: '' });
  const [settingsSaving,  setSettingsSaving]  = useState(false);
  const [resetting,       setResetting]       = useState(false);
  const [resetMsg,        setResetMsg]        = useState('');

  // New Fleet modal
  const [showFleetForm, setShowFleetForm] = useState(false);
  const [fleetForm, setFleetForm] = useState({
    fleet_name: '', fleet_city: '', fleet_state: '', default_duty_cycle: '',
    first_name: '', last_name: '', email: '', phone: '', fleet_role: 'fleet_admin',
  });
  const [fleetSaving, setFleetSaving] = useState(false);

  // Edit Fleet modal
  const [editFleet, setEditFleet] = useState(null); // fleet object
  const [editFleetForm, setEditFleetForm] = useState({});
  const [editFleetSaving, setEditFleetSaving] = useState(false);

  // New Contact modal
  const [contactFleetId, setContactFleetId] = useState(null);
  const [contactForm, setContactForm] = useState({ first_name: '', last_name: '', email: '', phone: '', fleet_role: 'fleet_user' });
  const [contactSaving, setContactSaving] = useState(false);

  // Edit Contact modal
  const [editContact, setEditContact] = useState(null); // contact object with fleet_name
  const [editContactForm, setEditContactForm] = useState({});
  const [editContactSaving, setEditContactSaving] = useState(false);
  // Fleet associations for the edit-contact modal
  const [contactFleetAssocs, setContactFleetAssocs] = useState([]);
  const [addFleetId,   setAddFleetId]   = useState('');
  const [addFleetRole, setAddFleetRole] = useState('fleet_user');
  const [assocSaving,  setAssocSaving]  = useState(false);

  // Page switcher: 'data' (management) | 'charts'
  const [adminPage, setAdminPage] = useState('data');

  // FHWA reference data card
  const [fhwaRows,        setFhwaRows]        = useState([]);
  const [fhwaCollapsed,   setFhwaCollapsed]   = useState(true);
  const [fhwaForm,        setFhwaForm]        = useState({ mpg_year: '', ifta_miles: '', ifta_fuel: '' });
  const [fhwaEditId,      setFhwaEditId]      = useState(null); // mpg_id being edited
  const [fhwaSaving,      setFhwaSaving]      = useState(false);
  const [fhwaMsg,         setFhwaMsg]         = useState('');

  // Technology card
  const [techs, setTechs] = useState([]);
  const [techsLoading, setTechsLoading] = useState(true);
  const [showTechForm, setShowTechForm] = useState(false);
  const [techForm, setTechForm] = useState({ tech_group: '', tech_group_new: '', technology: '', tech_expl: '', applies_sleeper: true, applies_daycab: true, active_from: new Date().getFullYear(), active_to: '' });
  const [techSaving, setTechSaving] = useState(false);
  const [editTech, setEditTech] = useState(null);
  const [editTechForm, setEditTechForm] = useState({});
  const [editTechSaving, setEditTechSaving] = useState(false);

  const fetchFleets = () => {
    setLoading(true);
    fetch('/api/admin/fleets', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFleets(d.fleets || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const fetchAdminContacts = () => {
    fetch('/api/admin/admin-contacts', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAdminContacts(d.contacts || []); })
      .catch(console.error);
  };

  const [roleChanging, setRoleChanging] = useState(null); // contact_id being changed
  const handleRoleChange = async (contactId, newRole) => {
    setRoleChanging(contactId);
    try {
      const r = await fetch(`/api/admin/admin-contacts/${contactId}/role`, {
        method: 'PATCH', headers: authHeaders, body: JSON.stringify({ role: newRole }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Failed to update role'); return; }
      setAdminContacts(prev => prev.map(c => c.contact_id === contactId ? { ...c, admin_role: newRole } : c));
    } catch { alert('Network error'); }
    finally { setRoleChanging(null); }
  };

  const handleAddNacfeUser = async (e) => {
    e.preventDefault();
    setNacfeUserSaving(true);
    try {
      const r = await fetch('/api/admin/admin-contacts', {
        method: 'POST', headers: authHeaders, body: JSON.stringify(nacfeUserForm),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Failed to add user'); return; }
      setNacfeUserForm({ first_name: '', last_name: '', email: '', phone: '', admin_role: 'user' });
      setShowNacfeUserForm(false);
      fetchAdminContacts();
    } catch { alert('Network error'); }
    finally { setNacfeUserSaving(false); }
  };

  const handleRemoveNacfeUser = async (contactId) => {
    if (!window.confirm('Remove this user?')) return;
    try {
      const r = await fetch(`/api/admin/admin-contacts/${contactId}`, { method: 'DELETE', headers: authHeaders });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Failed to remove user'); return; }
      setAdminContacts(prev => prev.filter(c => c.contact_id !== contactId));
    } catch { alert('Network error'); }
  };

  useEffect(() => { fetchFleets(); fetchAdminContacts(); }, [token]);

  const fetchFhwa = () => {
    fetch('/api/admin/fhwa-mpg', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(d => setFhwaRows(d.rows || []))
      .catch(console.error);
  };
  useEffect(() => { if (!fhwaCollapsed) fetchFhwa(); }, [fhwaCollapsed, token]);

  const handleFhwaSubmit = async (e) => {
    e.preventDefault();
    setFhwaSaving(true); setFhwaMsg('');
    try {
      const url  = fhwaEditId ? `/api/admin/fhwa-mpg/${fhwaEditId}` : '/api/admin/fhwa-mpg';
      const meth = fhwaEditId ? 'PUT' : 'POST';
      const r = await fetch(url, { method: meth, headers: authHeaders, body: JSON.stringify(fhwaForm) });
      const d = await r.json();
      if (!r.ok) { setFhwaMsg(d.error || 'Failed'); return; }
      setFhwaForm({ mpg_year: '', ifta_miles: '', ifta_fuel: '' });
      setFhwaEditId(null);
      setFhwaMsg(fhwaEditId ? 'Updated.' : 'Added.');
      fetchFhwa();
      setTimeout(() => setFhwaMsg(''), 3000);
    } catch (err) {
      setFhwaMsg('Error: ' + err.message);
    } finally {
      setFhwaSaving(false);
    }
  };

  const handleFhwaDelete = async (id) => {
    if (!window.confirm('Delete this FHWA row?')) return;
    await fetch(`/api/admin/fhwa-mpg/${id}`, { method: 'DELETE', headers: authHeaders });
    fetchFhwa();
  };

  // Load fleet associations when the edit-contact modal opens
  useEffect(() => {
    if (!editContact) { setContactFleetAssocs([]); return; }
    fetch(`/api/admin/contacts/${editContact.contact_id}/fleets`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { fleets: [] })
      .then(d => { setContactFleetAssocs(d.fleets || []); setAddFleetId(''); })
      .catch(() => setContactFleetAssocs([]));
  }, [editContact?.contact_id]);

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!showNacfeUsers) return;
    const handler = (e) => { if (nacfeDropdownRef.current && !nacfeDropdownRef.current.contains(e.target)) setShowNacfeUsers(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNacfeUsers]);

  const fetchTechs = () => {
    setTechsLoading(true);
    fetch('/api/admin/techs', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTechs(d.techs || []); })
      .catch(console.error)
      .finally(() => setTechsLoading(false));
  };
  useEffect(() => { fetchTechs(); }, [token]);

  // Settings
  const fetchSettings = () => {
    fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.settings) {
          setSettingsForm({
            editable_year_from: d.settings.editable_year_from ?? '2003',
            editable_year_to:   d.settings.editable_year_to   ?? String(new Date().getFullYear()),
            invite_email_template: d.settings.invite_email_template ?? '',
          });
        }
      })
      .catch(console.error);
  };
  useEffect(() => { fetchSettings(); }, [token]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT', headers: authHeaders,
        body: JSON.stringify({
          editable_year_from: settingsForm.editable_year_from,
          editable_year_to:   settingsForm.editable_year_to,
          invite_email_template: settingsForm.invite_email_template,
        }),
      });
      setShowSettings(false);
    } finally { setSettingsSaving(false); }
  };

  const handleResetExampleFleet = async () => {
    setResetting(true); setResetMsg('');
    try {
      const res = await fetch('/api/admin/reset-example-fleet', { method: 'POST', headers: authHeaders });
      const d = await res.json();
      setResetMsg(res.ok ? 'Example fleet data cleared.' : (d.error || 'Reset failed.'));
    } catch { setResetMsg('Reset failed.'); }
    finally { setResetting(false); }
  };

  const techGroups = [...new Set(techs.map(t => t.tech_group))].sort();

  const resolveTechGroup = (form) =>
    form.tech_group === '__new__' ? form.tech_group_new.trim() : form.tech_group;

  const handleCreateTech = async (e) => {
    e.preventDefault();
    const group = resolveTechGroup(techForm);
    if (!group) return;
    setTechSaving(true);
    try {
      const res = await fetch('/api/admin/techs', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ tech_group: group, technology: techForm.technology, tech_expl: techForm.tech_expl, applies_sleeper: techForm.applies_sleeper, applies_daycab: techForm.applies_daycab, active_from: techForm.active_from || null, active_to: techForm.active_to || null }),
      });
      if (res.ok) { setShowTechForm(false); setTechForm({ tech_group: '', tech_group_new: '', technology: '', tech_expl: '', applies_sleeper: true, applies_daycab: true, active_from: new Date().getFullYear(), active_to: '' }); fetchTechs(); }
    } finally { setTechSaving(false); }
  };

  const handleEditTech = async (e) => {
    e.preventDefault();
    const group = resolveTechGroup(editTechForm);
    if (!group) return;
    setEditTechSaving(true);
    try {
      const res = await fetch(`/api/admin/techs/${editTech.tech_id}`, {
        method: 'PUT', headers: authHeaders,
        body: JSON.stringify({ tech_group: group, technology: editTechForm.technology, tech_expl: editTechForm.tech_expl, applies_sleeper: editTechForm.applies_sleeper, applies_daycab: editTechForm.applies_daycab, active_from: editTechForm.active_from || null, active_to: editTechForm.active_to || null }),
      });
      if (res.ok) { setEditTech(null); fetchTechs(); }
    } finally { setEditTechSaving(false); }
  };

  const openEditTech = (t) => {
    setEditTech(t);
    setEditTechForm({ tech_group: t.tech_group, tech_group_new: '', technology: t.technology, tech_expl: t.tech_expl || '', applies_sleeper: !!t.applies_sleeper, applies_daycab: !!t.applies_daycab, active_from: t.active_from ?? '', active_to: t.active_to ?? '' });
  };

  const handleCreateFleet = async (e) => {
    e.preventDefault();
    setFleetSaving(true);
    try {
      const fleetRes = await fetch('/api/admin/fleets', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ fleet_name: fleetForm.fleet_name, fleet_city: fleetForm.fleet_city, fleet_state: fleetForm.fleet_state, default_duty_cycle: fleetForm.default_duty_cycle }),
      });
      if (!fleetRes.ok) return;
      const { fleet_id } = await fleetRes.json();
      await fetch('/api/admin/contacts', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ fleet_id, first_name: fleetForm.first_name, last_name: fleetForm.last_name, email: fleetForm.email, phone: fleetForm.phone, fleet_role: fleetForm.fleet_role }),
      });
      setShowFleetForm(false);
      setFleetForm({ fleet_name: '', fleet_city: '', fleet_state: '', default_duty_cycle: '', first_name: '', last_name: '', email: '', phone: '', fleet_role: 'fleet_admin' });
      fetchFleets();
    } finally { setFleetSaving(false); }
  };

  const handleEditFleet = async (e) => {
    e.preventDefault();
    setEditFleetSaving(true);
    try {
      const res = await fetch(`/api/admin/fleets/${editFleet.fleet_id}`, {
        method: 'PUT', headers: authHeaders, body: JSON.stringify(editFleetForm),
      });
      if (res.ok) { setEditFleet(null); fetchFleets(); }
    } finally { setEditFleetSaving(false); }
  };

  const handleCreateContact = async (e) => {
    e.preventDefault();
    setContactSaving(true);
    try {
      const res = await fetch('/api/admin/contacts', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ fleet_id: contactFleetId === 'pick' ? contactForm.fleet_id : contactFleetId, ...contactForm }),
      });
      if (res.ok) { setContactFleetId(null); setContactForm({ first_name: '', last_name: '', email: '', phone: '', fleet_role: 'fleet_user' }); fetchFleets(); }
    } finally { setContactSaving(false); }
  };

  const handleEditContact = async (e) => {
    e.preventDefault();
    setEditContactSaving(true);
    try {
      const res = await fetch(`/api/admin/contacts/${editContact.contact_id}`, {
        method: 'PUT', headers: authHeaders, body: JSON.stringify(editContactForm),
      });
      if (res.ok) { setEditContact(null); fetchFleets(); }
    } finally { setEditContactSaving(false); }
  };

  // Sorted fleet list
  const sortedFleets = [...fleets].sort((a, b) => {
    let av = a[fleetSort.field], bv = b[fleetSort.field];
    if (fleetSort.field === 'last_submitted_year') {
      av = av ?? 0; bv = bv ?? 0;
      return fleetSort.dir === 'asc' ? av - bv : bv - av;
    }
    av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase();
    const primary = fleetSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    if (primary !== 0) return primary;
    return (a.fleet_name || '').toLowerCase().localeCompare((b.fleet_name || '').toLowerCase());
  });

  // Flat contacts list filtered by active state
  const allContacts = fleets.flatMap(f =>
    f.contacts.map(c => ({ ...c, fleet_name: f.fleet_name }))
  );
  const filteredContacts = allContacts.filter(c =>
    contactFilter === 'all' ? true : contactFilter === 'active' ? c.active !== 0 : c.active === 0
  );
  const sortedContacts = [...filteredContacts].sort((a, b) => {
    const fieldMap = {
      name: r => `${r.last_name || ''} ${r.first_name || ''}`.toLowerCase(),
      fleet_name: r => (r.fleet_name || '').toLowerCase(),
      email: r => (r.email || '').toLowerCase(),
      phone: r => (r.phone || '').toLowerCase(),
    };
    const fn = fieldMap[contactSort.field] || (() => '');
    const av = fn(a), bv = fn(b);
    return contactSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const inputStyle = {
    background: '#F9FAFB', border: '1px solid #D1D5DB', borderRadius: 6,
    padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box',
  };
  const selectStyle = { ...inputStyle, appearance: 'auto' };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 2, display: 'block' };
  const modalOverlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const modalBox = {
    background: '#fff', borderRadius: 10, padding: 24, width: 420,
    boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto',
  };
  const card = {
    background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 24, overflow: 'hidden',
  };
  const cardHeader = {
    display: 'flex', alignItems: 'center', padding: '12px 16px',
    borderBottom: '1px solid #F3F4F6',
  };
  const thBase = { fontWeight: 600, paddingBottom: 8, paddingRight: 12, fontSize: 12, color: '#6B7280', textAlign: 'left' };
  const editBtn = {
    background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer',
    fontSize: 12, padding: '2px 6px', borderRadius: 4,
  };

  // Toggle button style helper
  const toggleBtn = (val) => ({
    padding: '4px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 5,
    border: '1px solid',
    background: contactFilter === val ? '#1c3660' : '#fff',
    color: contactFilter === val ? '#fff' : '#6B7280',
    borderColor: contactFilter === val ? '#1c3660' : '#D1D5DB',
    fontWeight: contactFilter === val ? 600 : 400,
  });

  const sectionLabel = { fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.05em', marginBottom: 8 };

  return (
    <div style={{ minHeight: '100vh', background: '#F3F4F6', fontFamily: 'Arial, sans-serif' }}>
      {/* Top bar */}
      <div style={{ background: '#1c3660', padding: '0 32px', display: 'flex', alignItems: 'center', height: 56, gap: 10, position: 'relative', zIndex: 100 }}>
        <img src="/nacfe-logo.png" alt="NACFE" style={{ height: 32, objectFit: 'contain' }} />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 16, flex: 1 }}>Admin Panel</span>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{adminName}</span>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: isAdminRole ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)', color: isAdminRole ? '#fff' : 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
          {isAdminRole ? 'Admin' : 'View only'}
        </span>
        {/* NACFE Users dropdown */}
        <div ref={nacfeDropdownRef} style={{ position: 'relative' }}>
          <button onClick={() => { setShowNacfeUsers(v => !v); setShowNacfeUserForm(false); }}
            style={{ background: showNacfeUsers ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
            NACFE Users
          </button>
          {showNacfeUsers && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 520, background: '#fff', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#111827', flex: 1 }}>NACFE Users</span>
                {isAdminRole && (
                  <button onClick={() => setShowNacfeUserForm(v => !v)}
                    style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    + Add User
                  </button>
                )}
              </div>
              {showNacfeUserForm && (
                <form onSubmit={handleAddNacfeUser} style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input placeholder="First name" required value={nacfeUserForm.first_name} onChange={e => setNacfeUserForm(p => ({ ...p, first_name: e.target.value }))}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 12 }} />
                    <input placeholder="Last name" value={nacfeUserForm.last_name} onChange={e => setNacfeUserForm(p => ({ ...p, last_name: e.target.value }))}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 12 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input placeholder="Email" required type="email" value={nacfeUserForm.email} onChange={e => setNacfeUserForm(p => ({ ...p, email: e.target.value }))}
                      style={{ flex: 2, padding: '6px 8px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 12 }} />
                    <input placeholder="Phone" value={nacfeUserForm.phone} onChange={e => setNacfeUserForm(p => ({ ...p, phone: e.target.value }))}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 12 }} />
                    <select value={nacfeUserForm.admin_role} onChange={e => setNacfeUserForm(p => ({ ...p, admin_role: e.target.value }))}
                      style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 12 }}>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowNacfeUserForm(false)} style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                    <button type="submit" disabled={nacfeUserSaving} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {nacfeUserSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              )}
              <div style={{ overflowY: 'auto', maxHeight: 320 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                      <th style={{ ...thBase, padding: '8px 12px 8px 16px' }}>Name</th>
                      <th style={{ ...thBase, padding: '8px 12px' }}>Email</th>
                      <th style={{ ...thBase, padding: '8px 12px' }}>Last Login</th>
                      <th style={{ ...thBase, padding: '8px 12px' }}>Role</th>
                      {isAdminRole && <th style={{ ...thBase, padding: '8px 12px' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {adminContacts.map(c => {
                      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';
                      const role = c.admin_role || 'user';
                      const adminCount = adminContacts.filter(x => (x.admin_role || 'user') === 'admin').length;
                      const isLastAdmin = role === 'admin' && adminCount === 1;
                      return (
                        <tr key={c.contact_id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '8px 12px 8px 16px', color: '#111827', fontWeight: 500 }}>{name}</td>
                          <td style={{ padding: '8px 12px', color: '#374151' }}>{c.email}</td>
                          <td style={{ padding: '8px 12px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                            {c.last_login ? new Date(c.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {isAdminRole ? (
                              <select value={role} disabled={roleChanging === c.contact_id || isLastAdmin}
                                onChange={e => handleRoleChange(c.contact_id, e.target.value)}
                                title={isLastAdmin ? 'Cannot remove last admin' : ''}
                                style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid #D1D5DB', background: '#fff', cursor: isLastAdmin ? 'not-allowed' : 'pointer' }}>
                                <option value="admin">Admin</option>
                                <option value="user">User</option>
                              </select>
                            ) : (
                              <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 10, background: role === 'admin' ? '#EFF6FF' : '#F3F4F6', color: role === 'admin' ? '#1c3660' : '#6B7280', fontWeight: 600 }}>
                                {role === 'admin' ? 'Admin' : 'User'}
                              </span>
                            )}
                          </td>
                          {isAdminRole && (
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <button onClick={() => handleRemoveNacfeUser(c.contact_id)} disabled={isLastAdmin}
                                title={isLastAdmin ? 'Cannot remove last admin' : 'Remove user'}
                                style={{ background: 'none', border: 'none', color: isLastAdmin ? '#D1D5DB' : '#DC2626', cursor: isLastAdmin ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {adminContacts.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>No users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        {isAdminRole && <button onClick={() => setShowSettings(true)} title="Settings" style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>⚙</button>}
        <button onClick={onSignOut} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
          Sign out
        </button>
      </div>

      {/* ── Page tabs ── */}
      <div style={{ background: '#fff', borderBottom: '2px solid #E5E7EB' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px', display: 'flex' }}>
          {[['data', 'Management'], ['charts', 'Charts']].map(([key, label]) => (
            <button key={key} onClick={() => setAdminPage(key)} style={{
              background: 'none', border: 'none', padding: '10px 20px',
              fontSize: 13, fontWeight: adminPage === key ? 700 : 400,
              color: adminPage === key ? '#1c3660' : '#6B7280',
              borderBottom: adminPage === key ? '2px solid #1c3660' : '2px solid transparent',
              marginBottom: -2, cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {adminPage === 'charts' && <AdminChartsPage token={token} />}

      {adminPage === 'data' && <>
      <div style={{ maxWidth: 1280, margin: '24px auto', padding: '0 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ── Fleets Card ── */}
        <div style={{ ...card, flex: '1 1 0', minWidth: 0, marginBottom: 0 }}>
          <div style={{ ...cardHeader, cursor: 'pointer' }} onClick={() => setFleetsCollapsed(c => !c)}>
            <h2 style={{ margin: 0, fontSize: 15, color: '#111827', fontWeight: 700, flex: 1 }}>
              Fleets <span style={{ fontWeight: 400, fontSize: 12, color: '#9CA3AF' }}>({fleets.length})</span>
            </h2>
            {isAdminRole && <button onClick={e => { e.stopPropagation(); setShowFleetForm(true); }}
              style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, marginRight: 8 }}>
              + New Fleet
            </button>}
            <span style={{ color: '#9CA3AF', fontSize: 13 }}>{fleetsCollapsed ? '▶' : '▼'}</span>
          </div>

          {!fleetsCollapsed && (loading ? (
            <div style={{ textAlign: 'center', color: '#6B7280', padding: 40 }}>Loading…</div>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: 420 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: '#F9FAFB' }}>
                    <th style={{ ...thBase, padding: '8px 8px 8px 16px' }} rowSpan={2}>
                      <span onClick={() => setFleetSort(s => ({ field: 'fleet_name', dir: s.field === 'fleet_name' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                        style={{ cursor: 'pointer', userSelect: 'none', color: fleetSort.field === 'fleet_name' ? '#1c3660' : '#6B7280' }}>
                        Fleet {fleetSort.field === 'fleet_name' ? (fleetSort.dir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.4 }}>↕</span>}
                      </span>
                    </th>
                    <th style={{ ...thBase, padding: '8px' }} rowSpan={2}>Location</th>
                    <th style={{ ...thBase, padding: '8px' }} rowSpan={2}>Duty Cycle</th>
                    <th colSpan={2} style={{ ...thBase, padding: '6px 8px 2px', textAlign: 'center', borderBottom: '1px solid #E5E7EB' }}>Submission</th>
                    <th style={{ ...thBase, padding: '8px 12px 8px 0', textAlign: 'right' }} rowSpan={2}>✎</th>
                  </tr>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ ...thBase, padding: '2px 8px 8px', textAlign: 'center' }}>
                      <span onClick={() => setFleetSort(s => ({ field: 'last_submitted_year', dir: s.field === 'last_submitted_year' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                        style={{ cursor: 'pointer', userSelect: 'none', color: fleetSort.field === 'last_submitted_year' ? '#1c3660' : '#6B7280' }}>
                        Last {fleetSort.field === 'last_submitted_year' ? (fleetSort.dir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.4 }}>↕</span>}
                      </span>
                    </th>
                    <th style={{ ...thBase, padding: '2px 8px 8px', textAlign: 'center' }}>View</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFleets.map(f => (
                    <React.Fragment key={f.fleet_id}>
                      <tr
                        style={{ borderBottom: expandedFleet === f.fleet_id ? 'none' : '1px solid #F3F4F6', cursor: 'pointer', background: expandedFleet === f.fleet_id ? '#F9FAFB' : '#fff' }}
                        onClick={() => setExpandedFleet(expandedFleet === f.fleet_id ? null : f.fleet_id)}
                      >
                        <td style={{ padding: '9px 8px 9px 16px', fontWeight: 600, color: '#111827' }}>{f.fleet_name}</td>
                        <td style={{ padding: '9px 8px', color: '#6B7280' }}>{[f.fleet_city, f.fleet_state].filter(Boolean).join(', ') || '—'}</td>
                        <td style={{ padding: '9px 8px', color: '#6B7280' }}>{f.default_duty_cycle || '—'}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                          {f.last_submitted_year
                            ? <span style={{ color: '#374151', fontWeight: 600 }}>{f.last_submitted_year}</span>
                            : <span style={{ color: '#EF4444' }}>None</span>}
                        </td>
                        <td style={{ padding: '9px 8px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <button
                            title="Open submission screen"
                            style={{ ...editBtn, fontSize: 13 }}
                            onClick={async () => {
                              const res = await fetch(`/api/admin/preview-token/${f.fleet_id}`, { headers: { Authorization: `Bearer ${token}` } });
                              if (!res.ok) return;
                              const { token: pt } = await res.json();
                              window.open(`${window.location.origin}${window.location.pathname}?preview=${pt}`, '_blank');
                            }}
                          >⧉</button>
                        </td>
                        {isAdminRole && <td style={{ padding: '9px 12px 9px 0', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <button style={editBtn} onClick={() => { setEditFleet(f); setEditFleetForm({ fleet_name: f.fleet_name, fleet_city: f.fleet_city || '', fleet_state: f.fleet_state || '', default_duty_cycle: f.default_duty_cycle || '' }); }}>✎</button>
                        </td>}
                      </tr>
                      {expandedFleet === f.fleet_id && (
                        <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td colSpan={6} style={{ padding: '0 16px 12px', background: '#F9FAFB' }}>
                            {f.contacts.length === 0 ? (
                              <div style={{ color: '#9CA3AF', fontSize: 12, paddingTop: 10 }}>No contacts yet.</div>
                            ) : (
                              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8, marginBottom: 8 }}>
                                <thead>
                                  <tr style={{ color: '#9CA3AF' }}>
                                    <th style={{ fontWeight: 600, paddingBottom: 4, paddingRight: 12, textAlign: 'left' }}>Name</th>
                                    <th style={{ fontWeight: 600, paddingBottom: 4, paddingRight: 12, textAlign: 'left' }}>Email</th>
                                    <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: 'left' }}>Phone</th>
                                    <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: 'center' }}>Status</th>
                                    <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: 'center' }}>Allow Access</th>
                                    <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: 'center' }}>Role</th>
                                    <th></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {f.contacts.map(c => (
                                    <tr key={c.contact_id} style={{ borderTop: '1px solid #E5E7EB', opacity: c.active === 0 ? 0.5 : 1 }}>
                                      <td style={{ padding: '5px 12px 5px 0', color: '#111827' }}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
                                      <td style={{ padding: '5px 12px 5px 0', color: '#374151' }}>{c.email}</td>
                                      <td style={{ padding: '5px 12px 5px 0', color: '#374151' }}>{c.phone || '—'}</td>
                                      <td style={{ padding: '5px 0', textAlign: 'center' }}>
                                        <span style={{ fontSize: 11, color: c.active !== 0 ? '#059669' : '#9CA3AF', fontWeight: 600 }}>{c.active !== 0 ? 'Active' : 'Inactive'}</span>
                                      </td>
                                      <td style={{ padding: '5px 0', textAlign: 'center' }}>
                                        {isAdminRole ? (
                                          <input type="checkbox" checked={!!c.portal_access} onChange={async e => {
                                            const val = e.target.checked;
                                            await fetch(`/api/admin/contacts/${c.contact_id}/access`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ portal_access: val }) });
                                            fetchFleets();
                                          }} />
                                        ) : (
                                          <span style={{ fontSize: 11, color: c.portal_access ? '#059669' : '#9CA3AF', fontWeight: 600 }}>{c.portal_access ? 'Yes' : 'No'}</span>
                                        )}
                                      </td>
                                      <td style={{ padding: '5px 0', textAlign: 'center' }}>
                                        {isAdminRole ? (
                                          <select value={c.fleet_role || 'fleet_user'}
                                            onChange={async e => {
                                              const r = await fetch(`/api/admin/contacts/${c.contact_id}/fleet-role`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ fleet_role: e.target.value, fleet_id: f.fleet_id }) });
                                              const d = await r.json();
                                              if (!r.ok) alert(d.error || 'Failed');
                                              else fetchFleets();
                                            }}
                                            style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #D1D5DB' }}>
                                            <option value="fleet_admin">Admin</option>
                                            <option value="fleet_user">User</option>
                                          </select>
                                        ) : (
                                          <span style={{ fontSize: 11, color: '#6B7280' }}>{c.fleet_role === 'fleet_admin' ? 'Admin' : 'User'}</span>
                                        )}
                                      </td>
                                      {isAdminRole && <td style={{ padding: '5px 0', textAlign: 'right' }}>
                                        <button style={editBtn} onClick={() => { setEditContact({ ...c, fleet_name: f.fleet_name }); setEditContactForm({ first_name: c.first_name || '', last_name: c.last_name || '', email: c.email, phone: c.phone || '', active: c.active !== 0, portal_access: !!c.portal_access }); }}>✎</button>
                                      </td>}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {isAdminRole && <button
                              onClick={e => { e.stopPropagation(); setContactFleetId(f.fleet_id); setContactForm({ first_name: '', last_name: '', email: '', phone: '', fleet_role: 'fleet_user' }); }}
                              style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#374151' }}
                            >+ Add Contact</button>}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* ── Fleet Contacts Card ── */}
        <div style={{ ...card, flex: '1 1 0', minWidth: 0, marginBottom: 0 }}>
          <div style={{ ...cardHeader, cursor: 'pointer' }} onClick={() => setContactsCollapsed(c => !c)}>
            <h2 style={{ margin: 0, fontSize: 15, color: '#111827', fontWeight: 700, flex: 1 }}>
              Fleet Contacts <span style={{ fontWeight: 400, fontSize: 12, color: '#9CA3AF' }}>({sortedContacts.length})</span>
            </h2>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
              {isAdminRole && <button onClick={() => { setContactFleetId('pick'); setContactForm({ first_name: '', last_name: '', email: '', phone: '', fleet_role: 'fleet_user', fleet_id: '' }); }}
                style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                + New Contact
              </button>}
              <div style={{ display: 'flex', gap: 4 }}>
              {['active', 'inactive', 'all'].map(v => (
                <button key={v} style={toggleBtn(v)} onClick={() => setContactFilter(v)}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
              </div>
            </div>
            <span style={{ color: '#9CA3AF', fontSize: 13, marginLeft: 8 }}>{contactsCollapsed ? '▶' : '▼'}</span>
          </div>
          {!contactsCollapsed && (loading ? (
            <div style={{ textAlign: 'center', color: '#6B7280', padding: 32 }}>Loading…</div>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: 420 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    <SortHeader label="Name" field="name" sort={contactSort} setSort={setContactSort} />
                    <SortHeader label="Fleet" field="fleet_name" sort={contactSort} setSort={setContactSort} />
                    <SortHeader label="Email" field="email" sort={contactSort} setSort={setContactSort} />
                    <SortHeader label="Phone" field="phone" sort={contactSort} setSort={setContactSort} />
                    <SortHeader label="Last Login" field="last_login" sort={contactSort} setSort={setContactSort} />
                    <th style={{ ...thBase, padding: '8px', textAlign: 'center' }}>Allow Access</th>
                    <th style={{ ...thBase, padding: '8px', textAlign: 'center' }}>Role</th>
                    <th style={{ ...thBase, padding: '8px 12px 8px 0' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedContacts.map(c => (
                    <tr key={c.contact_id} style={{ borderBottom: '1px solid #F3F4F6', opacity: c.active === 0 ? 0.5 : 1 }}>
                      <td style={{ padding: '8px 12px 8px 16px', color: '#111827', fontWeight: 500 }}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#6B7280' }}>{c.fleet_name}</td>
                      <td style={{ padding: '8px 12px', color: '#374151' }}>{c.email}</td>
                      <td style={{ padding: '8px 12px', color: '#374151' }}>{c.phone || '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {c.last_login ? new Date(c.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        {isAdminRole ? (
                          <input type="checkbox" checked={!!c.portal_access} onChange={async e => {
                            const val = e.target.checked;
                            await fetch(`/api/admin/contacts/${c.contact_id}/access`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ portal_access: val }) });
                            fetchFleets();
                          }} />
                        ) : (
                          <span style={{ fontSize: 11, color: c.portal_access ? '#059669' : '#9CA3AF', fontWeight: 600 }}>{c.portal_access ? 'Yes' : 'No'}</span>
                        )}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        {isAdminRole ? (
                          <select value={c.fleet_role || 'fleet_user'}
                            onChange={async e => {
                              const r = await fetch(`/api/admin/contacts/${c.contact_id}/fleet-role`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ fleet_role: e.target.value, fleet_id: c.fleet_id }) });
                              const d = await r.json();
                              if (!r.ok) alert(d.error || 'Failed');
                              else fetchFleets();
                            }}
                            style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #D1D5DB' }}>
                            <option value="fleet_admin">Admin</option>
                            <option value="fleet_user">User</option>
                          </select>
                        ) : (
                          <span style={{ fontSize: 11, color: '#6B7280' }}>{c.fleet_role === 'fleet_admin' ? 'Admin' : 'User'}</span>
                        )}
                      </td>
                      {isAdminRole && <td style={{ padding: '8px 12px 8px 0', textAlign: 'right' }}>
                        <button style={editBtn} onClick={() => { setEditContact(c); setEditContactForm({ first_name: c.first_name || '', last_name: c.last_name || '', email: c.email, phone: c.phone || '', active: c.active !== 0, portal_access: !!c.portal_access }); }}>✎</button>
                      </td>}
                    </tr>
                  ))}
                  {sortedContacts.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>No contacts found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>

      </div>

      {/* ── Technology Card ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto 24px', padding: '0 20px' }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ ...cardHeader, cursor: 'pointer' }} onClick={() => setTechsCollapsed(c => !c)}>
            <h2 style={{ margin: 0, fontSize: 15, color: '#111827', fontWeight: 700, flex: 1 }}>
              Technologies <span style={{ fontWeight: 400, fontSize: 12, color: '#9CA3AF' }}>({techs.length})</span>
            </h2>
            {isAdminRole && <button onClick={e => { e.stopPropagation(); setShowTechForm(true); }}
              style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, marginRight: 8 }}>
              + New Technology
            </button>}
            <span style={{ color: '#9CA3AF', fontSize: 13 }}>{techsCollapsed ? '▶' : '▼'}</span>
          </div>
          {!techsCollapsed && (techsLoading ? (
            <div style={{ textAlign: 'center', color: '#6B7280', padding: 32 }}>Loading…</div>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: 480 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ ...thBase, padding: '8px 8px 8px 16px' }}>Group</th>
                    <th style={{ ...thBase, padding: '8px' }}>Technology</th>
                    <th style={{ ...thBase, padding: '8px' }}>Description</th>
                    <th style={{ ...thBase, padding: '8px', textAlign: 'center' }}>Sleeper</th>
                    <th style={{ ...thBase, padding: '8px', textAlign: 'center' }}>Day Cab</th>
                    <th style={{ ...thBase, padding: '8px', textAlign: 'center' }}>Active From</th>
                    <th style={{ ...thBase, padding: '8px', textAlign: 'center' }}>Active To</th>
                    <th style={{ ...thBase, padding: '8px 12px 8px 0', textAlign: 'right' }}>✎</th>
                  </tr>
                </thead>
                <tbody>
                  {techs.map(t => (
                    <tr key={t.tech_id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '8px 8px 8px 16px', color: '#6B7280' }}>{t.tech_group}</td>
                      <td style={{ padding: '8px', color: '#111827', fontWeight: 500 }}>{t.technology}</td>
                      <td style={{ padding: '8px', color: '#6B7280', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.tech_expl || ''}>{t.tech_expl || '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{t.applies_sleeper ? '✓' : <span style={{ color: '#D1D5DB' }}>—</span>}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{t.applies_daycab ? '✓' : <span style={{ color: '#D1D5DB' }}>—</span>}</td>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#374151' }}>{t.active_from ?? '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'center', color: t.active_to ? '#374151' : '#9CA3AF' }}>{t.active_to ?? 'Current'}</td>
                      {isAdminRole && <td style={{ padding: '8px 12px 8px 0', textAlign: 'right' }}>
                        <button style={editBtn} onClick={() => openEditTech(t)}>✎</button>
                      </td>}
                    </tr>
                  ))}
                  {techs.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>No technologies found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      {/* ── FHWA Reference Data Card ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto 24px', padding: '0 20px' }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ ...cardHeader, cursor: 'pointer' }} onClick={() => setFhwaCollapsed(c => !c)}>
            <h2 style={{ margin: 0, fontSize: 15, color: '#111827', fontWeight: 700, flex: 1 }}>
              FHWA IFTA Reference Data
              <span style={{ fontWeight: 400, fontSize: 12, color: '#9CA3AF', marginLeft: 8 }}>
                ({fhwaRows.length} row{fhwaRows.length !== 1 ? 's' : ''})
              </span>
            </h2>
            <span style={{ color: '#9CA3AF', fontSize: 13 }}>{fhwaCollapsed ? '▶' : '▼'}</span>
          </div>

          {!fhwaCollapsed && (
            <div style={{ padding: '0 0 16px' }}>
              {/* Source note */}
              <p style={{ margin: '12px 0 14px', fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
                Data source: <strong>FHWA Highway Statistics Series</strong>, Table VM-1 — Combination Trucks.
                Use the <strong>Excel download</strong> to get values that are not rounded to the millions.
                Prior-year numbers can change; check and update previous entries when new data is released.
              </p>

              {/* Entry / Edit form */}
              <form onSubmit={handleFhwaSubmit}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', padding: '0 0 16px', borderBottom: '1px solid #F3F4F6' }}>
                <div>
                  <label style={labelStyle}>Year *</label>
                  <input style={{ ...inputStyle, width: 80 }} type="number" min="2000" max="2099" required
                    value={fhwaForm.mpg_year}
                    onChange={e => setFhwaForm(p => ({ ...p, mpg_year: e.target.value }))}
                    placeholder={String(new Date().getFullYear())} />
                </div>
                <div>
                  <label style={labelStyle}>Miles of Travel *</label>
                  <input style={{ ...inputStyle, width: 140 }} type="number" min="0" step="1" required
                    value={fhwaForm.ifta_miles}
                    onChange={e => setFhwaForm(p => ({ ...p, ifta_miles: e.target.value }))}
                    placeholder="e.g. 195758" />
                </div>
                <div>
                  <label style={labelStyle}>Fuel Consumed (gal) *</label>
                  <input style={{ ...inputStyle, width: 140 }} type="number" min="0" step="1" required
                    value={fhwaForm.ifta_fuel}
                    onChange={e => setFhwaForm(p => ({ ...p, ifta_fuel: e.target.value }))}
                    placeholder="e.g. 29297" />
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                  <button type="submit" disabled={fhwaSaving}
                    style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: fhwaSaving ? 0.7 : 1 }}>
                    {fhwaSaving ? 'Saving…' : fhwaEditId ? 'Update' : 'Add Row'}
                  </button>
                  {fhwaEditId && (
                    <button type="button"
                      onClick={() => { setFhwaEditId(null); setFhwaForm({ mpg_year: '', ifta_miles: '', ifta_fuel: '' }); }}
                      style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  )}
                  {fhwaMsg && <span style={{ fontSize: 12, color: fhwaMsg.startsWith('Error') ? '#DC2626' : '#059669' }}>{fhwaMsg}</span>}
                </div>
              </form>

              {/* Existing rows table */}
              {fhwaRows.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9CA3AF', padding: '12px 0 0' }}>No FHWA data entered yet.</p>
              ) : (
                <div style={{ overflowX: 'auto', marginTop: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                        {['Year','Miles of Travel','Fuel Consumed (gal)','MPG',''].map(h => (
                          <th key={h} style={{ ...thBase, padding: '8px 12px', textAlign: h === '' ? 'right' : ['Miles of Travel','Fuel Consumed (gal)','MPG'].includes(h) ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fhwaRows.map(row => {
                        const mpg = row.ifta_miles != null && row.ifta_fuel > 0
                          ? (row.ifta_miles / row.ifta_fuel).toFixed(3)
                          : '—';
                        const isEditing = fhwaEditId === row.mpg_id;
                        return (
                          <tr key={row.mpg_id} style={{ borderBottom: '1px solid #F3F4F6', background: isEditing ? '#EFF6FF' : 'transparent' }}>
                            <td style={{ padding: '7px 12px', color: '#111827', fontWeight: 600 }}>{row.mpg_year}</td>
                            <td style={{ padding: '7px 12px', color: '#374151', textAlign: 'right' }}>{row.ifta_miles?.toLocaleString() ?? '—'}</td>
                            <td style={{ padding: '7px 12px', color: '#374151', textAlign: 'right' }}>{row.ifta_fuel?.toLocaleString()  ?? '—'}</td>
                            <td style={{ padding: '7px 12px', color: '#374151', textAlign: 'right', fontWeight: 600 }}>{mpg}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button onClick={() => {
                                setFhwaEditId(row.mpg_id);
                                setFhwaForm({
                                  mpg_year:  String(row.mpg_year),
                                  ifta_miles: row.ifta_miles != null ? String(row.ifta_miles) : '',
                                  ifta_fuel:  row.ifta_fuel  != null ? String(row.ifta_fuel)  : '',
                                });
                              }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1c3660', fontSize: 14, marginRight: 6 }}>✎</button>
                              <button onClick={() => handleFhwaDelete(row.mpg_id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 14 }}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      </>}

      {/* ── New Fleet Modal ── */}
      {showFleetForm && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowFleetForm(false); }}>
          <div style={modalBox}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#111827' }}>New Fleet</h3>
            <form onSubmit={handleCreateFleet} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelStyle}>Fleet Name *</label>
                <input style={inputStyle} value={fleetForm.fleet_name} onChange={e => setFleetForm(p => ({ ...p, fleet_name: e.target.value }))} required autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>City</label>
                  <input style={inputStyle} value={fleetForm.fleet_city} onChange={e => setFleetForm(p => ({ ...p, fleet_city: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>State</label>
                  <input style={inputStyle} value={fleetForm.fleet_state} onChange={e => setFleetForm(p => ({ ...p, fleet_state: e.target.value }))} maxLength={2} placeholder="TX" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Default Duty Cycle</label>
                <select style={selectStyle} value={fleetForm.default_duty_cycle} onChange={e => setFleetForm(p => ({ ...p, default_duty_cycle: e.target.value }))}>
                  <option value="">— Select —</option>
                  {DUTY_CYCLES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
                <div style={sectionLabel}>PRIMARY CONTACT</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>First Name</label>
                    <input style={inputStyle} value={fleetForm.first_name} onChange={e => setFleetForm(p => ({ ...p, first_name: e.target.value }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Last Name</label>
                    <input style={inputStyle} value={fleetForm.last_name} onChange={e => setFleetForm(p => ({ ...p, last_name: e.target.value }))} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Email *</label>
                  <input style={inputStyle} type="email" value={fleetForm.email} onChange={e => setFleetForm(p => ({ ...p, email: e.target.value }))} required />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input style={inputStyle} value={fleetForm.phone} onChange={e => setFleetForm(p => ({ ...p, phone: e.target.value }))} placeholder="Optional" />
                </div>
                <div>
                  <label style={labelStyle}>Fleet Role *</label>
                  <select style={inputStyle} value={fleetForm.fleet_role} onChange={e => setFleetForm(p => ({ ...p, fleet_role: e.target.value }))}>
                    <option value="fleet_admin">Fleet Admin</option>
                    <option value="fleet_user">Fleet User</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setShowFleetForm(false)} style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={fleetSaving} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {fleetSaving ? 'Creating…' : 'Create Fleet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Fleet Modal ── */}
      {editFleet && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setEditFleet(null); }}>
          <div style={modalBox}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#111827' }}>Edit Fleet</h3>
            <form onSubmit={handleEditFleet} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelStyle}>Fleet Name *</label>
                <input style={inputStyle} value={editFleetForm.fleet_name} onChange={e => setEditFleetForm(p => ({ ...p, fleet_name: e.target.value }))} required autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>City</label>
                  <input style={inputStyle} value={editFleetForm.fleet_city} onChange={e => setEditFleetForm(p => ({ ...p, fleet_city: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>State</label>
                  <input style={inputStyle} value={editFleetForm.fleet_state} onChange={e => setEditFleetForm(p => ({ ...p, fleet_state: e.target.value }))} maxLength={2} placeholder="TX" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Default Duty Cycle</label>
                <select style={selectStyle} value={editFleetForm.default_duty_cycle} onChange={e => setEditFleetForm(p => ({ ...p, default_duty_cycle: e.target.value }))}>
                  <option value="">— None —</option>
                  {DUTY_CYCLES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setEditFleet(null)} style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={editFleetSaving} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {editFleetSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Contact Modal ── */}
      {contactFleetId !== null && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setContactFleetId(null); }}>
          <div style={modalBox}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#111827' }}>Add Contact</h3>
            {contactFleetId !== 'pick' && (
              <div style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>{fleets.find(f => f.fleet_id === contactFleetId)?.fleet_name}</div>
            )}
            <form onSubmit={handleCreateContact} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {contactFleetId === 'pick' && (
                <div>
                  <label style={labelStyle}>
                    Fleet * <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(For a contact at a new fleet, add the fleet first)</span>
                  </label>
                  <select style={inputStyle} value={contactForm.fleet_id} onChange={e => setContactForm(p => ({ ...p, fleet_id: e.target.value }))} required autoFocus>
                    <option value="">— Select fleet —</option>
                    <option value="0">NACFE Admin</option>
                    {[...fleets].sort((a, b) => a.fleet_name.localeCompare(b.fleet_name)).map(f => (
                      <option key={f.fleet_id} value={f.fleet_id}>{f.fleet_name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>First Name</label>
                  <input style={inputStyle} value={contactForm.first_name} onChange={e => setContactForm(p => ({ ...p, first_name: e.target.value }))} autoFocus />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Last Name</label>
                  <input style={inputStyle} value={contactForm.last_name} onChange={e => setContactForm(p => ({ ...p, last_name: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input style={inputStyle} type="email" value={contactForm.email} onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))} required />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} value={contactForm.phone} onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))} placeholder="Optional" />
              </div>
              {(() => {
                const fid = contactFleetId === 'pick' ? contactForm.fleet_id : contactFleetId;
                return fid && String(fid) !== '0' ? (
                  <div>
                    <label style={labelStyle}>Fleet Role</label>
                    <select style={inputStyle} value={contactForm.fleet_role} onChange={e => setContactForm(p => ({ ...p, fleet_role: e.target.value }))}>
                      <option value="fleet_user">Fleet User</option>
                      <option value="fleet_admin">Fleet Admin</option>
                    </select>
                  </div>
                ) : null;
              })()}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setContactFleetId(null)} style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={contactSaving} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {contactSaving ? 'Adding…' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Contact Modal ── */}
      {editContact && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setEditContact(null); }}>
          <div style={{ ...modalBox, maxWidth: 480 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#111827' }}>Edit Contact</h3>
            <form onSubmit={handleEditContact} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>First Name</label>
                  <input style={inputStyle} value={editContactForm.first_name} onChange={e => setEditContactForm(p => ({ ...p, first_name: e.target.value }))} autoFocus />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Last Name</label>
                  <input style={inputStyle} value={editContactForm.last_name} onChange={e => setEditContactForm(p => ({ ...p, last_name: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input style={inputStyle} type="email" value={editContactForm.email} onChange={e => setEditContactForm(p => ({ ...p, email: e.target.value }))} required />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} value={editContactForm.phone} onChange={e => setEditContactForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <label style={{ ...labelStyle, margin: 0 }}>Status</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ label: 'Active', val: true }, { label: 'Inactive', val: false }].map(({ label, val }) => (
                    <button key={label} type="button"
                      onClick={() => setEditContactForm(p => ({ ...p, active: val }))}
                      style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 5, border: '1px solid',
                        background: editContactForm.active === val ? (val ? '#059669' : '#EF4444') : '#fff',
                        color: editContactForm.active === val ? '#fff' : '#6B7280',
                        borderColor: editContactForm.active === val ? (val ? '#059669' : '#EF4444') : '#D1D5DB' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setEditContact(null)} style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={editContactSaving} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {editContactSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>

            {/* Fleet Access section — manage which fleets this contact can access */}
            <div style={{ borderTop: '1px solid #E5E7EB', marginTop: 16, paddingTop: 14 }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Fleet Access</p>
              {contactFleetAssocs.length === 0 && (
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9CA3AF' }}>No fleet associations yet.</p>
              )}
              {contactFleetAssocs.map(fa => (
                <div key={fa.fleet_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 12, color: '#111827', fontWeight: 500 }}>{fa.fleet_name}</span>
                  <span style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6', borderRadius: 4, padding: '2px 6px' }}>
                    {fa.fleet_role === 'fleet_admin' ? 'Admin' : 'User'}
                  </span>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Remove ${editContact.first_name || 'this contact'} from ${fa.fleet_name}?`)) return;
                      setAssocSaving(true);
                      await fetch(`/api/admin/contacts/${editContact.contact_id}/fleets/${fa.fleet_id}`, { method: 'DELETE', headers: authHeaders });
                      const d = await fetch(`/api/admin/contacts/${editContact.contact_id}/fleets`, { headers: authHeaders }).then(r => r.json());
                      setContactFleetAssocs(d.fleets || []);
                      fetchFleets();
                      setAssocSaving(false);
                    }}
                    disabled={assocSaving}
                    style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
                    title="Remove from this fleet"
                  >✕</button>
                </div>
              ))}

              {/* Add to another fleet */}
              {isAdminRole && (() => {
                const available = fleets.filter(f => !contactFleetAssocs.some(a => a.fleet_id === f.fleet_id));
                if (available.length === 0) return null;
                return (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                    <select value={addFleetId} onChange={e => setAddFleetId(e.target.value)}
                      style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '4px 6px' }}>
                      <option value="">— Select fleet —</option>
                      {available.map(f => <option key={f.fleet_id} value={f.fleet_id}>{f.fleet_name}</option>)}
                    </select>
                    <select value={addFleetRole} onChange={e => setAddFleetRole(e.target.value)}
                      style={{ ...inputStyle, width: 80, fontSize: 12, padding: '4px 6px' }}>
                      <option value="fleet_user">User</option>
                      <option value="fleet_admin">Admin</option>
                    </select>
                    <button
                      onClick={async () => {
                        if (!addFleetId) return;
                        setAssocSaving(true);
                        await fetch(`/api/admin/contacts/${editContact.contact_id}/fleets`, {
                          method: 'POST', headers: authHeaders,
                          body: JSON.stringify({ fleet_id: parseInt(addFleetId), fleet_role: addFleetRole }),
                        });
                        const d = await fetch(`/api/admin/contacts/${editContact.contact_id}/fleets`, { headers: authHeaders }).then(r => r.json());
                        setContactFleetAssocs(d.fleets || []);
                        setAddFleetId('');
                        fetchFleets();
                        setAssocSaving(false);
                      }}
                      disabled={!addFleetId || assocSaving}
                      style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: addFleetId ? 'pointer' : 'not-allowed', opacity: addFleetId ? 1 : 0.5 }}
                    >Add</button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* ── New Technology Modal ── */}
      {showTechForm && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowTechForm(false); }}>
          <div style={{ ...modalBox, maxWidth: 520 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#111827' }}>New Technology</h3>
            <form onSubmit={handleCreateTech} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <TechFormFields form={techForm} setForm={setTechForm} techGroups={techGroups} labelStyle={labelStyle} inputStyle={inputStyle} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setShowTechForm(false)} style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={techSaving} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {techSaving ? 'Adding…' : 'Add Technology'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Technology Modal ── */}
      {editTech && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setEditTech(null); }}>
          <div style={{ ...modalBox, maxWidth: 520 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#111827' }}>Edit Technology</h3>
            <form onSubmit={handleEditTech} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <TechFormFields form={editTechForm} setForm={setEditTechForm} techGroups={techGroups} labelStyle={labelStyle} inputStyle={inputStyle} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setEditTech(null)} style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={editTechSaving} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {editTechSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Settings Panel ── */}
      {showSettings && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div style={{ ...modalBox, maxWidth: 380 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#111827' }}>Settings</h3>
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #E5E7EB' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Example Fleet Reset</p>
                  <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6B7280' }}>
                    Deletes all input data for the demo fleet. Use this to reset the demo account.
                  </p>
                  <button type="button" onClick={handleResetExampleFleet} disabled={resetting}
                    style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {resetting ? 'Resetting…' : 'Reset Demo Fleet'}
                  </button>
                  {resetMsg && <p style={{ margin: '6px 0 0', fontSize: 12, color: resetMsg.includes('cleared') ? '#059669' : '#DC2626' }}>{resetMsg}</p>}
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Fleet Input Years</p>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6B7280' }}>
                  Set the range of years that fleets can enter or edit data for. The "From" year should generally be left at 2003. Note that fleets will only be able to update years for which they have not yet submitted data.
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>From</label>
                    <input style={inputStyle} type="number" min="2003" max={new Date().getFullYear()}
                      value={settingsForm.editable_year_from}
                      onChange={e => setSettingsForm(p => ({ ...p, editable_year_from: e.target.value }))}
                      placeholder="2003"
                      required />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>To</label>
                    <input style={inputStyle} type="number" min="2003" max={new Date().getFullYear()}
                      value={settingsForm.editable_year_to}
                      onChange={e => setSettingsForm(p => ({ ...p, editable_year_to: e.target.value }))}
                      required />
                  </div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16, marginTop: 4 }}>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Invite Email Template</p>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6B7280' }}>
                  Variables: <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>{'{first_name}'}</code> <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>{'{inviter_name}'}</code> <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>{'{fleet_name}'}</code> <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>{'{email}'}</code> <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>{'{temp_password}'}</code>
                </p>
                <textarea
                  rows={7}
                  style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                  value={settingsForm.invite_email_template}
                  onChange={e => setSettingsForm(p => ({ ...p, invite_email_template: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setShowSettings(false)} style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={settingsSaving} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {settingsSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const searchParams  = new URLSearchParams(window.location.search);
  const previewToken  = searchParams.get('preview');
  const resetToken    = searchParams.get('reset');
  const [authed, setAuthed] = useState(!!(previewToken || localStorage.getItem('token')));
  const [entering, setEntering] = useState(false);
  const [token, setToken] = useState(previewToken || localStorage.getItem('token') || null);
  const [fleetState, setFleetState] = useState(null);
  const [general, setGeneral] = useState({});
  const [tech, setTech] = useState({});
  const [techCategories, setTechCategories] = useState({});
  const [selectedConfig, setSelectedConfig] = useState(1);
  const [chartData, setChartData] = useState({});
  const [saveCount, setSaveCount] = useState(0);
  const notifySave = () => setSaveCount(n => n + 1);
  const [submittedYears,      setSubmittedYears]      = useState([]);
  const [utilSubmittedYears,  setUtilSubmittedYears]  = useState([]); // years locked in utilization table
  const [equipSubmittedYears, setEquipSubmittedYears] = useState([]); // years locked in fleet equip table
  const [editableYears,       setEditableYears]       = useState([2024, 2025]);
  const [isNewFleet,          setIsNewFleet]          = useState(false);
  const [minDataYear,         setMinDataYear]         = useState(null);
  const [showInterview,  setShowInterview]  = useState(false);
  const [interviewProgress, setInterviewProgress] = useState(null);
  const [interviewProgressLoaded, setInterviewProgressLoaded] = useState(false);
  const [interviewInputsByCAB, setInterviewInputsByCAB] = useState({});
  const [page, setPage] = useState('dashboard'); // 'dashboard' | 'benchmark'

  useEffect(() => {
    if (!token) return;
    fetch('/api/submission-status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          const submitted = d.submittedYears || [];
          setSubmittedYears(submitted);
          setEditableYears(d.editableYears  || [2024, 2025]);
          setIsNewFleet(!!d.isNewFleet);

          // Per-table submitted years: only lock a year in a specific table when
          // that table actually has data for that year.  Using the global
          // submittedYears everywhere would lock empty tables (e.g. utilization
          // that has no rows) just because MPG/tech was submitted for the same year.
          setUtilSubmittedYears(submitted.filter(yr => (d.utilization?.[yr] || 0) > 0));
          setEquipSubmittedYears(submitted.filter(yr => (d.fleetEquip?.[yr]  || 0) > 0));

          // minDataYear is derived only from actual data rows, NOT submission records.
          // Including submission records could pull the floor back to years where
          // a fleet has no data at all (e.g. phantom records created by old code).
          const dataYrs = [
            ...Object.keys(d.tech        || {}),
            ...Object.keys(d.fuel        || {}),
            ...Object.keys(d.utilization || {}),
            ...Object.keys(d.fleetEquip  || {}),
          ].map(Number).filter(n => !isNaN(n));
          setMinDataYear(dataYrs.length > 0 ? Math.min(...dataYrs) : null);
        }
      })
      .catch(console.error);
  }, [token, saveCount]);

  // Load interview progress from server (shared across all fleet users)
  useEffect(() => {
    if (!token) return;
    fetch('/api/interview/progress', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : {})
      .then(d => {
        if (d.progress) setInterviewProgress(d.progress);
        setInterviewProgressLoaded(true);
      })
      .catch(() => setInterviewProgressLoaded(true));
  }, [token]);

  const saveInterviewProgress = (progress) => {
    if (!token) return;
    fetch('/api/interview/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ progress }),
    }).catch(console.error);
  };

  const onSubmit = async (yr) => {
    try {
      await fetch(`/api/submit/${yr}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) { console.error(err); }
    setSaveCount(n => n + 1);
  };

  const fleet = fleetState;
  const latestYear = fleet?.submissionYears?.length ? Math.max(...fleet.submissionYears) : (Object.keys(general).length ? Math.max(...Object.keys(general).map(Number)) : null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const headers = { 'Authorization': `Bearer ${token}` };
        // refresh fleet info
        const fleetRes = await fetch('/api/fleet/me', { headers });
        if (fleetRes.ok) {
          const j = await fleetRes.json();
          if (j.fleet) setFleetState(j.fleet);
        }

        const generalRes = await fetch('/api/general', { headers });
        if (generalRes.ok) {
          const g = await generalRes.json();
          setGeneral(g || {});
        }

        // techs are fetched in a separate effect based on selected config

        const chartRes = await fetch('/api/chart-data', { headers });
        if (chartRes.ok) {
          const c = await chartRes.json();
          setChartData(c || {});
        }
      } catch (err) {
        console.error('Failed to fetch initial data', err);
      }
    })();
  }, [token]);

  // fetch techs for the selected config
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const headers = { 'Authorization': `Bearer ${token}` };
        const techRes = await fetch(`/api/techs?config=${selectedConfig}`, { headers });
        if (techRes.ok) {
          const t = await techRes.json();
          // new shape { data, categories, configs }
          setTech(t.data || {});
          setTechCategories(t.categories || {});
          if (Array.isArray(t.configs) && t.configs.length) {
            const hasSelected = t.configs.some(c => (typeof c === 'object' ? c.config === selectedConfig : c === selectedConfig));
            if (!hasSelected) {
              const first = t.configs[0];
              setSelectedConfig(typeof first === 'object' ? first.config : first);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch techs', err);
      }
    })();
  }, [token, selectedConfig]);

  // Decode fleet_id from JWT without a library (payload is base64 JSON)
  const { isAdmin, isFleetAdmin, isDemo } = (() => {
    if (!token) return { isAdmin: false, isFleetAdmin: false, isDemo: false };
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        isAdmin: payload.fleet_id === 0,
        isFleetAdmin: payload.fleet_role === 'fleet_admin',
        isDemo: payload.email === 'demo@nacfe.org',
      };
    } catch { return { isAdmin: false, isFleetAdmin: false, isDemo: false }; }
  })();

  const handleLogin = (tok, fleetObj) => {
    localStorage.setItem('token', tok);
    setToken(tok);
    if (fleetObj) setFleetState(fleetObj);
    setAuthed(true);
    setTimeout(() => window.location.reload(), 0);
  };

  // Team / invite state
  const [showTeam, setShowTeam] = useState(false);
  const [teamContacts, setTeamContacts] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteRows, setInviteRows] = useState([{ first_name: '', last_name: '', email: '', phone: '', fleet_role: 'fleet_user' }]);
  const [inviting, setInviting] = useState(false);
  const [inviteResults, setInviteResults] = useState([]);
  const [inviteEmailBody, setInviteEmailBody] = useState('');
  const [teamRoleChanging, setTeamRoleChanging] = useState(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  const fetchTeamContacts = async () => {
    setTeamLoading(true);
    try {
      const r = await fetch('/api/fleet/contacts', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setTeamContacts(d.contacts || []); }
    } catch {}
    finally { setTeamLoading(false); }
  };

  const fetchInviteTemplate = async () => {
    try {
      const r = await fetch('/api/fleet/invite-template', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); if (d.template) setInviteEmailBody(d.template); }
    } catch {}
  };

  const handleTeamRoleChange = async (contactId, newRole) => {
    setTeamRoleChanging(contactId);
    try {
      const r = await fetch(`/api/fleet/contacts/${contactId}/role`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Failed to update role'); return; }
      setTeamContacts(prev => prev.map(c => c.contact_id === contactId ? { ...c, fleet_role: newRole } : c));
    } catch { alert('Network error'); }
    finally { setTeamRoleChanging(null); }
  };

  const handleRemoveTeamMember = async (contactId) => {
    if (!window.confirm('Remove this user from your fleet portal?')) return;
    try {
      const r = await fetch(`/api/fleet/contacts/${contactId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Failed to remove user'); return; }
      setTeamContacts(prev => prev.filter(c => c.contact_id !== contactId));
    } catch { alert('Network error'); }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    const toInvite = inviteRows.filter(r => r.email.trim());
    if (!toInvite.length) return;
    setInviting(true); setInviteResults([]);
    try {
      const r = await fetch('/api/fleet/invite', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: toInvite, ...(inviteEmailBody.trim() ? { email_body: inviteEmailBody } : {}) }),
      });
      const d = await r.json();
      setInviteResults(d.results || []);
      const anyOk = (d.results || []).some(r => r.ok);
      if (anyOk) {
        setInviteRows([{ first_name: '', last_name: '', email: '', phone: '', fleet_role: 'fleet_user' }]);
        fetchInviteTemplate();
        fetchTeamContacts();
      }
    } catch { setInviteResults([{ email: '—', ok: false, error: 'Network error' }]); }
    finally { setInviting(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { setPwMsg('Passwords do not match'); return; }
    setPwSaving(true); setPwMsg('');
    try {
      const r = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
      });
      const d = await r.json();
      if (r.ok) { setPwMsg('Password changed successfully.'); setPwForm({ current: '', next: '', confirm: '' }); }
      else setPwMsg(d.error || 'Failed to change password');
    } catch { setPwMsg('Network error'); }
    finally { setPwSaving(false); }
  };

  const handleSignOut = () => {
    localStorage.removeItem('token');
    setAuthed(false);
    setToken(null);
  };

  // Redirect to login if token is expired
  useEffect(() => {
    const checkExpiry = () => {
      const tok = localStorage.getItem('token');
      if (!tok) return;
      try {
        const { exp } = JSON.parse(atob(tok.split('.')[1]));
        if (exp && exp * 1000 < Date.now()) handleSignOut();
      } catch {}
    };
    checkExpiry();
    const id = setInterval(checkExpiry, 60_000);
    return () => clearInterval(id);
  }, []);

  if (resetToken) return <ResetPasswordScreen token={resetToken} onDone={() => window.location.href = '/'} />;
  if (!authed) return <LoginScreen onLogin={handleLogin} />;
  if (isAdmin) return <AdminView token={token} onSignOut={handleSignOut} />;

  return (
    <div style={styles.app}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <img src="/nacfe-logo.png" alt="NACFE" style={styles.sidebarLogoImg} />
        </div>
        <nav style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { id: 'dashboard', label: 'Data' },
            ...(!isDemo && (!isNewFleet || submittedYears.length > 0) ? [{ id: 'benchmark', label: 'Benchmarking' }] : []),
            ...(!isDemo && isFleetAdmin ? [{ id: 'team', label: 'Team' }] : []),
          ].map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 20px', border: 'none', cursor: 'pointer',
              background: page === item.id ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: page === item.id ? '#FFFFFF' : '#9CA3AF',
              fontSize: 14, fontWeight: page === item.id ? 700 : 400,
              borderLeft: page === item.id ? '3px solid #A41C24' : '3px solid transparent',
            }}>{item.label}</button>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>
          <div style={styles.fleetChip}>
            <div style={styles.fleetAvatar}>{fleet?.name?.[0]}</div>
            <div>
              <div style={styles.fleetName}>{fleet?.name}</div>
              <div style={styles.fleetMeta}>{fleet?.hq}</div>
            </div>
          </div>
          <button onClick={() => { setShowChangePassword(true); setPwMsg(''); }} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 12, cursor: 'pointer', padding: '4px 0', textAlign: 'left', width: '100%' }}>Change password</button>
          <button style={styles.btnSignOut} onClick={handleSignOut}>Sign out</button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        {page === 'benchmark' && <BenchmarkPage token={token} />}
        {page === 'team' && (() => {
          if (!showTeam) { setShowTeam(true); fetchTeamContacts(); fetchInviteTemplate(); }
          const fleetAdminCount = teamContacts.filter(c => c.fleet_role === 'fleet_admin').length;
          return (
            <div style={{ padding: '32px 40px', maxWidth: 900 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Team</h1>
              <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 28px' }}>Manage who has access to your fleet's portal.</p>

              {/* Current members */}
              <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 28 }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Current Members</span>
                </div>
                {teamLoading ? (
                  <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                        <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: 12 }}>Name</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: 12 }}>Email</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: 12 }}>Last Login</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: 12 }}>Role</th>
                        <th style={{ padding: '10px 12px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamContacts.map(c => {
                        const role = c.fleet_role || 'fleet_user';
                        const isLastAdmin = role === 'fleet_admin' && fleetAdminCount === 1;
                        return (
                          <tr key={c.contact_id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                            <td style={{ padding: '10px 20px', color: '#111827', fontWeight: 500 }}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
                            <td style={{ padding: '10px 12px', color: '#374151' }}>{c.email}</td>
                            <td style={{ padding: '10px 12px', color: '#6B7280' }}>
                              {c.last_login ? new Date(c.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <select value={role} disabled={teamRoleChanging === c.contact_id || isLastAdmin}
                                onChange={e => handleTeamRoleChange(c.contact_id, e.target.value)}
                                title={isLastAdmin ? 'Cannot remove last fleet admin' : ''}
                                style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid #D1D5DB', background: '#fff', cursor: isLastAdmin ? 'not-allowed' : 'pointer' }}>
                                <option value="fleet_admin">Fleet Admin</option>
                                <option value="fleet_user">Fleet User</option>
                              </select>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              <button onClick={() => handleRemoveTeamMember(c.contact_id)} disabled={isLastAdmin}
                                title={isLastAdmin ? 'Cannot remove last fleet admin' : 'Remove user'}
                                style={{ background: 'none', border: 'none', color: isLastAdmin ? '#D1D5DB' : '#DC2626', cursor: isLastAdmin ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                      {teamContacts.length === 0 && (
                        <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>No members yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Invite users */}
              <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Invite Users</span>
                </div>
                <form onSubmit={handleInvite} style={{ padding: '16px 20px' }}>
                  {inviteRows.map((row, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <input placeholder="First name" value={row.first_name}
                        onChange={e => setInviteRows(rows => rows.map((r, j) => j === i ? { ...r, first_name: e.target.value } : r))}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13 }} />
                      <input placeholder="Last name" value={row.last_name}
                        onChange={e => setInviteRows(rows => rows.map((r, j) => j === i ? { ...r, last_name: e.target.value } : r))}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13 }} />
                      <input placeholder="Email *" required={i === 0} type="email" value={row.email}
                        onChange={e => setInviteRows(rows => rows.map((r, j) => j === i ? { ...r, email: e.target.value } : r))}
                        style={{ flex: 2, padding: '7px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13 }} />
                      <input placeholder="Phone" value={row.phone}
                        onChange={e => setInviteRows(rows => rows.map((r, j) => j === i ? { ...r, phone: e.target.value } : r))}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13 }} />
                      <select value={row.fleet_role}
                        onChange={e => setInviteRows(rows => rows.map((r, j) => j === i ? { ...r, fleet_role: e.target.value } : r))}
                        style={{ padding: '7px 8px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 12 }}>
                        <option value="fleet_user">Fleet User</option>
                        <option value="fleet_admin">Fleet Admin</option>
                      </select>
                      {inviteRows.length > 1 && (
                        <button type="button" onClick={() => setInviteRows(rows => rows.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }}>✕</button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setInviteRows(rows => [...rows, { first_name: '', last_name: '', email: '', phone: '', fleet_role: 'fleet_user' }])}
                    style={{ background: 'none', border: 'none', color: '#1c3660', fontSize: 13, cursor: 'pointer', padding: '4px 0', marginBottom: 16 }}>
                    + Add another
                  </button>
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>Invite Email</p>
                    <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 8px' }}>
                      Edit the message that will be sent. Variables:{' '}
                      {['{first_name}', '{inviter_name}', '{fleet_name}', '{email}', '{temp_password}'].map(v => (
                        <code key={v} style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: 3, fontSize: 11, marginRight: 4 }}>{v}</code>
                      ))}
                    </p>
                    <textarea rows={8} value={inviteEmailBody}
                      onChange={e => setInviteEmailBody(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  {inviteResults.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      {inviteResults.map((r, i) => (
                        <div key={i} style={{ fontSize: 12, color: r.ok ? '#059669' : '#DC2626', marginBottom: 2 }}>
                          {r.email}: {r.ok ? 'Invited successfully' : r.error}
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="submit" disabled={inviting}
                    style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {inviting ? 'Sending…' : 'Send Invites'}
                  </button>
                </form>
              </div>
            </div>
          );
        })()}
        {page === 'dashboard' && <>
        <header style={styles.mainHeader}>
            <div>
              <h1 style={styles.mainTitle}>Dashboard</h1>
              <p style={styles.mainSub}>Last submission: {fleet?.lastSubmission ?? '—'} · Survey year {latestYear ?? '—'}</p>
            </div>
        </header>

        {/* Interview modal rendered at top level */}
        {showInterview && (
          <InterviewModal
            token={token}
            effectiveEditableYears={editableYears}
            savedProgress={interviewProgress}
            interviewInputsByCAB={interviewInputsByCAB}
            onComplete={async (interviewCabType, newTechEdits, rawGroupInputs, fuelRows, utilEditsMap, equipEditsMap, shouldSubmit) => {
              if (rawGroupInputs) setInterviewInputsByCAB(prev => ({ ...prev, [interviewCabType]: rawGroupInputs }));
              const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
              const saves = [];
              // Save tech adoption rows
              if (newTechEdits) {
                for (const [yr, techs] of Object.entries(newTechEdits)) {
                  const hasData = Object.values(techs).some(v => v !== '' && v != null);
                  if (hasData)
                    saves.push(fetch(`/api/techs/${yr}`, {
                      method: 'PUT', headers,
                      body: JSON.stringify({ cab_type: interviewCabType, techs }),
                    }));
                }
              }
              // Save fuel rows
              if (fuelRows && fuelRows.length > 0) {
                const byYear = {};
                for (const r of fuelRows) { if (!byYear[r.year]) byYear[r.year] = []; byYear[r.year].push(r); }
                saves.push(...Object.entries(byYear).map(([yr, rows]) =>
                  fetch(`/api/fuel/${yr}`, { method: 'PUT', headers, body: JSON.stringify({ rows }) })
                ));
              }
              // Save equipment utilization rows
              if (utilEditsMap) {
                const pctRatio = s => s !== '' && s != null ? parseFloat(s) / 100 : null;
                for (const [yr, rows] of Object.entries(utilEditsMap)) {
                  const utilRows = rows.filter(r => r.application).map(r => ({
                    application: r.application,
                    tractors: r.tractors !== '' ? parseInt(r.tractors) : null,
                    trailers: r.trailers !== '' ? parseInt(r.trailers) : null,
                    grossed_out_perc: pctRatio(r.grossed_out_pct),
                    cubed_out_perc:   pctRatio(r.cubed_out_pct),
                    ave_length_haul:  r.ave_length_haul !== '' ? parseInt(r.ave_length_haul) : null,
                    empty_miles_perc: pctRatio(r.empty_miles_pct),
                  }));
                  if (utilRows.length > 0)
                    saves.push(fetch(`/api/fleet-details/${yr}`, { method: 'PUT', headers, body: JSON.stringify({ utilization: utilRows }) }));
                }
              }
              // Save fleet equipment rows
              if (equipEditsMap) {
                for (const [yr, rows] of Object.entries(equipEditsMap)) {
                  const equipRows = rows.filter(r => r.qty || r.tractor_make || r.cab_type);
                  if (equipRows.length > 0)
                    saves.push(fetch(`/api/fleet-equip/${yr}`, { method: 'PUT', headers, body: JSON.stringify({ rows: equipRows }) }));
                }
              }
              await Promise.all(saves);
              // Submit if requested
              if (shouldSubmit) {
                await fetch('/api/submit-all', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
              }
              // Clear server-side progress
              saveInterviewProgress(null);
              setInterviewProgress(null);
              setShowInterview(false);
              notifySave();
            }}
            onSaveAndExit={async (interviewCabType, partialTechEdits, progressState, fuelRows, utilEditsMap, equipEditsMap) => {
              setInterviewInputsByCAB(prev => ({ ...prev, [interviewCabType]: progressState.groupInputs }));
              const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
              const saves = [];
              // Save completed tech adoption groups
              if (partialTechEdits) {
                for (const [yr, techs] of Object.entries(partialTechEdits)) {
                  const hasData = Object.values(techs).some(v => v !== '' && v != null);
                  if (hasData)
                    saves.push(fetch(`/api/techs/${yr}`, {
                      method: 'PUT', headers,
                      body: JSON.stringify({ cab_type: interviewCabType, techs }),
                    }));
                }
              }
              // Save fuel rows
              if (fuelRows && fuelRows.length > 0) {
                const byYear = {};
                for (const r of fuelRows) { if (!byYear[r.year]) byYear[r.year] = []; byYear[r.year].push(r); }
                saves.push(...Object.entries(byYear).map(([yr, rows]) =>
                  fetch(`/api/fuel/${yr}`, { method: 'PUT', headers, body: JSON.stringify({ rows }) })
                ));
              }
              // Save util rows
              if (utilEditsMap) {
                const pctRatio = s => s !== '' && s != null ? parseFloat(s) / 100 : null;
                for (const [yr, rows] of Object.entries(utilEditsMap)) {
                  const utilRows = rows.filter(r => r.application).map(r => ({
                    application: r.application,
                    tractors: r.tractors !== '' ? parseInt(r.tractors) : null,
                    trailers: r.trailers !== '' ? parseInt(r.trailers) : null,
                    grossed_out_perc: pctRatio(r.grossed_out_pct),
                    cubed_out_perc:   pctRatio(r.cubed_out_pct),
                    ave_length_haul:  r.ave_length_haul !== '' ? parseInt(r.ave_length_haul) : null,
                    empty_miles_perc: pctRatio(r.empty_miles_pct),
                  }));
                  if (utilRows.length > 0)
                    saves.push(fetch(`/api/fleet-details/${yr}`, { method: 'PUT', headers, body: JSON.stringify({ utilization: utilRows }) }));
                }
              }
              // Save equip rows
              if (equipEditsMap) {
                for (const [yr, rows] of Object.entries(equipEditsMap)) {
                  const equipRows = rows.filter(r => r.qty || r.tractor_make || r.cab_type);
                  if (equipRows.length > 0)
                    saves.push(fetch(`/api/fleet-equip/${yr}`, { method: 'PUT', headers, body: JSON.stringify({ rows: equipRows }) }));
                }
              }
              await Promise.all(saves);
              saveInterviewProgress(progressState);
              setInterviewProgress(progressState);
              setShowInterview(false);
              notifySave();
            }}
            onClose={() => setShowInterview(false)}
          />
        )}

        {/* Submit panel — shown once fleet has data to submit */}
        <SubmitPanel
          token={token}
          editableYears={editableYears}
          submittedYears={submittedYears}
          saveCount={saveCount}
          onSubmitted={notifySave}
        />

        {/* Charts row — replaced with welcome card for new fleets */}
        {isNewFleet && interviewProgressLoaded && submittedYears.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', padding: '32px 36px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#1c3660' }}>Welcome to the Fleet Efficiency Study</h2>
              <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>Let's get your fleet's data set up.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <div style={{ background: '#F0F7FF', borderRadius: 10, padding: '16px 20px' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 13, color: '#1c3660' }}>What you'll unlock</p>
                <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.65 }}>
                  Once your data is entered, you'll be able to benchmark your fleet's technology adoption rates and fuel efficiency (MPG) against other participating study fleets.
                </p>
              </div>
              <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '16px 20px' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 13, color: '#1c3660' }}>How to fill it out</p>
                <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.65 }}>
                  Complete the survey to the best of your ability — we're not looking for perfection, just directionally accurate data.
                  Go back in time as far as your records allow.
                </p>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 14, color: '#111827' }}>Ready to get started?</p>
                <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
                  Use the guided interview to walk through each section step by step, or scroll down and fill out the forms directly.
                </p>
              </div>
              {!interviewProgress ? (
                <button onClick={() => setShowInterview(true)} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Start New Fleet Interview →
                </button>
              ) : (
                <button onClick={() => setShowInterview(true)} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Continue where I left off →
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={styles.chartsRow}>
            <div style={{flex:"1 1 400px", minWidth:0}}>
              <MpgChart chartData={chartData} fleetName={fleetState?.name} />
            </div>
            <div style={{flex:"1 1 320px", minWidth:0}}>
              <SubmissionHistory token={token} saveCount={saveCount} submittedYears={submittedYears} onSubmit={onSubmit} editableYears={editableYears} isNewFleet={isNewFleet} />
            </div>
          </div>
        )}

        {/* Fleet Details Table */}
        <FleetDetailsTable token={token} onSave={notifySave} submittedYears={utilSubmittedYears} editableYears={editableYears} minDataYear={minDataYear} />

        {/* Fleet Equipment Table */}
        <FleetEquipTable token={token} onSave={notifySave} submittedYears={equipSubmittedYears} editableYears={editableYears} minDataYear={minDataYear} />

        {/* Fuel Table */}
        <FuelTable token={token} onSave={notifySave} submittedYears={submittedYears} editableYears={editableYears} minDataYear={minDataYear} />

        {/* Tech Adoption Card */}
        <TechAdoptionCard token={token} onSave={notifySave} editableYears={editableYears} submittedYears={submittedYears} />
        </>}
      </main>

      {/* Change Password modal */}
      {showChangePassword && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowChangePassword(false); }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 18px', fontSize: 16, color: '#111827' }}>Change Password</h3>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Current Password</label>
                <input type="password" required value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>New Password</label>
                <input type="password" required minLength={8} value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Confirm New Password</label>
                <input type="password" required value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              {pwMsg && <p style={{ margin: 0, fontSize: 12, color: pwMsg.includes('success') ? '#059669' : '#DC2626' }}>{pwMsg}</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setShowChangePassword(false)}
                  style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={pwSaving}
                  style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {pwSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Data Entry Modal */}
      {entering && (
        <DataEntryForm
          fleet={fleet}
          categories={techCategories}
          prevTech={tech[latestYear] || {}}
          generalData={general}
          onCancel={() => setEntering(false)}
          onSave={() => setEntering(false)}
        />
      )}
    </div>
  );
}

// ─── Submit Panel ─────────────────────────────────────────────────────────────

function SubmitPanel({ token, editableYears, submittedYears, saveCount, onSubmitted }) {
  const [status,    setStatus]    = useState(null); // null | 'checking-optional' | 'submitting' | 'done' | 'error'
  const [hasUtil,   setHasUtil]   = useState(null); // null = not yet checked
  const [hasEquip,  setHasEquip]  = useState(null);
  const [mpgYears,  setMpgYears]  = useState({});   // { year: mpg }
  const [techYears, setTechYears] = useState({});   // { year: avgPct }
  const [loadedCount, setLoadedCount] = useState(0);

  const neededYears = [...editableYears].sort((a, b) => a - b);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/chart-data', { headers }).then(r => r.ok ? r.json() : {}),
      fetch('/api/fleet-details', { headers }).then(r => r.ok ? r.json() : {}),
      fetch('/api/fleet-equip',   { headers }).then(r => r.ok ? r.json() : {}),
    ]).then(([chartData, utilData, equipData]) => {
      setMpgYears(chartData.ownMpg || {});
      // Combine sleeper + day cab adoption — if either cab type has data for the year, count it
      const combined = {};
      for (const [yr, v] of Object.entries(chartData.sleeperAdoption || {})) combined[yr] = v;
      for (const [yr, v] of Object.entries(chartData.dayCabAdoption  || {})) {
        if (combined[yr] == null) combined[yr] = v;
      }
      setTechYears(combined);
      setHasUtil(Object.keys(utilData).some(yr => (utilData[yr]?.utilization || []).length > 0));
      setHasEquip(Object.keys(equipData).some(yr => (equipData[yr] || []).length > 0));
      setLoadedCount(c => c + 1);
    }).catch(() => {});
  }, [token, saveCount]);

  // Years where the fleet actually has data (MPG or tech adoption).
  // Using the full editable range as the base so we don't miss years outside the default window.
  const dataYears = neededYears.filter(yr => mpgYears[yr] != null || techYears[yr] != null);

  // Required = the 2 most recent years WITH any fleet data (not the 2 most recent editable years).
  // This prevents blocking submission when the last editable year (e.g. 2026) has no data yet.
  const requiredYears = dataYears.length >= 2 ? dataYears.slice(-2)
                      : dataYears.length === 1 ? dataYears.slice()
                      : neededYears.slice(-2); // fallback: nothing loaded yet

  const missingRequired = requiredYears.filter(yr =>
    (mpgYears[yr] == null) || (techYears[yr] == null)
  );
  // Must have at least some data AND the required years must be complete
  const canSubmit = dataYears.length > 0 && missingRequired.length === 0;
  const alreadySubmitted = dataYears.length > 0 && requiredYears.every(yr => submittedYears.includes(yr));
  // Only create submission records for years that actually have data
  const unsubmitted = dataYears.filter(yr => !submittedYears.includes(yr));

  const doSubmit = async () => {
    setStatus('submitting');
    try {
      await Promise.all(unsubmitted.map(yr =>
        fetch(`/api/submit/${yr}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      ));
      setStatus('done');
      onSubmitted?.();
    } catch {
      setStatus('error');
    }
  };

  const handleSubmitClick = () => {
    if (!canSubmit) return;
    if (alreadySubmitted) return;
    if (!hasUtil || !hasEquip) {
      setStatus('checking-optional');
    } else {
      doSubmit();
    }
  };

  if (alreadySubmitted) return null;
  if (loadedCount === 0) return null; // still loading
  if (!canSubmit) return null; // not enough data yet

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 15, color: '#111827' }}>Submit Fleet Efficiency Study Data</p>
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            Submit your data for {unsubmitted.join(', ')} to the Fleet Efficiency Study.
          </p>
        </div>
        <button
          onClick={handleSubmitClick}
          disabled={!canSubmit || status === 'submitting'}
          title={!canSubmit ? `Missing required data for: ${missingRequired.join(', ')} (tech adoption and MPG required)` : undefined}
          style={{
            background: canSubmit ? '#1c3660' : '#E5E7EB',
            color: canSubmit ? '#fff' : '#9CA3AF',
            border: 'none', borderRadius: 8, padding: '10px 24px',
            fontSize: 14, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
          }}
        >
          {status === 'submitting' ? 'Submitting…' : status === 'done' ? 'Submitted ✓' : 'Submit'}
        </button>
      </div>

      {/* Required data checklist */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {requiredYears.map(yr => {
          const hasMpg  = mpgYears[yr] != null;
          const hasTech = techYears[yr] != null;
          const ok = hasMpg && hasTech;
          return (
            <div key={yr} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              borderRadius: 6, background: ok ? '#F0FDF4' : '#FFF7ED',
              border: `1px solid ${ok ? '#BBF7D0' : '#FCD34D'}`,
              fontSize: 12,
            }}>
              <span style={{ fontWeight: 700, color: ok ? '#15803D' : '#92400E' }}>{yr}</span>
              <span style={{ color: hasTech ? '#15803D' : '#DC2626' }}>{hasTech ? '✓' : '✗'} Tech</span>
              <span style={{ color: hasMpg  ? '#15803D' : '#DC2626' }}>{hasMpg  ? '✓' : '✗'} MPG</span>
              <span style={{ color: hasUtil ? '#15803D' : '#9CA3AF' }}>{hasUtil ? '✓' : '○'} Equip Util</span>
              <span style={{ color: hasEquip ? '#15803D' : '#9CA3AF' }}>{hasEquip ? '✓' : '○'} Fleet Equip</span>
            </div>
          );
        })}
      </div>

      {!canSubmit && (
        <p style={{ margin: 0, fontSize: 12, color: '#DC2626' }}>
          Tech adoption and IFTA MPG data are required for the {requiredYears.length === 1 ? 'most recent year' : `${requiredYears.length} most recent years`} before submitting.
        </p>
      )}
      {status === 'error' && (
        <p style={{ margin: 0, fontSize: 12, color: '#DC2626' }}>Submission failed. Please try again.</p>
      )}

      {/* Optional section prompt */}
      {status === 'checking-optional' && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#92400E' }}>
            Optional sections are incomplete
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
            {[!hasUtil && 'Equipment Utilization', !hasEquip && 'Fleet Equipment'].filter(Boolean).join(' and ')} {(!hasUtil && !hasEquip) ? 'have' : 'has'} not been filled in.
            These sections help us better understand your fleet. Would you like to fill them in before submitting?
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setStatus(null)} style={{ background: '#fff', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 7, padding: '7px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              Go back and fill in optional sections
            </button>
            <button onClick={doSubmit} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              Submit without optional sections
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Benchmarking Page ────────────────────────────────────────────────────────

const BENCH_COLORS = ['#1c3660', '#A41C24', '#059669', '#D97706', '#7C3AED', '#0891B2'];

function BenchmarkPage({ token }) {
  const [dutyCycle, setDutyCycle]       = useState(null);
  const [availableFleets, setAvailableFleets] = useState([]);
  const [selected, setSelected]         = useState([]); // fleet_ids chosen
  const [mode, setMode]                 = useState('all'); // 'all' | 'custom'
  const [benchData, setBenchData]       = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [cabType, setCabType]           = useState('Sleeper');
  const [openGroups, setOpenGroups]     = useState({});

  // Decode own fleet_id from the JWT so we can exclude self from the fleet picker
  const ownFleetId = (() => {
    try { return JSON.parse(atob(token.split('.')[1])).fleet_id; }
    catch { return null; }
  })();

  // Load list of comparable fleets on mount
  useEffect(() => {
    if (!token) return;
    fetch('/api/benchmark/fleets', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        setDutyCycle(d.dutyCycle);
        setAvailableFleets((d.fleets || []).filter(f => f.fleet_id !== ownFleetId));
      })
      .catch(() => {});
  }, [token]);

  // Auto-select the cab type that matches the fleet's duty cycle:
  //   Line Haul   → Sleeper  (sleeper trucks dominate long-haul)
  //   Regional Haul → Day Cab (day cabs dominate regional/LTL)
  useEffect(() => {
    if (dutyCycle === 'RH') setCabType('Day Cab');
    else setCabType('Sleeper');
  }, [dutyCycle]);

  const MIN_PEERS = 3;
  const enoughForAll = availableFleets.length >= MIN_PEERS;
  const customValid  = selected.length >= MIN_PEERS;

  const fetchBenchmark = async () => {
    const ids = mode === 'all'
      ? availableFleets.map(f => f.fleet_id)
      : selected;
    if (ids.length < MIN_PEERS) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/benchmark/data?fleet_ids=${ids.join(',')}`,
        { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setBenchData(d);

      // After data loads, check whether "You" has adoption data for the current cab type.
      // If not (e.g. RH fleet with day-cab data but cabType is still 'Sleeper'), auto-switch
      // to whichever cab type "You" actually has data for.
      const youHasData = (ct) =>
        Object.keys(d.adoption || {}).some(tech =>
          d.adoption[tech]?.[ct]?.['You'] != null
        );
      setCabType(prev => {
        if (youHasData(prev)) return prev;
        const other = prev === 'Sleeper' ? 'Day Cab' : 'Sleeper';
        return youHasData(other) ? other : prev;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleFleet = (id) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── Derived chart data ─────────────────────────────────────────────
  const labels     = benchData?.labels || [];
  const peerLabels = labels.filter(l => l !== 'You');
  const years      = (benchData?.years || []).slice(-10);

  // For the tech-adoption table, only show columns for labels that have at least
  // one data point for the current cabType.  Peer fleets that entered data for a
  // different cab type would otherwise produce a column of all dashes.
  // "You" is always included (it's informative even when empty).
  const tableLabels = benchData
    ? labels.filter(lbl => {
        if (lbl === 'You') return true;
        return Object.keys(benchData.adoption || {}).some(tech =>
          Object.values(benchData.adoption[tech]?.[cabType]?.[lbl] || {}).some(v => v != null)
        );
      })
    : labels;

  const avgOf = (vals) => {
    const clean = vals.filter(v => v != null);
    return clean.length >= 3 ? parseFloat((clean.reduce((s, v) => s + v, 0) / clean.length).toFixed(2)) : null;
  };

  const mpgData = benchData ? years.map(yr => ({
    year: String(yr),
    'You':          benchData.mpg['You']?.[yr] ?? null,
    'Peer Average': avgOf(peerLabels.map(l => benchData.mpg[l]?.[yr])),
  })) : [];

  // Adoption by tech for current cab type
  const adoptionTechs = benchData
    ? Object.keys(benchData.adoption).filter(tech => {
        const byFleet = benchData.adoption[tech]?.[cabType];
        return byFleet && Object.keys(byFleet).length > 0;
      })
    : [];

  const adoptionChartData = benchData ? years.map(yr => {
    const pt = { year: String(yr) };
    // "You" — average adoption across all techs for this year
    const youVals = adoptionTechs.map(t => benchData.adoption[t]?.[cabType]?.['You']?.[yr]).filter(v => v != null);
    pt['You'] = youVals.length ? parseFloat((youVals.reduce((s,v)=>s+v,0)/youVals.length).toFixed(1)) : null;
    // "Peer Average" — average across all peer fleets and all techs
    const peerVals = peerLabels.flatMap(lbl =>
      adoptionTechs.map(t => benchData.adoption[t]?.[cabType]?.[lbl]?.[yr])
    ).filter(v => v != null);
    pt['Peer Average'] = peerVals.length ? parseFloat((peerVals.reduce((s,v)=>s+v,0)/peerVals.length).toFixed(1)) : null;
    return pt;
  }) : [];

  const chartLines = ['You', 'Peer Average'];
  const lineColors = { 'You': '#1c3660', 'Peer Average': '#A41C24' };

  const fmtPct = v => `${Math.round(v)}%`;
  const latestYear = years[years.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <header style={styles.mainHeader}>
        <div>
          <h1 style={styles.mainTitle}>Benchmarking</h1>
          <p style={styles.mainSub}>
            Compare your fleet against others in the {dutyCycle === 'LH' ? 'Long-Haul' : dutyCycle === 'RH' ? 'Regional Haul' : dutyCycle || '—'} duty cycle
          </p>
        </div>
      </header>

      {/* Fleet selector card */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#111827' }}>Compare against</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {[['all', 'All fleets in duty cycle'], ['custom', 'Specific fleets']].map(([val, label]) => (
            <button key={val} onClick={() => setMode(val)} style={{
              padding: '8px 18px', borderRadius: 8, border: '2px solid',
              borderColor: mode === val ? '#1c3660' : '#D1D5DB',
              background:  mode === val ? '#EFF6FF' : '#fff',
              color:       mode === val ? '#1c3660' : '#374151',
              fontSize: 13, fontWeight: mode === val ? 700 : 400, cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>

        {mode === 'custom' && (
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6B7280' }}>
              Select at least {MIN_PEERS} fleets. Fleet names are shown here for selection only — they will not appear in results.
            </p>
            {availableFleets.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9CA3AF' }}>No other fleets with submissions in this duty cycle.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {availableFleets.map(f => (
                  <button key={f.fleet_id} onClick={() => toggleFleet(f.fleet_id)} style={{
                    padding: '6px 14px', borderRadius: 20, border: '2px solid', fontSize: 12,
                    borderColor: selected.includes(f.fleet_id) ? '#1c3660' : '#D1D5DB',
                    background:  selected.includes(f.fleet_id) ? '#EFF6FF' : '#F9FAFB',
                    color:       selected.includes(f.fleet_id) ? '#1c3660' : '#374151',
                    fontWeight:  selected.includes(f.fleet_id) ? 700 : 400, cursor: 'pointer',
                  }}>
                    {f.fleet_name}
                    <span style={{ marginLeft: 6, color: '#9CA3AF', fontWeight: 400 }}>
                      ({f.submission_count} yr{f.submission_count !== 1 ? 's' : ''})
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selected.length > 0 && selected.length < MIN_PEERS && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#A41C24' }}>
                Select at least {MIN_PEERS - selected.length} more fleet{MIN_PEERS - selected.length !== 1 ? 's' : ''} to run comparison.
              </p>
            )}
          </div>
        )}

        {mode === 'all' && !enoughForAll && (
          <p style={{ margin: 0, fontSize: 13, color: '#A41C24' }}>
            Not enough fleets in this duty cycle yet ({availableFleets.length} of {MIN_PEERS} required).
          </p>
        )}

        <div>
          <button
            onClick={fetchBenchmark}
            disabled={loading || (mode === 'all' ? !enoughForAll : !customValid)}
            style={{ ...styles.btnPrimary, opacity: (loading || (mode === 'all' ? !enoughForAll : !customValid)) ? 0.5 : 1 }}
          >
            {loading ? 'Loading…' : 'Run Comparison'}
          </button>
        </div>
        {error && <p style={{ margin: 0, fontSize: 13, color: '#A41C24' }}>{error}</p>}
      </div>

      {/* Results */}
      {benchData && (
        <>
          {/* Cab type toggle */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>Cab type:</span>
            {['Sleeper', 'Day Cab'].map(ct => (
              <button key={ct} onClick={() => setCabType(ct)} style={{
                padding: '5px 14px', borderRadius: 6, border: '2px solid', fontSize: 13,
                borderColor: cabType === ct ? '#1c3660' : '#D1D5DB',
                background:  cabType === ct ? '#EFF6FF' : '#fff',
                color:       cabType === ct ? '#1c3660' : '#374151',
                fontWeight:  cabType === ct ? 700 : 400, cursor: 'pointer',
              }}>{ct}</button>
            ))}
          </div>

          {/* Two charts side by side */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {/* MPG chart */}
            <div style={{ ...styles.chartCard, flex: '1 1 360px', minWidth: 0 }}>
              <h3 style={styles.chartTitle}>IFTA MPG by Year</h3>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={mpgData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="year" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#9CA3AF" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={styles.tooltipStyle} formatter={(v, name) => [v != null ? `${parseFloat(v).toFixed(2)} mpg` : '—', name]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  {chartLines.map(lbl => (
                    <Line
                      key={lbl}
                      type="monotone"
                      dataKey={lbl}
                      stroke={lineColors[lbl]}
                      strokeWidth={lbl === 'You' ? 3 : 1.5}
                      dot={lbl === 'You' ? { r: 4 } : { r: 2 }}
                      connectNulls
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Avg adoption chart */}
            <div style={{ ...styles.chartCard, flex: '1 1 360px', minWidth: 0 }}>
              <h3 style={styles.chartTitle}>Average Tech Adoption by Year ({cabType})</h3>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={adoptionChartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="year" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tickFormatter={fmtPct} stroke="#9CA3AF" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={styles.tooltipStyle} formatter={(v, name) => [v != null ? `${Math.round(v)}%` : '—', name]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  {chartLines.map(lbl => (
                    <Line
                      key={lbl}
                      type="monotone"
                      dataKey={lbl}
                      stroke={lineColors[lbl]}
                      strokeWidth={lbl === 'You' ? 3 : 1.5}
                      dot={lbl === 'You' ? { r: 4 } : { r: 2 }}
                      connectNulls
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tech adoption table — grouped + collapsible */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '22px 24px' }}>
            <h3 style={{ ...styles.chartTitle, marginBottom: 4 }}>
              Technology Adoption ({cabType})
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6B7280' }}>
              Most recent year with data per fleet. Comparison fleet identities are anonymized.
            </p>
            {adoptionTechs.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9CA3AF' }}>No adoption data available for this cab type.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F3F4F6' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', minWidth: 220, position: 'sticky', left: 0, background: '#F3F4F6', zIndex: 1 }}>
                        Technology
                      </th>
                      {tableLabels.map((lbl, i) => (
                        <th key={lbl} style={{
                          padding: '9px 14px', textAlign: 'center', fontWeight: 700,
                          color: BENCH_COLORS[i % BENCH_COLORS.length], minWidth: 90,
                          borderLeft: '1px solid #E5E7EB',
                        }}>{lbl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(benchData.techGroups || {}).map(([group, techsInGroup]) => {
                      const visibleTechs = techsInGroup.filter(t => adoptionTechs.includes(t));
                      if (visibleTechs.length === 0) return null;
                      const isOpen = openGroups[group] !== false;
                      return (
                        <React.Fragment key={group}>
                          {/* Group header row */}
                          <tr
                            style={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => setOpenGroups(p => ({ ...p, [group]: !isOpen }))}
                          >
                            <td style={{ ...styles.heatCatRow, position: 'sticky', left: 0, zIndex: 2 }}>
                              {isOpen ? '▼' : '▶'} {group}
                            </td>
                            {tableLabels.map((lbl) => (
                              <td key={lbl} style={{ background: '#F3F4F6', borderLeft: '1px solid #E5E7EB' }} />
                            ))}
                          </tr>
                          {/* Tech rows */}
                          {isOpen && visibleTechs.map((tech, ti) => {
                            const rowBg = ti % 2 === 0 ? '#fff' : '#FAFAFA';
                            return (
                              <tr key={tech} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                <td style={{ padding: '7px 14px', color: '#111827', position: 'sticky', left: 0, background: rowBg, zIndex: 1 }}>
                                  {tech}
                                </td>
                                {tableLabels.map((lbl, i) => {
                                  const byYear = benchData.adoption[tech]?.[cabType]?.[lbl] || {};
                                  const latestWithData = [...years].reverse().find(y => byYear[y] != null);
                                  const val = latestWithData != null ? byYear[latestWithData] : null;
                                  return (
                                    <td key={lbl} style={{
                                      padding: '7px 14px', textAlign: 'center',
                                      background: rowBg, borderLeft: '1px solid #F3F4F6',
                                      color: val == null ? '#D1D5DB' : '#111827',
                                      fontWeight: lbl === 'You' ? 700 : 400,
                                    }}>
                                      {val != null ? `${Math.round(val)}%` : '—'}
                                      {latestWithData != null && latestWithData !== latestYear && (
                                        <span style={{ fontSize: 10, color: '#9CA3AF', display: 'block' }}>({latestWithData})</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  // Login
  loginBg: { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f4f3f1", fontFamily:"Arial, sans-serif" },
  loginCard: { background:"#1c3660", border:"1px solid rgba(255,255,255,0.12)", borderRadius:12, padding:"48px 40px", width:"100%", maxWidth:400, boxShadow:"0 8px 40px rgba(0,0,0,0.4)" },
  loginLogo: { display:"flex", justifyContent:"center", marginBottom:28 },
  loginLogoImg: { height:52, objectFit:"contain" },
  loginTitle: { fontSize:22, fontWeight:700, color:"#F9FAFB", margin:"0 0 6px", fontFamily:"Arial, sans-serif", textAlign:"center" },
  loginSub: { color:"#9CA3AF", fontSize:14, margin:"0 0 32px", textAlign:"center" },
  loginForm: { display:"flex", flexDirection:"column", gap:16 },
  loginFooter: { marginTop:24, textAlign:"center", color:"#9CA3AF", fontSize:13 },
  fieldGroup: { display:"flex", flexDirection:"column", gap:6 },
  label: { color:"#D1D5DB", fontSize:13, fontWeight:600 },
  input: { background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding:"11px 14px", color:"#F9FAFB", fontSize:15, outline:"none", transition:"border .2s", fontFamily:"inherit" },
  btn: { background:"#A41C24", color:"#FFFFFF", border:"none", borderRadius:8, padding:"13px", fontWeight:700, fontSize:15, cursor:"pointer", letterSpacing:0.3, transition:"all .2s" },
  errMsg: { color:"#FCA5A5", fontSize:13, margin:0 },
  link: { color:"#FCA5A5" },

  // App shell
  app: { display:"flex", minHeight:"100vh", background:"#F0F2F4", fontFamily:"Arial, sans-serif", color:"#111827" },

  // Sidebar
  sidebar: { width:200, background:"#1C1F2E", borderRight:"none", display:"flex", flexDirection:"column", padding:"24px 0", flexShrink:0, position:"sticky", top:0, height:"100vh" },
  sidebarLogo: { display:"flex", justifyContent:"center", padding:"0 20px 24px", borderBottom:"1px solid rgba(255,255,255,0.1)" },
  sidebarLogoImg: { height:36, objectFit:"contain" },
  sidebarFooter: { padding:"16px 20px", borderTop:"1px solid rgba(255,255,255,0.1)", marginTop:"auto" },
  fleetChip: { display:"flex", gap:10, alignItems:"center", marginBottom:12 },
  fleetAvatar: { width:34, height:34, borderRadius:"50%", background:"#A41C24", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13, color:"#FFFFFF", flexShrink:0 },
  fleetName: { fontSize:13, fontWeight:600, color:"#F9FAFB" },
  fleetMeta: { fontSize:11, color:"#9CA3AF" },
  btnSignOut: { background:"transparent", border:"1px solid rgba(255,255,255,0.15)", color:"#9CA3AF", borderRadius:6, padding:"7px 12px", cursor:"pointer", fontSize:12, width:"100%" },

  // Main
  main: { flex:1, padding:"32px 40px", overflowY:"auto", maxWidth:"calc(100vw - 200px)" },
  mainHeader: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 },
  mainTitle: { fontSize:26, fontWeight:700, margin:"0 0 4px", color:"#111827" },
  mainSub: { color:"#6B7280", fontSize:14, margin:0 },
  btnPrimary: { background:"#A41C24", color:"#FFFFFF", border:"none", borderRadius:8, padding:"10px 20px", fontWeight:700, fontSize:14, cursor:"pointer", letterSpacing:0.3, whiteSpace:"nowrap" },

  // Charts
  chartsRow: { display:"flex", gap:20, marginBottom:24, flexWrap:"wrap" },
  chartCard: { background:"#FFFFFF", border:"1px solid #E5E7EB", borderRadius:12, padding:"22px 24px" },
  chartTitle: { fontSize:15, fontWeight:700, color:"#111827", marginBottom:16 },
  tooltipStyle: { background:"#FFFFFF", border:"1px solid #E5E7EB", borderRadius:8, color:"#111827", fontSize:13, boxShadow:"0 4px 12px rgba(0,0,0,0.1)" },
  legendRow: { display:"flex", gap:16, marginTop:12 },
  legendItem: { display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#6B7280" },
  legendDot: { width:10, height:10, borderRadius:"50%", flexShrink:0 },

  // Submission history
  historyList: { display:"flex", flexDirection:"column", gap:8, maxHeight:250, overflowY:"auto" },
  historyItem: { display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"#F9FAFB", borderRadius:8, border:"1px solid #E5E7EB" },
  historyYear: { fontWeight:700, fontSize:15, color:"#111827", width:44 },
  historyBadge: { flex:1 },
  historyActions: { display:"flex", gap:6 },
  badgeComplete: { background:"rgba(22,163,74,0.1)", color:"#15803D", fontSize:12, padding:"3px 9px", borderRadius:20, border:"1px solid rgba(22,163,74,0.25)" },
  badgePending:  { background:"rgba(164,28,36,0.08)", color:"#A41C24", fontSize:12, padding:"3px 9px", borderRadius:20, border:"1px solid rgba(164,28,36,0.2)" },
  btnGhost: { background:"transparent", border:"1px solid #D1D5DB", color:"#6B7280", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:12 },

  // Heatmap
  heatTable: { width:"100%", borderCollapse:"collapse", fontSize:12 },
  heatTh: { textAlign:"left", padding:"8px 12px", color:"#6B7280", fontWeight:600, borderBottom:"1px solid #E5E7EB", whiteSpace:"nowrap", fontSize:13 },
  heatThYear: { textAlign:"center", padding:"8px 10px", color:"#6B7280", fontWeight:600, borderBottom:"1px solid #E5E7EB", minWidth:52 },
  heatCatRow: { background:"#F3F4F6", color:"#6B7280", fontWeight:700, padding:"8px 12px", fontSize:11, letterSpacing:1, textTransform:"uppercase" },
  heatRow: { borderBottom:"1px solid #F3F4F6", transition:"background .15s" },
  heatTechLabel: { padding:"7px 12px", color:"#374151", fontSize:12, maxWidth:280, cursor:"help" },
  heatCell: { textAlign:"center", padding:"4px 6px" },
  heatValue: { display:"inline-block", padding:"3px 7px", borderRadius:5, fontSize:12, fontWeight:600, minWidth:42, textAlign:"center" },
  heatNull: { color:"#D1D5DB", fontSize:12 },
  heatLegendNote: { color:"#6B7280", fontSize:11, marginTop:12 },

  // Data entry modal
  entryOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(4px)", zIndex:100, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"40px 20px", overflowY:"auto" },
  entryModal: { background:"#FFFFFF", border:"1px solid #E5E7EB", borderRadius:16, width:"100%", maxWidth:820, boxShadow:"0 20px 60px rgba(0,0,0,0.15)" },
  entryHeader: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"28px 32px 0" },
  entryTitle: { fontSize:22, fontWeight:700, color:"#111827", margin:"0 0 4px" },
  entrySub: { color:"#6B7280", fontSize:14, margin:0 },
  btnClose: { background:"transparent", border:"1px solid #E5E7EB", color:"#6B7280", borderRadius:8, width:36, height:36, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" },
  stepRow: { display:"flex", alignItems:"center", padding:"24px 32px 0" },
  stepItem: { display:"flex", alignItems:"center", gap:8, flex:1 },
  stepDot: { width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13, flexShrink:0 },
  stepLabel: { fontSize:13, fontWeight:600, whiteSpace:"nowrap" },
  stepLine: { flex:1, height:2, borderRadius:2, margin:"0 8px" },
  entryBody: { padding:"24px 32px", maxHeight:"60vh", overflowY:"auto" },
  entryNote: { color:"#6B7280", fontSize:13, marginBottom:20, padding:"10px 14px", background:"#F9FAFB", borderRadius:8, border:"1px solid #E5E7EB" },
  entryGrid: { display:"flex", flexDirection:"column", gap:16 },
  entryField: { display:"flex", flexDirection:"column", gap:6 },
  entryLabel: { color:"#374151", fontSize:13, fontWeight:600 },
  entryInputRow: { display:"flex", alignItems:"center", gap:12 },
  entryPrev: { color:"#9CA3AF", fontSize:14, minWidth:100, fontFamily:"monospace" },
  entryArrow: { color:"#D1D5DB", fontSize:16 },
  entryInput: { background:"#F9FAFB", border:"1px solid #D1D5DB", borderRadius:8, padding:"9px 12px", color:"#111827", fontSize:14, fontFamily:"monospace", flex:1, outline:"none" },
  techSection: { marginBottom:24 },
  techCatHead: { color:"#A41C24", fontSize:12, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:12, paddingBottom:6, borderBottom:"1px solid #E5E7EB" },
  techGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
  techField: { display:"flex", flexDirection:"column", gap:5 },
  techLabel: { color:"#4B5563", fontSize:12, fontWeight:600, cursor:"help" },
  infoIcon: { color:"#9CA3AF", marginLeft:5, fontSize:11, cursor:"help" },
  pctInputWrap: { position:"relative", display:"flex", alignItems:"center", flex:1 },
  techInput: { background:"#F9FAFB", border:"1px solid #D1D5DB", borderRadius:8, padding:"7px 30px 7px 10px", color:"#111827", fontSize:13, fontFamily:"monospace", width:"100%", outline:"none" },
  pctSign: { position:"absolute", right:10, color:"#9CA3AF", fontSize:13 },
  entryFooter: { display:"flex", alignItems:"center", padding:"20px 32px", borderTop:"1px solid #E5E7EB", gap:12 },
  btnSuccess: { background:"#16A34A", color:"#fff", border:"none", borderRadius:8, padding:"11px 24px", fontWeight:700, fontSize:14, cursor:"pointer" },
  reviewSection: { marginBottom:24 },
  reviewGrid: { display:"flex", flexDirection:"column", gap:6 },
  reviewItem: { display:"flex", justifyContent:"space-between", padding:"8px 14px", background:"#F9FAFB", borderRadius:6, border:"1px solid #E5E7EB" },
  reviewLabel: { color:"#6B7280", fontSize:13 },
  reviewValue: { color:"#111827", fontSize:13, fontFamily:"monospace" },
  // Fleet Details Table
  detailTable:      { width:"100%", borderCollapse:"collapse", fontSize:14 },
  detailThLabel:    { padding:"8px 12px", textAlign:"left", borderBottom:"2px solid #E5E7EB", color:"#6B7280", fontWeight:600 },
  detailTh:         { padding:"8px 16px", textAlign:"center", borderBottom:"2px solid #E5E7EB", color:"#6B7280", fontWeight:600, minWidth:110 },
  detailThEditable: { color:"#1c3660", background:"#EEF4FF" },
  detailTdLabel:    { padding:"8px 12px", textAlign:"left", borderBottom:"1px solid #F3F4F6", color:"#374151", fontWeight:500 },
  detailTd:         { padding:"8px 16px", textAlign:"center", borderBottom:"1px solid #F3F4F6", color:"#374151" },
  detailTdEditable: { background:"#F9FAFB", padding:"4px 8px" },
  detailSectionRow: { background:"#F3F4F6", fontWeight:700, color:"#1c3660", padding:"6px 12px", fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em" },
  detailInput:      { width:"100%", border:"1px solid #D1D5DB", borderRadius:4, padding:"4px 8px", fontSize:14, textAlign:"center", outline:"none", boxSizing:"border-box" },
};
