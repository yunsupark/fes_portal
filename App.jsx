import React, { useState, useEffect, useRef } from "react";

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

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


function MpgChart({ chartData: cd = {}, fleetName }) {
  const {
    ownMpg = {}, peerMpg = {},
    sleeperAdoption = {}, dayCabAdoption = {},
    allFleetSleeperAdoption = {}, allFleetDayCabAdoption = {},
    dutyCycle = null,
  } = cd;

  const hasSleeper = Object.keys(sleeperAdoption).length > 0;
  const hasDayCab  = Object.keys(dayCabAdoption).length > 0;

  const allYears = [...new Set([
    ...Object.keys(ownMpg), ...Object.keys(peerMpg),
    ...Object.keys(sleeperAdoption), ...Object.keys(dayCabAdoption),
  ].map(Number))].sort((a, b) => a - b);
  const displayYears = allYears.slice(-8);

  const data = displayYears.map(y => ({
    year: String(y),
    mpg:                 ownMpg[y]                  ?? null,
    peerMpg:             peerMpg[y]                 ?? null,
    sleeperAdoption:     sleeperAdoption[y]          ?? null,
    dayCabAdoption:      dayCabAdoption[y]           ?? null,
    ffsSleeperAdoption:  allFleetSleeperAdoption[y] ?? null,
    ffsDayCabAdoption:   allFleetDayCabAdoption[y]  ?? null,
  }));

  const fmtPct = v => `${Math.round(v)}%`;
  const peerLabel = dutyCycle === 'LH' ? 'LH Average' : dutyCycle === 'RH' ? 'RH Average' : 'Peer MPG';
  const ownLabel  = fleetName ? `${fleetName} MPG` : 'Fleet MPG';
  const nameMap = {
    mpg:                ownLabel,
    peerMpg:            peerLabel,
    sleeperAdoption:    'Sleeper adoption',
    dayCabAdoption:     'Day Cab adoption',
    ffsSleeperAdoption: 'Ave. Sleeper adoption',
    ffsDayCabAdoption:  'Ave. Day Cab adoption',
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
          {hasSleeper && <Bar yAxisId="right" dataKey="sleeperAdoption"    name="sleeperAdoption"    fill="#3B82F6" />}
          {hasDayCab  && <Bar yAxisId="right" dataKey="dayCabAdoption"     name="dayCabAdoption"     fill="#10B981" />}
          {hasSleeper && <Bar yAxisId="right" dataKey="ffsSleeperAdoption" name="ffsSleeperAdoption" fill="#93C5FD" />}
          {hasDayCab  && <Bar yAxisId="right" dataKey="ffsDayCabAdoption"  name="ffsDayCabAdoption"  fill="#6EE7B7" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}



function TechAdoptionCard({ token, onSave, editableYears = [2024, 2025] }) {
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

  const maxEditableYear = Math.max(...editableYears, 2025);
  const hasDataForCabType = Object.keys(techData).length > 0;
  const effectiveEditableYears = hasDataForCabType
    ? editableYears
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
      const hasData = Object.keys(t.data || {}).length > 0;
      const maxYr = Math.max(...editableYears, 2025);
      const effEditable = hasData
        ? editableYears
        : Array.from({ length: maxYr - 2003 + 1 }, (_, i) => 2003 + i);
      const known = new Set([...Object.keys(t.data || {}).map(Number), ...effEditable]);
      const sorted = [...known].sort((a, b) => b - a);
      setYears(sorted);

      setOpenCats(prev => {
        const next = {...prev};
        Object.keys(t.categories || {}).forEach(cat => { if (!(cat in next)) next[cat] = true; });
        return next;
      });
      // init edits from existing data for this cab type
      setEdits(prev => {
        const newEdits = { ...prev };
        effEditable.forEach(yr => {
          const yrData = t.data?.[yr] ?? t.data?.[String(yr)] ?? null;
          if (!yrData) return;
          const updated = { ...(newEdits[yr] || {}) };
          Object.values(t.categories || {}).forEach(techs_ => {
            techs_.forEach(tech => {
              const v = yrData[tech.label];
              updated[tech.label] = v != null ? String(Math.round(v * 100)) : '';
            });
          });
          newEdits[yr] = updated;
        });
        return newEdits;
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
      // Merge server data + unsaved edits for yr-1; edits are already % strings
      const serverData = techData[yr - 1] || {};
      const editData   = edits[yr - 1]    || {};
      setEdits(prev => ({
        ...prev,
        [yr]: Object.fromEntries(allTechs.map(tech => {
          const editVal = editData[tech.label];
          if (editVal !== '' && editVal != null) return [tech.label, editVal];
          const v = serverData[tech.label];
          return [tech.label, v != null ? String(Math.round(v * 100)) : ''];
        }))
      }));
    } else {
      const sourceData = src === 'current-other' ? (otherTechData[yr] || {}) : (otherTechData[yr - 1] || {});
      setEdits(prev => ({
        ...prev,
        [yr]: Object.fromEntries(allTechs.map(tech => {
          const v = sourceData[tech.label];
          return [tech.label, v != null ? String(Math.round(v * 100)) : ''];
        }))
      }));
    }
  };

  const handleSave = async () => {
    if (!selectedCabType) { setSaveMsg('Select a cab type first.'); return; }
    setSaving(true); setSaveMsg('');
    try {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const yearsToSave = effectiveEditableYears.filter(yr => {
        const e = edits[yr];
        return e && Object.values(e).some(v => v !== '' && v !== null && v !== undefined);
      });
    const results = await Promise.all(yearsToSave.map(yr =>
        fetch(`/api/techs/${yr}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ cab_type: selectedCabType, techs: edits[yr] }),
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
          <button
            onClick={handleSave}
            disabled={saving}
            style={{...styles.btnPrimary, opacity: saving ? 0.7 : 1}}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div ref={scrollRef} style={{overflowX:'auto'}}>
        <table style={{...styles.heatTable, minWidth: readOnlyYears.length * 72 + 260 + effectiveEditableYears.length * 150}}>
          <thead>
            <tr>
              <th style={{...styles.heatTh, minWidth:220, position:'sticky', left:0, zIndex:3, background:'#fff'}}>Technology</th>
              {readOnlyYears.map(y => <th key={y} style={styles.heatThYear}>{y}</th>)}
              {effectiveEditableYears.map(y => {
                const otherCab = selectedCabType === 'Day Cab' ? 'Sleeper' : 'Day Cab';
                const hasPriorYear    = y - 1 >= 2003;
                const hasPriorSame    = hasPriorYear && (
                  Object.keys(techData[y - 1] || {}).length > 0 ||
                  Object.values(edits[y - 1] || {}).some(v => v !== '' && v != null)
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
              {effectiveEditableYears.map(y => (
                <td key={y} style={{...styles.heatCell, fontSize:12, color:'#374151', background:'#EFF6FF', fontWeight:500}}>
                  {yearMeta[y]?.cab_type || selectedCabType}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(categories).flatMap(([cat, techs_]) => {
              const isOpen = openCats[cat] !== false;
              const visibleTechs = techs_.filter(t => {
                // null/undefined means "applies to both" (legacy rows before columns existed)
                const cabOk = selectedCabType === 'Day Cab'
                  ? (t.applies_daycab == null ? true : t.applies_daycab !== 0)
                  : (t.applies_sleeper == null ? true : t.applies_sleeper !== 0);
                if (!cabOk) return false;
                const hasData = Object.values(techData).some(yd => yd[t.label] != null);
                const activeInEditableYear = editableYears.some(y =>
                  (t.active_from == null || t.active_from <= y) && (t.active_to == null || t.active_to >= y)
                );
                return hasData || activeInEditableYear;
              });
              const rows = [];
              rows.push(
                <tr key={`cat-${cat}`} style={{cursor:'pointer'}} onClick={() => setOpenCats(p => ({...p, [cat]: !isOpen}))}>
                  <td colSpan={colCount} style={{...styles.heatCatRow, position:'sticky', left:0}}>{isOpen ? '▼' : '▶'} {cat}</td>
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
                      {effectiveEditableYears.map(y => (
                        <td key={y} style={{...styles.heatCell, background:'#F0F7FF', padding:'4px 8px'}}>
                          <div style={styles.pctInputWrap}>
                            <input
                              style={{...styles.techInput, fontSize:12, padding:'4px 24px 4px 6px'}}
                              type="number" min="0" max="100"
                              value={edits[y]?.[tech.label] ?? ''}
                              onChange={e => setEdits(prev => ({...prev, [y]: {...prev[y], [tech.label]: e.target.value}}))}
                              placeholder="—"
                            />
                            <span style={styles.pctSign}>%</span>
                          </div>
                        </td>
                      ))}
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

function SubmissionHistory({ token, saveCount, submittedYears = [], editableYears = [2024, 2025], onSubmit }) {
  const [status, setStatus]           = useState(null);
  const [submitModal, setSubmitModal] = useState(null);
  const YEARS = [...editableYears].sort((a, b) => a - b);

  const loadStatus = () => {
    if (!token) return;
    fetch('/api/submission-status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStatus(d); })
      .catch(console.error);
  };
  useEffect(loadStatus, [token, saveCount]);

  const techThreshold = (yr, cabType) => status?.techTotals?.[yr]?.[cabType] ?? 0;

  const fuelCnt = (yr) => status?.fuel?.[yr]?.cnt ?? 0;

  // Yellow: fuel >= 1 AND at least one cab_type meets its tech threshold
  const isYellow = (yr) => {
    if (!status) return false;
    const hasFuel = fuelCnt(yr) >= 1;
    const techByType = status.tech?.[yr] || {};
    const hasTech = Object.entries(techByType).some(([ct, n]) => { const t = techThreshold(yr, ct); return t > 0 && n >= t; });
    return hasFuel && hasTech;
  };

  // Green: all sections have entries AND at least one cab_type meets tech threshold
  const isGreen = (yr) => {
    if (!isYellow(yr)) return false;
    return (status.utilization?.[yr] || 0) >= 1 && (status.fleetEquip?.[yr] || 0) >= 1;
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
    if (cnt === 0) return { text: 'Not Started', color: '#DC2626' };
    const color = allFilled(yr) ? '#16A34A' : '#D97706';
    return { text: cnt === 1 ? '1 entry' : `${cnt} entries`, color };
  };

  const fuelCellDisplay = (yr) => {
    if (!status) return { text: '—', color: '#374151' };
    const cnt = fuelCnt(yr);
    if (cnt === 0) return { text: 'Not Started', color: '#DC2626' };
    const color = allFilled(yr) ? '#16A34A' : '#D97706';
    return { text: status.fuel[yr].fuel_types || (cnt === 1 ? '1 entry' : `${cnt} entries`), color };
  };

  const techCellDisplay = (yr) => {
    if (!status) return { text: '—', color: '#374151' };
    const byType = status.tech?.[yr];
    const hasAny = byType && Object.keys(byType).length > 0;
    if (!hasAny) return { text: 'Not Started', color: '#DC2626' };
    const text = Object.entries(byType).sort(([a],[b]) => a.localeCompare(b)).map(([ct, n]) => `${ct}: ${n}/${techThreshold(yr, ct)}`).join(', ');
    const color = allFilled(yr) ? '#16A34A' : '#D97706';
    return { text, color };
  };

  const handleSubmitConfirm = (yr) => {
    setSubmitModal(null);
    onSubmit?.(yr);
  };

  const cellStyle  = { padding:'8px 16px', textAlign:'center', fontSize:13, borderBottom:'1px solid #F3F4F6', color:'#374151' };
  const headStyle  = { padding:'8px 16px', textAlign:'center', fontWeight:700, fontSize:13, color:'#1c3660', borderBottom:'2px solid #E5E7EB', background:'#F9FAFB' };
  const labelStyle = { padding:'8px 12px', fontSize:13, fontWeight:600, color:'#374151', borderBottom:'1px solid #F3F4F6' };

  const SubmitBtn = ({ yr }) => {
    if (submittedYears.includes(yr)) {
      return <span style={{color:'#16A34A', fontWeight:700, fontSize:13}}>✓ Submitted</span>;
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
      <table style={{width:'100%', borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th style={{...headStyle, textAlign:'left'}}>Section</th>
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
          <tr>
            <td />
            {YEARS.map(y => (
              <td key={y} style={{padding:'10px 16px', textAlign:'center'}}>
                <SubmitBtn yr={y} />
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

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

function FleetDetailsTable({ token, onSave, submittedYears = [], editableYears = [2024, 2025] }) {
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
    const yrList  = [...new Set([...dbYears, ...editableYears])].sort((a, b) => b - a).slice(0, Math.max(NUM_YEARS, editableYears.length + 3));
    setYears(yrList);
    const editableInList = yrList.filter(y => editableYears.includes(y));
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

  useEffect(() => { if (token) loadData(); }, [token, editableYearsKey]);

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

  return (
    <div style={styles.chartCard}>
      {/* Header */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8}}>
        <h3 style={{...styles.chartTitle, marginBottom:0}}>Equipment Utilization</h3>
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          {[...years].sort((a, b) => a - b).map(yr => (
            <button key={yr} onClick={() => setSelectedYear(yr)} style={{
              padding:'4px 14px', borderRadius:6, border:'1px solid',
              fontSize:13, cursor:'pointer', fontWeight: yr === selectedYear ? 700 : 400,
              borderColor: yr === selectedYear ? '#1c3660' : '#D1D5DB',
              background:  yr === selectedYear ? '#1c3660' : '#fff',
              color:        yr === selectedYear ? '#fff' : '#374151',
            }}>{yr}{editableYears.includes(yr) && !submittedYears.includes(yr) ? ' ✎' : ''}</button>
          ))}
          {status === 'saved' && <span style={{color:'#16a34a', fontSize:13}}>Saved.</span>}
          {status === 'error'  && <span style={{color:'#dc2626', fontSize:13}}>Error saving.</span>}
          <button style={{...styles.btnPrimary, opacity: saving ? 0.7 : 1}} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
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
                    {selectedYear >= 2024 && (
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
                      onChange={e => setUtilCell(selectedYear, idx, 'application', e.target.value)}>
                      <option value="">— select —</option>
                      {APPLICATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  {UTIL_COLS.map(col => (
                    <td key={col.key} style={{...styles.detailTd, ...styles.detailTdEditable}}>
                      <input style={styles.detailInput} type="number"
                        value={row[col.key] ?? ''}
                        onChange={e => setUtilCell(selectedYear, idx, col.key, e.target.value)}
                        placeholder="—" />
                    </td>
                  ))}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* Add / Copy row controls */}
      <div style={{display:'flex', gap:8, marginBottom:20, alignItems:'flex-start'}}>
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
      </div>

    </div>
  );
}

// ─── Fuel Table ──────────────────────────────────────────────────────────────
const FUEL_OPTIONS    = ['Diesel', 'Biodiesel', 'CNG', 'LNG'];

const EMPTY_FUEL_ROW  = () => ({ fuel_type: 'Diesel', ifta_miles: '', volume: '' });

function FuelTable({ token, onSave, submittedYears = [], editableYears = [2024, 2025] }) {
  const NUM_YEARS = 5;
  const editableYearsKey = editableYears.join(',');

  const [rows,         setRows]         = useState([]);   // flat array from API
  const [edits,        setEdits]        = useState({});   // { year: [rows] }
  const [years,        setYears]        = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [status,       setStatus]       = useState(null);

  const loadData = async () => {
    const r = await fetch('/api/fuel', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const data = await r.json();
    setRows(data);
    const dbYears = [...new Set(data.map(r => r.year))];
    const yrList  = [...new Set([...dbYears, ...editableYears])].sort((a, b) => b - a).slice(0, Math.max(NUM_YEARS, editableYears.length + 3));
    setYears(yrList);
    setSelectedYear(prev => prev ?? Math.min(...editableYears));
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

  const isEditable = editableYears.includes(selectedYear);

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
          {[...years].sort((a, b) => a - b).map(yr => (
            <button key={yr} onClick={() => setSelectedYear(yr)} style={{
              padding:'4px 14px', borderRadius:6, border:'1px solid',
              fontSize:13, cursor:'pointer', fontWeight: yr === selectedYear ? 700 : 400,
              borderColor: yr === selectedYear ? '#1c3660' : '#D1D5DB',
              background:  yr === selectedYear ? '#1c3660' : '#fff',
              color:        yr === selectedYear ? '#fff' : '#374151',
            }}>{yr}{editableYears.includes(yr) && !submittedYears.includes(yr) ? ' ✎' : ''}</button>
          ))}
          {status === 'saved' && <span style={{color:'#16a34a', fontSize:13}}>Saved.</span>}
          {status === 'error'  && <span style={{color:'#dc2626', fontSize:13}}>Error saving.</span>}
          {isEditable && (
            <button style={{...styles.btnPrimary, opacity: saving ? 0.7 : 1}} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
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
                  const mpgVal = miles > 0 && galDge > 0 ? (miles / galDge).toFixed(2) : null;
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
                      <td style={{...styles.detailTd, textAlign:'center', fontWeight: mpgVal ? 600 : 400, color: mpgVal ? '#1c3660' : '#9CA3AF', fontSize:13}}>
                        {mpgVal ?? '—'}
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
function SelectOrOther({ options, value, onChange, placeholder = '—', inputType = 'text', width }) {
  const [isOther, setIsOther] = useState(() => value !== '' && value != null && !options.includes(value));
  const inputStyle = { border:'1px solid #D1D5DB', borderRadius:4, padding:'3px 6px', fontSize:13, background:'#fff', width: width || '100%', boxSizing:'border-box' };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:3}}>
      <select value={isOther ? '__other__' : (value || '')} onChange={e => {
        if (e.target.value === '__other__') { setIsOther(true); }
        else { setIsOther(false); onChange(e.target.value); }
      }} style={inputStyle}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
        <option value="__other__">Other</option>
      </select>
      {isOther && (
        <input type={inputType} value={value} onChange={e => onChange(e.target.value)}
          placeholder="Enter manually…" style={{...inputStyle, borderColor:'#A41C24'}} autoFocus />
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

function EquipCell({ colKey, row, onChange, makeModels, engineModels }) {
  const tractorMake = row.tractor_make;
  const engineMake  = row.engine_make;
  const isNA        = ENGINE_MAKE_LIMITS[tractorMake] === null || NA_MODELS.has(`${tractorMake}:${row.tractor_model}`);
  const inputStyle  = { border:'1px solid #D1D5DB', borderRadius:4, padding:'3px 6px', fontSize:13, width:'100%', boxSizing:'border-box' };

  if (colKey === 'qty') {
    return <input type="number" value={row.qty ?? ''} onChange={e => onChange(e.target.value)}
      placeholder="0" style={{...inputStyle, textAlign:'center'}} />;
  }
  if (colKey === 'cab_type') {
    return <SelectOrOther options={['Day Cab', 'Sleeper']} value={row.cab_type} onChange={onChange} placeholder="— select —" />;
  }
  if (colKey === 'tractor_make') {
    const makes = [...new Set(makeModels.map(m => m.make))];
    return <SelectOrOther options={makes} value={row.tractor_make} onChange={onChange} placeholder="— select —" />;
  }
  if (colKey === 'tractor_model') {
    const models = makeModels.filter(m => m.make === tractorMake).map(m => m.model);
    return models.length
      ? <SelectOrOther options={models} value={row.tractor_model} onChange={onChange} placeholder="— select —" />
      : <input type="text" value={row.tractor_model ?? ''} onChange={e => onChange(e.target.value)} placeholder="Model" style={inputStyle} />;
  }
  if (colKey === 'engine_make') {
    if (isNA) return <span style={{color:'#9CA3AF', fontSize:13}}>N/A</span>;
    const restricted = ENGINE_MAKE_LIMITS[tractorMake];
    const allMakes   = [...new Set(engineModels.map(e => e.make))];
    return <SelectOrOther options={restricted || allMakes} value={row.engine_make} onChange={onChange} placeholder="— select —" />;
  }
  if (colKey === 'engine_model') {
    if (isNA) return <span style={{color:'#9CA3AF', fontSize:13}}>N/A</span>;
    const models = engineModels.filter(e => e.make === engineMake).map(e => e.model);
    return models.length
      ? <SelectOrOther options={models} value={row.engine_model} onChange={onChange} placeholder="— select —" />
      : <input type="text" value={row.engine_model ?? ''} onChange={e => onChange(e.target.value)} placeholder="Model" style={inputStyle} />;
  }
  if (colKey === 'axle_ratio') {
    return <input type="number" step="0.01" value={row.axle_ratio ?? ''} onChange={e => onChange(e.target.value)}
      placeholder="0.00" style={{...inputStyle, textAlign:'center'}} />;
  }
  // default: free text
  return <input type="text" value={row[colKey] ?? ''} onChange={e => onChange(e.target.value)}
    placeholder="—" style={inputStyle} />;
}

function FleetEquipTable({ token, onSave, submittedYears = [], editableYears = [2024, 2025] }) {
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
    const yrList = [...new Set([...dbYears, ...editableYears])].sort((a, b) => b - a);
    setYears(yrList);
    setSelectedYear(prev => prev ?? Math.min(...editableYears));
    const init = {};
    yrList.forEach(yr => { init[yr] = (d[yr] || []).map(row => ({ ...row })); });
    editableYears.forEach(yr => { if (!init[yr]) init[yr] = [EMPTY_EQUIP_ROW()]; });
    setEdits(init);
  };

  useEffect(() => { if (token) loadData(); }, [token, editableYearsKey]);

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

  const displayRows     = edits[selectedYear] || data[selectedYear] || [];
  const allYearsForTabs = [...new Set([...years, ...editableYears])].sort((a, b) => a - b);

  return (
    <div style={styles.chartCard}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8}}>
        <h3 style={{...styles.chartTitle, marginBottom:0}}>Fleet Equipment</h3>
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          {allYearsForTabs.map(yr => (
            <button key={yr} onClick={() => setSelectedYear(yr)} style={{
              padding:'4px 14px', borderRadius:6, border:'1px solid',
              fontSize:13, cursor:'pointer', fontWeight: yr === selectedYear ? 700 : 400,
              borderColor: yr === selectedYear ? '#1c3660' : '#D1D5DB',
              background:  yr === selectedYear ? '#1c3660' : '#fff',
              color:       yr === selectedYear ? '#fff' : '#374151',
            }}>{yr}{yr >= 2024 && !submittedYears.includes(yr) ? ' ✎' : ''}</button>
          ))}
          {status === 'saved' && <span style={{color:'#16a34a', fontSize:13}}>Saved.</span>}
          {status === 'error'  && <span style={{color:'#dc2626', fontSize:13}}>Error saving.</span>}
          <button style={{...styles.btnPrimary, opacity: saving ? 0.7 : 1}} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
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
                    {selectedYear >= 2024 && (
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
      <div style={{display:'flex', gap:8, marginTop:12, alignItems:'flex-start'}}>
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

function AdminView({ token, onSignOut }) {
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedFleet, setExpandedFleet] = useState(null);
  const [fleetSort, setFleetSort] = useState({ field: 'last_submitted_year', dir: 'desc' });
  const [contactSort, setContactSort] = useState({ field: 'last_name', dir: 'asc' });
  const [contactFilter, setContactFilter] = useState('active'); // 'active' | 'inactive' | 'all'

  // Card collapse state
  const [fleetsCollapsed,    setFleetsCollapsed]    = useState(false);
  const [contactsCollapsed,  setContactsCollapsed]  = useState(false);
  const [techsCollapsed,     setTechsCollapsed]     = useState(false);

  // Settings panel
  const [showSettings,   setShowSettings]   = useState(false);
  const [settingsForm,   setSettingsForm]   = useState({ editable_year_from: '', editable_year_to: '' });
  const [settingsSaving, setSettingsSaving] = useState(false);

  // New Fleet modal
  const [showFleetForm, setShowFleetForm] = useState(false);
  const [fleetForm, setFleetForm] = useState({
    fleet_name: '', fleet_city: '', fleet_state: '', default_duty_cycle: '',
    first_name: '', last_name: '', email: '', phone: '',
  });
  const [fleetSaving, setFleetSaving] = useState(false);

  // Edit Fleet modal
  const [editFleet, setEditFleet] = useState(null); // fleet object
  const [editFleetForm, setEditFleetForm] = useState({});
  const [editFleetSaving, setEditFleetSaving] = useState(false);

  // New Contact modal
  const [contactFleetId, setContactFleetId] = useState(null);
  const [contactForm, setContactForm] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const [contactSaving, setContactSaving] = useState(false);

  // Edit Contact modal
  const [editContact, setEditContact] = useState(null); // contact object with fleet_name
  const [editContactForm, setEditContactForm] = useState({});
  const [editContactSaving, setEditContactSaving] = useState(false);

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

  useEffect(() => { fetchFleets(); }, [token]);

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

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
            editable_year_from: d.settings.editable_year_from ?? '',
            editable_year_to:   d.settings.editable_year_to   ?? '',
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
        }),
      });
      setShowSettings(false);
    } finally { setSettingsSaving(false); }
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
        body: JSON.stringify({ fleet_id, first_name: fleetForm.first_name, last_name: fleetForm.last_name, email: fleetForm.email, phone: fleetForm.phone }),
      });
      setShowFleetForm(false);
      setFleetForm({ fleet_name: '', fleet_city: '', fleet_state: '', default_duty_cycle: '', first_name: '', last_name: '', email: '', phone: '' });
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
      if (res.ok) { setContactFleetId(null); setContactForm({ first_name: '', last_name: '', email: '', phone: '' }); fetchFleets(); }
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
      <div style={{ background: '#1c3660', padding: '0 32px', display: 'flex', alignItems: 'center', height: 56, gap: 10 }}>
        <img src="/nacfe-logo.png" alt="NACFE" style={{ height: 32, objectFit: 'contain' }} />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 16, flex: 1 }}>Admin Panel</span>
        <button onClick={() => setShowSettings(true)} title="Settings" style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>⚙</button>
        <button onClick={onSignOut} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
          Sign out
        </button>
      </div>

      <div style={{ maxWidth: 1280, margin: '24px auto', padding: '0 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ── Fleets Card ── */}
        <div style={{ ...card, flex: '1 1 0', minWidth: 0, marginBottom: 0 }}>
          <div style={{ ...cardHeader, cursor: 'pointer' }} onClick={() => setFleetsCollapsed(c => !c)}>
            <h2 style={{ margin: 0, fontSize: 15, color: '#111827', fontWeight: 700, flex: 1 }}>
              Fleets <span style={{ fontWeight: 400, fontSize: 12, color: '#9CA3AF' }}>({fleets.length})</span>
            </h2>
            <button onClick={e => { e.stopPropagation(); setShowFleetForm(true); }}
              style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, marginRight: 8 }}>
              + New Fleet
            </button>
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
                        <td style={{ padding: '9px 12px 9px 0', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <button style={editBtn} onClick={() => { setEditFleet(f); setEditFleetForm({ fleet_name: f.fleet_name, fleet_city: f.fleet_city || '', fleet_state: f.fleet_state || '', default_duty_cycle: f.default_duty_cycle || '' }); }}>✎</button>
                        </td>
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
                                        <input type="checkbox" checked={!!c.portal_access} onChange={async e => {
                                          const val = e.target.checked;
                                          await fetch(`/api/admin/contacts/${c.contact_id}/access`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ portal_access: val }) });
                                          fetchFleets();
                                        }} />
                                      </td>
                                      <td style={{ padding: '5px 0', textAlign: 'right' }}>
                                        <button style={editBtn} onClick={() => { setEditContact({ ...c, fleet_name: f.fleet_name }); setEditContactForm({ first_name: c.first_name || '', last_name: c.last_name || '', email: c.email, phone: c.phone || '', active: c.active !== 0, portal_access: !!c.portal_access }); }}>✎</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); setContactFleetId(f.fleet_id); setContactForm({ first_name: '', last_name: '', email: '', phone: '' }); }}
                              style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#374151' }}
                            >+ Add Contact</button>
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

        {/* ── Contacts Card ── */}
        <div style={{ ...card, flex: '1 1 0', minWidth: 0, marginBottom: 0 }}>
          <div style={{ ...cardHeader, cursor: 'pointer' }} onClick={() => setContactsCollapsed(c => !c)}>
            <h2 style={{ margin: 0, fontSize: 15, color: '#111827', fontWeight: 700, flex: 1 }}>
              Contacts <span style={{ fontWeight: 400, fontSize: 12, color: '#9CA3AF' }}>({sortedContacts.length})</span>
            </h2>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
              <button onClick={() => { setContactFleetId('pick'); setContactForm({ first_name: '', last_name: '', email: '', phone: '', fleet_id: '' }); }}
                style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                + New Contact
              </button>
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
                    <th style={{ ...thBase, padding: '8px', textAlign: 'center' }}>Allow Access</th>
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
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <input type="checkbox" checked={!!c.portal_access} onChange={async e => {
                          const val = e.target.checked;
                          await fetch(`/api/admin/contacts/${c.contact_id}/access`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ portal_access: val }) });
                          fetchFleets();
                        }} />
                      </td>
                      <td style={{ padding: '8px 12px 8px 0', textAlign: 'right' }}>
                        <button style={editBtn} onClick={() => { setEditContact(c); setEditContactForm({ first_name: c.first_name || '', last_name: c.last_name || '', email: c.email, phone: c.phone || '', active: c.active !== 0, portal_access: !!c.portal_access }); }}>✎</button>
                      </td>
                    </tr>
                  ))}
                  {sortedContacts.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>No contacts found.</td></tr>
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
            <button onClick={e => { e.stopPropagation(); setShowTechForm(true); }}
              style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, marginRight: 8 }}>
              + New Technology
            </button>
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
                      <td style={{ padding: '8px 12px 8px 0', textAlign: 'right' }}>
                        <button style={editBtn} onClick={() => openEditTech(t)}>✎</button>
                      </td>
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
          <div style={modalBox}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#111827' }}>Edit Contact</h3>
            <div style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>{editContact.fleet_name}</div>
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
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Fleet Input Years</p>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6B7280' }}>
                  Set the range of years that fleets can enter or edit data for.
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>From</label>
                    <input style={inputStyle} type="number" min="2003" max="2100"
                      value={settingsForm.editable_year_from}
                      onChange={e => setSettingsForm(p => ({ ...p, editable_year_from: e.target.value }))}
                      required />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>To</label>
                    <input style={inputStyle} type="number" min="2003" max="2100"
                      value={settingsForm.editable_year_to}
                      onChange={e => setSettingsForm(p => ({ ...p, editable_year_to: e.target.value }))}
                      required />
                  </div>
                </div>
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
  const previewToken = new URLSearchParams(window.location.search).get('preview');
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
  const [submittedYears, setSubmittedYears] = useState([]);
  const [editableYears,  setEditableYears]  = useState([2024, 2025]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/submission-status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setSubmittedYears(d.submittedYears || []);
          setEditableYears(d.editableYears  || [2024, 2025]);
        }
      })
      .catch(console.error);
  }, [token, saveCount]);

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
  const isAdmin = (() => {
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.fleet_id === 0;
    } catch { return false; }
  })();

  const handleLogin = (tok, fleetObj) => {
    localStorage.setItem('token', tok);
    setToken(tok);
    if (fleetObj) setFleetState(fleetObj);
    setAuthed(true);
    setTimeout(() => window.location.reload(), 0);
  };

  const handleSignOut = () => {
    localStorage.removeItem('token');
    setAuthed(false);
    setToken(null);
  };

  if (!authed) return <LoginScreen onLogin={handleLogin} />;
  if (isAdmin) return <AdminView token={token} onSignOut={handleSignOut} />;

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
        </header>

        {/* Charts row */}
        <div style={styles.chartsRow}>
          <div style={{flex:"1 1 400px"}}>
            <MpgChart chartData={chartData} fleetName={fleetState?.name} />
          </div>
          <div style={{flex:"0 0 320px"}}>
            <SubmissionHistory token={token} saveCount={saveCount} submittedYears={submittedYears} onSubmit={onSubmit} editableYears={editableYears} />
          </div>
        </div>

        {/* Fleet Details Table */}
        <FleetDetailsTable token={token} onSave={notifySave} submittedYears={submittedYears} editableYears={editableYears} />

        {/* Fleet Equipment Table */}
        <FleetEquipTable token={token} onSave={notifySave} submittedYears={submittedYears} editableYears={editableYears} />

        {/* Fuel Table */}
        <FuelTable token={token} onSave={notifySave} submittedYears={submittedYears} editableYears={editableYears} />

        {/* Tech Adoption Card */}
        <TechAdoptionCard token={token} onSave={notifySave} editableYears={editableYears} />
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
