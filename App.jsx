import React, { useState, useEffect } from "react";

import { BarChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

// ─── Utility ──────────────────────────────────────────────────────────────────
const pct = (v) => v == null ? "—" : `${Math.round(v * 100)}%`;
const fmt = (n) => n?.toLocaleString() ?? "—";

// ─── Components ───────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!email || !email.includes("@")) return setErr("Valid email required");
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const body = await res.json();
      if (!res.ok) {
        setErr(body.error || 'Login failed');
        setLoading(false);
        return;
      }
      onLogin(body.token, body.fleet);
    } catch (err) {
      setErr(err.message || 'Network error');
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
        <h1 style={styles.loginTitle}>Fleet Fuel Study</h1>
        <p style={styles.loginSub}>Fleet Portal</p>

        <form onSubmit={handleSubmit} style={styles.loginForm}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
            />
          </div>
          {err && <p style={styles.errMsg}>{err}</p>}
          <button style={{...styles.btn, opacity: loading ? 0.7 : 1}} type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p style={styles.loginFooter}>
          Need access? Contact <a href="mailto:yunsu.park@nacfe.org" style={styles.link}>yunsu.park@nacfe.org</a>
        </p>
      </div>
    </div>
  );
}


function MpgChart({ mpg = {}, techData = {}, years = [] }) {
  // reuse the same year ordering as the heatmap (newest left)
  const sortedYears = Array.isArray(years) ? [...years].map(Number).sort((a,b)=>b-a) : [];
  const displayYears = sortedYears.slice(0,6);

  const chartData = displayYears.map(y => {
    const mpgVal = mpg[y] ?? null;
    const t = techData[y] || {};
    const vals = Object.values(t).filter(v => typeof v === 'number');
    const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length)*100 : null; // percent
    return { year: String(y), mpg: mpgVal, avgAdoption: avg };
  });

  return (
    <div style={styles.chartCard}>
      <h3 style={styles.chartTitle}>IFTA MPG — recent</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{top:8, right:24, left:0, bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="year" stroke="#9CA3AF" tick={{fontSize:12}} />
          <YAxis yAxisId="left" stroke="#9CA3AF" tick={{fontSize:11}} />
          <YAxis yAxisId="right" orientation="right" domain={[0,100]} stroke="#9CA3AF" tickFormatter={v=>`${Math.round(v)}%`} />
          <Tooltip contentStyle={styles.tooltipStyle} labelStyle={{color:"#111827"}} formatter={(v, name) => name === 'avgAdoption' ? `${Math.round(v)}%` : v} />
          <Legend />
          <Bar yAxisId="left" dataKey="mpg" name="MPG" fill="#A41C24" />
          <Line yAxisId="right" type="monotone" dataKey="avgAdoption" name="Avg Adoption" stroke="#6B7280" strokeWidth={2} dot={{r:3}} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TechHeatmap({ techData, years, categories, availableConfigs, selectedConfig, onConfigChange }) {
  // ensure years are numbers and sorted newest->oldest, then take the most
  // recent six so the left-most column is the newest year and older years
  // appear to the right (scrollable horizontally)
  const sortedYears = Array.isArray(years)
    ? [...years].map(Number).sort((a, b) => b - a)
    : [];
  const displayYears = sortedYears.slice(0, 6);

  // categories is expected to be { groupName: [ { label, desc } ] }
  // build flattened list with category info
  const allTechs = Object.entries(categories || {}).flatMap(([cat, arr]) => arr.map(t => ({...t, category: cat})));

  // mapping from label to category (backend uses labels as keys)
  const techLabelToCat = {};
  allTechs.forEach(tech => {
    techLabelToCat[tech.label] = tech.category;
  });

  // collect all labels present in the data
  const allLabels = new Set();
  Object.values(techData).forEach(yearObj => {
    Object.keys(yearObj).forEach(lbl => allLabels.add(lbl));
  });
  // determine uncategorized labels
  const uncategorized = Array.from(allLabels).filter(l => !techLabelToCat[l]);

  // build runtime categories object (start with passed categories copy)
  const catObj = {};
  Object.entries(categories || {}).forEach(([cat, arr]) => {
    catObj[cat] = arr.map(t => ({...t}));
  });
  if (uncategorized.length) {
    catObj.Other = uncategorized.map(lbl => ({ label: lbl, desc: '' }));
  }

  // dropdown state per category
  const [openCats, setOpenCats] = React.useState(() => {
    const init = {};
    Object.keys(catObj).forEach(cat => { init[cat] = false; });
    return init;
  });

  const toggleCat = (cat) => {
    setOpenCats(prev => ({...prev, [cat]: !prev[cat]}));
  };

  const tableMinWidth = displayYears.length * 80 + 200;

  return (
    <div style={styles.chartCard}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
        <h3 style={{...styles.chartTitle, marginBottom:0}}>Technology Adoption</h3>
        {availableConfigs && availableConfigs.length > 0 && (
          <select value={selectedConfig} onChange={e => onConfigChange(Number(e.target.value))} style={{padding:'6px 10px', borderRadius:8, background:'#F9FAFB', color:'#111827', border:'1px solid #D1D5DB', fontSize:13}}>
            {availableConfigs.map(cObj => {
              const value = typeof cObj === 'object' ? cObj.config : cObj;
              const label = typeof cObj === 'object' ? (cObj.label || `Config ${value}`) : `Config ${value}`;
              return <option key={value} value={value}>{label}</option>;
            })}
          </select>
        )}
      </div>
      <div style={{overflowX: "auto"}}>
        <table style={{...styles.heatTable, minWidth: tableMinWidth}}>
          <thead>
            <tr>
              <th style={styles.heatTh}>Technology</th>
              {displayYears.map(y => <th key={y} style={styles.heatThYear}>{y}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.entries(catObj).flatMap(([cat, techs]) => {
              const isOpen = openCats[cat];
              const rows = [];
              rows.push(
                <tr key={`cat-${cat}`} style={{cursor: 'pointer'}} onClick={() => toggleCat(cat)}>
                  <td colSpan={displayYears.length + 1} style={styles.heatCatRow}>
                    {isOpen ? '▼' : '▶'} {cat}
                  </td>
                </tr>
              );
              if (isOpen) {
                techs.forEach(tech => {
                  rows.push(
                    <tr key={tech.label} style={styles.heatRow}>
                      <td style={styles.heatTechLabel} title={tech.desc}>{tech.label}</td>
                      {displayYears.map(y => {
                        const yearData = techData[y] || {};
                        const v = yearData[tech.label];
                        return (
                          <td key={y} style={styles.heatCell}>
                            <HeatCell value={v} />
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

function SubmissionHistory({ years, onStartEntry }) {
  const sorted = [...years].sort((a,b)=>b-a);
  const currentYear = new Date().getFullYear();
  const needsUpdate = !years.includes(currentYear);

  return (
    <div style={styles.chartCard}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
        <h3 style={{...styles.chartTitle, marginBottom:0}}>Submission History</h3>
        {needsUpdate && (
          <button style={styles.btnPrimary} onClick={onStartEntry}>
            + Enter {currentYear} Data
          </button>
        )}
      </div>
      <div style={{...styles.historyList, maxHeight:250, overflowY:'auto'}}>
        {sorted.map(year => (
          <div key={year} style={styles.historyItem}>
            <div style={styles.historyYear}>{year}</div>
            <div style={styles.historyBadge}>
              <span style={styles.badgeComplete}>✓ Complete</span>
            </div>
            <div style={styles.historyActions}>
              <button style={styles.btnGhost} onClick={() => alert(`Viewing ${year} submission — connect to API`)}>
                View
              </button>
              <button style={styles.btnGhost} onClick={() => alert(`Editing ${year} — connect to API`)}>
                Edit
              </button>
            </div>
          </div>
        ))}
        {needsUpdate && (
          <div style={{...styles.historyItem, opacity:0.5, borderStyle:"dashed"}}>
            <div style={styles.historyYear}>{currentYear}</div>
            <div style={styles.historyBadge}>
              <span style={styles.badgePending}>⏳ Not submitted</span>
            </div>
            <div style={styles.historyActions}>
              <button style={styles.btnPrimary} onClick={onStartEntry}>Start</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Fleet Details Table ─────────────────────────────────────────────────────
function FleetDetailsTable({ token }) {
  const EDITABLE_YEARS = [2024, 2025];
  const PRIOR_YEARS    = [2022, 2023];
  const ALL_YEARS      = [...PRIOR_YEARS, ...EDITABLE_YEARS];

  const [data,   setData]   = useState({});
  const [edits,  setEdits]  = useState({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // null | 'saved' | 'error'

  const loadData = async () => {
    const r = await fetch('/api/fleet-details', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const d = await r.json();
    setData(d);
    const init = {};
    EDITABLE_YEARS.forEach(yr => {
      const row = d[yr] || {};
      init[yr] = {
        tractors:   row.tractors   ?? '',
        trailers:   row.trailers   ?? '',
        ifta_miles: row.ifta_miles ?? '',
        ifta_fuel:  row.ifta_fuel  ?? '',
      };
    });
    setEdits(init);
  };

  useEffect(() => { if (token) loadData(); }, [token]);

  const setEdit = (yr, field, val) =>
    setEdits(prev => ({ ...prev, [yr]: { ...prev[yr], [field]: val } }));

  const calcMpg = (source) => {
    const miles = parseFloat(source?.ifta_miles);
    const fuel  = parseFloat(source?.ifta_fuel);
    if (!miles || !fuel) return '—';
    return (miles / fuel).toFixed(3);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      for (const yr of EDITABLE_YEARS) {
        const e = edits[yr] || {};
        await fetch(`/api/fleet-details/${yr}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            tractors:   e.tractors   !== '' ? parseFloat(e.tractors)   : null,
            trailers:   e.trailers   !== '' ? parseFloat(e.trailers)   : null,
            ifta_miles: e.ifta_miles !== '' ? parseFloat(e.ifta_miles) : null,
            ifta_fuel:  e.ifta_fuel  !== '' ? parseFloat(e.ifta_fuel)  : null,
          }),
        });
      }
      await loadData();
      setStatus('saved');
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const displayVal = (yr, field) => {
    const v = data[yr]?.[field];
    return v != null ? fmt(v) : '—';
  };

  const SECTIONS = [
    {
      label: 'Equipment Utilization',
      rows: [
        { key: 'tractors',   label: 'Tractors' },
        { key: 'trailers',   label: 'Trailers' },
      ],
    },
    {
      label: 'Fuel (IFTA)',
      rows: [
        { key: 'ifta_miles', label: 'IFTA Miles' },
        { key: 'ifta_fuel',  label: 'IFTA Fuel (gal)' },
        { key: 'mpg',        label: 'Fuel Economy (MPG)', readOnly: true },
      ],
    },
  ];

  return (
    <div style={styles.chartCard}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <h3 style={{...styles.chartTitle, marginBottom:0}}>Fleet Details</h3>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          {status === 'saved' && <span style={{color:'#16a34a', fontSize:13}}>Saved successfully.</span>}
          {status === 'error' && <span style={{color:'#dc2626', fontSize:13}}>Error saving. Try again.</span>}
          <button style={{...styles.btnPrimary, opacity: saving ? 0.7 : 1}} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={styles.detailTable}>
          <thead>
            <tr>
              <th style={styles.detailThLabel}>Field</th>
              {ALL_YEARS.map(yr => (
                <th key={yr} style={{
                  ...styles.detailTh,
                  ...(EDITABLE_YEARS.includes(yr) ? styles.detailThEditable : {}),
                }}>
                  {yr}{EDITABLE_YEARS.includes(yr) ? ' ✎' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map(({ label: sLabel, rows }) => (
              <React.Fragment key={sLabel}>
                <tr>
                  <td colSpan={ALL_YEARS.length + 1} style={styles.detailSectionRow}>{sLabel}</td>
                </tr>
                {rows.map(({ key, label, readOnly }) => (
                  <tr key={key}>
                    <td style={styles.detailTdLabel}>{label}</td>
                    {ALL_YEARS.map(yr => {
                      const editable = EDITABLE_YEARS.includes(yr) && !readOnly;
                      return (
                        <td key={yr} style={{...styles.detailTd, ...(editable ? styles.detailTdEditable : {})}}>
                          {editable ? (
                            <input
                              style={styles.detailInput}
                              type="number"
                              value={edits[yr]?.[key] ?? ''}
                              onChange={e => setEdit(yr, key, e.target.value)}
                              placeholder="—"
                            />
                          ) : key === 'mpg'
                            ? calcMpg(EDITABLE_YEARS.includes(yr) ? edits[yr] : data[yr])
                            : displayVal(yr, key)
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
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
                ].map(({k, label, prev, unit}) => (
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

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('token'));
  const [entering, setEntering] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [fleetState, setFleetState] = useState(null);
  const [general, setGeneral] = useState({});
  const [tech, setTech] = useState({});
  const [techCategories, setTechCategories] = useState({});
  const [availableConfigs, setAvailableConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(1);
  const [mpg, setMpg] = useState({});

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

        const mpgRes = await fetch('/api/mpg', { headers });
        if (mpgRes.ok) {
          const m = await mpgRes.json();
          setMpg(m || {});
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
            setAvailableConfigs(t.configs);
            // configs may now be objects { config, cab_type, fuel_type, label }
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

  const handleLogin = (tok, fleetObj) => {
    // store token first so restart will pick it up
    localStorage.setItem('token', tok);
    setToken(tok);
    if (fleetObj) setFleetState(fleetObj);
    setAuthed(true);
    // sometimes the screen stays blank after login; force a reload to ensure
    // state is fully consistent with localStorage.
    setTimeout(() => window.location.reload(), 0);
  };

  if (!authed) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div style={styles.app}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <img src="/nacfe-logo.png" alt="NACFE" style={styles.sidebarLogoImg} />
        </div>
        <div style={styles.sidebarFooter}>
          <div style={styles.fleetChip}>
            <div style={styles.fleetAvatar}>{fleet?.name?.[0]}</div>
            <div>
              <div style={styles.fleetName}>{fleet?.name}</div>
              <div style={styles.fleetMeta}>{fleet?.hq}</div>
            </div>
          </div>
          <button style={styles.btnSignOut} onClick={() => setAuthed(false)}>Sign out</button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        <header style={styles.mainHeader}>
            <div>
              <h1 style={styles.mainTitle}>Dashboard</h1>
              <p style={styles.mainSub}>Last submission: {fleet?.lastSubmission ?? '—'} · Survey year {latestYear ?? '—'}</p>
            </div>
            <button style={styles.btnPrimary} onClick={() => setEntering(true)}>
              + Enter {new Date().getFullYear()} Data
            </button>
        </header>

        {/* Charts row */}
        <div style={styles.chartsRow}>
          <div style={{flex:"1 1 400px"}}>
            <MpgChart mpg={mpg} techData={tech} years={fleet?.submissionYears} />
          </div>
          <div style={{flex:"0 0 320px"}}>
            <SubmissionHistory years={fleet?.submissionYears ?? []} onStartEntry={() => setEntering(true)} />
          </div>
        </div>

        {/* Fleet Details Table */}
        <FleetDetailsTable token={token} />

        {/* Tech Heatmap */}
        <TechHeatmap techData={tech} years={fleet?.submissionYears} categories={techCategories} availableConfigs={availableConfigs} selectedConfig={selectedConfig} onConfigChange={setSelectedConfig} />
      </main>

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
