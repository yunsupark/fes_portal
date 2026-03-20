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

const TECH_NUM_YEARS = 5;
const DAYCAB_IDLE_REDUCTION_IDS = new Set([2, 10, 13]);

function TechAdoptionCard({ token, onSave, editableYears = [2024, 2025] }) {
  const [techData, setTechData]         = useState({});
  const [categories, setCategories]     = useState({});
  const [yearMeta, setYearMeta]         = useState({});
  const [years, setYears]               = useState([]);
  const [selectedCabType, setSelectedCabType]     = useState('Day Cab');
  const [edits, setEdits]               = useState({});
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');
  const [openCats, setOpenCats]         = useState({});

  const allTechs = Object.entries(categories).flatMap(([cat, arr]) => arr.map(t => ({...t, category: cat})));
  const readOnlyYears = years.filter(y => !editableYears.includes(y)).sort((a, b) => a - b);
  const colCount = readOnlyYears.length + editableYears.length + 1;

  const fetchData = async (cabType) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const param = cabType ? `?cab_type=${encodeURIComponent(cabType)}` : '';
      const res = await fetch(`/api/techs${param}`, { headers });
      if (!res.ok) return;
      const t = await res.json();
      setTechData(t.data || {});
      setCategories(t.categories || {});
      setYearMeta(t.meta || {});
      const known = new Set([...Object.keys(t.data || {}).map(Number), ...editableYears]);
      const sorted = [...known].sort((a, b) => b - a).slice(0, TECH_NUM_YEARS);
      setYears(sorted);
      setOpenCats(prev => {
        const next = {...prev};
        Object.keys(t.categories || {}).forEach(cat => { if (!(cat in next)) next[cat] = true; });
        return next;
      });
      // init edits from existing data for this cab type
      setEdits(prev => {
        const newEdits = { ...prev };
        editableYears.forEach(yr => {
          // Build a normalized lookup: number-keyed data → string-keyed for safety
          const yrData = t.data?.[yr] ?? t.data?.[String(yr)] ?? null;
          if (!yrData) return; // no saved data for this year — keep existing edits
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

  const handleCabTypeChange = (ct) => {
    setSelectedCabType(ct);
    fetchData(ct);
  };

  const handleCopy = (yr) => {
    const priorData = techData[yr - 1] || {};
    setEdits(prev => ({
      ...prev,
      [yr]: Object.fromEntries(allTechs.map(tech => {
        const v = priorData[tech.label];
        return [tech.label, v != null ? String(Math.round(v * 100)) : ''];
      }))
    }));
  };

  const handleSave = async () => {
    if (!selectedCabType) { setSaveMsg('Select a cab type first.'); return; }
    setSaving(true); setSaveMsg('');
    try {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const results = await Promise.all(editableYears.map(yr =>
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

      <div style={{overflowX:'auto'}}>
        <table style={{...styles.heatTable, minWidth: readOnlyYears.length * 72 + 260 + editableYears.length * 130}}>
          <thead>
            <tr>
              <th style={{...styles.heatTh, minWidth:220}}>Technology</th>
              {readOnlyYears.map(y => <th key={y} style={styles.heatThYear}>{y}</th>)}
              {editableYears.map(y => (
                <th key={y} style={{...styles.heatThYear, background:'#EFF6FF', minWidth:120}}>
                  <div>{y} ✎</div>
                  <button onClick={() => handleCopy(y)} style={{marginTop:4, padding:'2px 7px', borderRadius:4, border:'1px solid #D1D5DB', background:'#fff', color:'#374151', fontSize:10, cursor:'pointer', fontWeight:400}}>
                    Copy from {y - 1}
                  </button>
                </th>
              ))}
            </tr>
            {/* Cab Type read-only row */}
            <tr style={{background:'#F9FAFB'}}>
              <td style={{padding:'5px 12px', fontSize:12, fontWeight:600, color:'#374151'}}>Cab Type</td>
              {readOnlyYears.map(y => (
                <td key={y} style={{...styles.heatCell, fontSize:12, color:'#6B7280'}}>
                  {yearMeta[y]?.cab_type || '—'}
                </td>
              ))}
              {editableYears.map(y => (
                <td key={y} style={{...styles.heatCell, fontSize:12, color:'#374151', background:'#EFF6FF', fontWeight:500}}>
                  {yearMeta[y]?.cab_type || selectedCabType}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(categories).flatMap(([cat, techs_]) => {
              const isOpen = openCats[cat] !== false;
              const visibleTechs = (cat === 'Idle Reduction' && selectedCabType === 'Day Cab')
                ? techs_.filter(t => DAYCAB_IDLE_REDUCTION_IDS.has(t.tech_id))
                : techs_;
              const rows = [];
              rows.push(
                <tr key={`cat-${cat}`} style={{cursor:'pointer'}} onClick={() => setOpenCats(p => ({...p, [cat]: !isOpen}))}>
                  <td colSpan={colCount} style={styles.heatCatRow}>{isOpen ? '▼' : '▶'} {cat}</td>
                </tr>
              );
              if (isOpen) {
                visibleTechs.forEach(tech => {
                  rows.push(
                    <tr key={tech.label} style={styles.heatRow}>
                      <td style={styles.heatTechLabel} title={tech.desc}>{tech.label}</td>
                      {readOnlyYears.map(y => (
                        <td key={y} style={styles.heatCell}>
                          <HeatCell value={(techData[y] || {})[tech.label]} />
                        </td>
                      ))}
                      {editableYears.map(y => (
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

function SubmissionHistory({ token, saveCount, submittedYears = [], onSubmit }) {
  const [status, setStatus]           = useState(null);
  const [submitModal, setSubmitModal] = useState(null);
  const YEARS = [2024, 2025];

  const loadStatus = () => {
    if (!token) return;
    fetch('/api/submission-status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStatus(d); })
      .catch(console.error);
  };
  useEffect(loadStatus, [token, saveCount]);

  const totalTechs    = status?.totalTechs    || 0;
  const techCountDayCab = status?.techCountDayCab || totalTechs;

  const techThreshold = (cabType) => cabType === 'Day Cab' ? techCountDayCab : totalTechs;

  const fuelCnt = (yr) => status?.fuel?.[yr]?.cnt ?? 0;

  // Yellow: fuel >= 1 AND at least one cab_type meets its tech threshold
  const isYellow = (yr) => {
    if (!status) return false;
    const hasFuel = fuelCnt(yr) >= 1;
    const techByType = status.tech?.[yr] || {};
    const hasTech = totalTechs > 0 && Object.entries(techByType).some(([ct, n]) => n >= techThreshold(ct));
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
        const threshold = techThreshold(ct);
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
    const text = Object.entries(byType).sort(([a],[b]) => a.localeCompare(b)).map(([ct, n]) => `${ct}: ${n}/${techThreshold(ct)}`).join(', ');
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

  useEffect(() => { if (token) loadData(); }, [token]);

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

  useEffect(() => { if (token) loadData(); }, [token]);

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
    const yrList = Object.keys(d).map(Number).sort((a, b) => b - a);
    setYears(yrList);
    setSelectedYear(prev => prev ?? Math.min(...editableYears));
    const init = {};
    yrList.forEach(yr => { init[yr] = (d[yr] || []).map(row => ({ ...row })); });
    editableYears.forEach(yr => { if (!init[yr]) init[yr] = [EMPTY_EQUIP_ROW()]; });
    setEdits(init);
  };

  useEffect(() => { if (token) loadData(); }, [token]);

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

function AdminView({ token, onSignOut }) {
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedFleet, setExpandedFleet] = useState(null);
  const [fleetSort, setFleetSort] = useState({ field: 'fleet_name', dir: 'asc' });
  const [contactSort, setContactSort] = useState({ field: 'last_name', dir: 'asc' });

  // New Fleet modal state
  const [showFleetForm, setShowFleetForm] = useState(false);
  const [fleetForm, setFleetForm] = useState({ fleet_name: '', fleet_city: '', fleet_state: '' });
  const [fleetSaving, setFleetSaving] = useState(false);

  // New Contact modal state
  const [contactFleetId, setContactFleetId] = useState(null);
  const [contactForm, setContactForm] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const [contactSaving, setContactSaving] = useState(false);

  const fetchFleets = () => {
    setLoading(true);
    fetch('/api/admin/fleets', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFleets(d.fleets || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchFleets(); }, [token]);

  const handleCreateFleet = async (e) => {
    e.preventDefault();
    setFleetSaving(true);
    try {
      const res = await fetch('/api/admin/fleets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(fleetForm),
      });
      if (res.ok) {
        setShowFleetForm(false);
        setFleetForm({ fleet_name: '', fleet_city: '', fleet_state: '' });
        fetchFleets();
      }
    } finally { setFleetSaving(false); }
  };

  const handleCreateContact = async (e) => {
    e.preventDefault();
    setContactSaving(true);
    try {
      const res = await fetch('/api/admin/contacts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleet_id: contactFleetId, ...contactForm }),
      });
      if (res.ok) {
        setContactFleetId(null);
        setContactForm({ first_name: '', last_name: '', email: '', phone: '' });
        fetchFleets();
      }
    } finally { setContactSaving(false); }
  };

  // Sorted fleet list
  const sortedFleets = [...fleets].sort((a, b) => {
    let av = a[fleetSort.field], bv = b[fleetSort.field];
    if (fleetSort.field === 'last_submitted_year') {
      av = av ?? 0; bv = bv ?? 0;
      return fleetSort.dir === 'asc' ? av - bv : bv - av;
    }
    av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase();
    return fleetSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  // Flat contacts list for the contacts card
  const allContacts = fleets.flatMap(f =>
    f.contacts.map(c => ({ ...c, fleet_name: f.fleet_name }))
  );
  const sortedContacts = [...allContacts].sort((a, b) => {
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
  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 2, display: 'block' };
  const modalOverlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const modalBox = {
    background: '#fff', borderRadius: 10, padding: 28, width: 380,
    boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
  };
  const card = {
    background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 24, overflow: 'hidden',
  };
  const cardHeader = {
    display: 'flex', alignItems: 'center', padding: '16px 20px',
    borderBottom: '1px solid #F3F4F6',
  };
  const thBase = { fontWeight: 600, paddingBottom: 8, paddingRight: 16, fontSize: 12, color: '#6B7280' };

  return (
    <div style={{ minHeight: '100vh', background: '#F3F4F6', fontFamily: 'Arial, sans-serif' }}>
      {/* Top bar */}
      <div style={{ background: '#1c3660', padding: '0 32px', display: 'flex', alignItems: 'center', height: 56, gap: 16 }}>
        <img src="/nacfe-logo.png" alt="NACFE" style={{ height: 32, objectFit: 'contain' }} />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 16, flex: 1 }}>Admin Panel</span>
        <button onClick={onSignOut} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
          Sign out
        </button>
      </div>

      <div style={{ maxWidth: 960, margin: '32px auto', padding: '0 16px' }}>

        {/* ── Fleets Card ── */}
        <div style={card}>
          <div style={cardHeader}>
            <h2 style={{ margin: 0, fontSize: 16, color: '#111827', fontWeight: 700, flex: 1 }}>
              Fleets <span style={{ fontWeight: 400, fontSize: 13, color: '#9CA3AF' }}>({fleets.length})</span>
            </h2>
            <button
              onClick={() => setShowFleetForm(true)}
              style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
            >
              + New Fleet
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: '#6B7280', padding: 40 }}>Loading…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ ...thBase, padding: '10px 20px', textAlign: 'left' }}>
                    <span
                      onClick={() => setFleetSort(s => ({ field: 'fleet_name', dir: s.field === 'fleet_name' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                      style={{ cursor: 'pointer', userSelect: 'none', color: fleetSort.field === 'fleet_name' ? '#1c3660' : '#6B7280' }}
                    >
                      Fleet Name {fleetSort.field === 'fleet_name' ? (fleetSort.dir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.4 }}>↕</span>}
                    </span>
                  </th>
                  <th style={{ ...thBase, padding: '10px 16px', textAlign: 'left' }}>Location</th>
                  <th style={{ ...thBase, padding: '10px 16px', textAlign: 'center' }}>
                    <span
                      onClick={() => setFleetSort(s => ({ field: 'last_submitted_year', dir: s.field === 'last_submitted_year' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                      style={{ cursor: 'pointer', userSelect: 'none', color: fleetSort.field === 'last_submitted_year' ? '#1c3660' : '#6B7280' }}
                    >
                      Last Submission {fleetSort.field === 'last_submitted_year' ? (fleetSort.dir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.4 }}>↕</span>}
                    </span>
                  </th>
                  <th style={{ ...thBase, padding: '10px 16px', textAlign: 'right' }}>Contacts</th>
                  <th style={{ ...thBase, padding: '10px 20px 10px 0', textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {sortedFleets.map(f => (
                  <React.Fragment key={f.fleet_id}>
                    <tr
                      style={{ borderBottom: expandedFleet === f.fleet_id ? 'none' : '1px solid #F3F4F6', cursor: 'pointer', background: expandedFleet === f.fleet_id ? '#F9FAFB' : '#fff' }}
                      onClick={() => setExpandedFleet(expandedFleet === f.fleet_id ? null : f.fleet_id)}
                    >
                      <td style={{ padding: '11px 20px', fontWeight: 600, color: '#111827' }}>{f.fleet_name}</td>
                      <td style={{ padding: '11px 16px', color: '#6B7280' }}>{[f.fleet_city, f.fleet_state].filter(Boolean).join(', ') || '—'}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                        {f.last_submitted_year
                          ? <span style={{ color: '#374151', fontWeight: 600 }}>{f.last_submitted_year}</span>
                          : <span style={{ color: '#EF4444', fontSize: 12 }}>None</span>}
                      </td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', color: '#6B7280' }}>{f.contacts.length}</td>
                      <td style={{ padding: '11px 20px 11px 0', textAlign: 'right', color: '#9CA3AF', fontSize: 11 }}>{expandedFleet === f.fleet_id ? '▲' : '▼'}</td>
                    </tr>
                    {expandedFleet === f.fleet_id && (
                      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td colSpan={5} style={{ padding: '0 20px 14px', background: '#F9FAFB' }}>
                          {f.contacts.length === 0 ? (
                            <div style={{ color: '#9CA3AF', fontSize: 12, paddingTop: 10 }}>No contacts yet.</div>
                          ) : (
                            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8, marginBottom: 8 }}>
                              <thead>
                                <tr style={{ color: '#9CA3AF' }}>
                                  <th style={{ fontWeight: 600, paddingBottom: 4, paddingRight: 16, textAlign: 'left' }}>Name</th>
                                  <th style={{ fontWeight: 600, paddingBottom: 4, paddingRight: 16, textAlign: 'left' }}>Email</th>
                                  <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: 'left' }}>Phone</th>
                                </tr>
                              </thead>
                              <tbody>
                                {f.contacts.map(c => (
                                  <tr key={c.contact_id} style={{ borderTop: '1px solid #E5E7EB' }}>
                                    <td style={{ padding: '5px 16px 5px 0', color: '#111827' }}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
                                    <td style={{ padding: '5px 16px 5px 0', color: '#374151' }}>{c.email}</td>
                                    <td style={{ padding: '5px 0', color: '#374151' }}>{c.phone || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); setContactFleetId(f.fleet_id); setContactForm({ first_name: '', last_name: '', email: '', phone: '' }); }}
                            style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: '#374151' }}
                          >
                            + Add Contact
                          </button>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Contacts Card ── */}
        <div style={card}>
          <div style={cardHeader}>
            <h2 style={{ margin: 0, fontSize: 16, color: '#111827', fontWeight: 700 }}>
              All Contacts <span style={{ fontWeight: 400, fontSize: 13, color: '#9CA3AF' }}>({allContacts.length})</span>
            </h2>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#6B7280', padding: 32 }}>Loading…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  <SortHeader label="Name" field="name" sort={contactSort} setSort={setContactSort} />
                  <SortHeader label="Fleet" field="fleet_name" sort={contactSort} setSort={setContactSort} />
                  <SortHeader label="Email" field="email" sort={contactSort} setSort={setContactSort} />
                  <SortHeader label="Phone" field="phone" sort={contactSort} setSort={setContactSort} />
                </tr>
              </thead>
              <tbody>
                {sortedContacts.map(c => (
                  <tr key={c.contact_id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 16px 10px 20px', color: '#111827', fontWeight: 500 }}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#6B7280' }}>{c.fleet_name}</td>
                    <td style={{ padding: '10px 16px', color: '#374151' }}>{c.email}</td>
                    <td style={{ padding: '10px 20px 10px 0', color: '#374151' }}>{c.phone || '—'}</td>
                  </tr>
                ))}
                {sortedContacts.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>No contacts found.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* New Fleet Modal */}
      {showFleetForm && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowFleetForm(false); }}>
          <div style={modalBox}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, color: '#111827' }}>New Fleet</h3>
            <form onSubmit={handleCreateFleet} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Fleet Name *</label>
                <input style={inputStyle} value={fleetForm.fleet_name} onChange={e => setFleetForm(p => ({ ...p, fleet_name: e.target.value }))} required autoFocus />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input style={inputStyle} value={fleetForm.fleet_city} onChange={e => setFleetForm(p => ({ ...p, fleet_city: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input style={inputStyle} value={fleetForm.fleet_state} onChange={e => setFleetForm(p => ({ ...p, fleet_state: e.target.value }))} maxLength={2} placeholder="e.g. TX" />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" onClick={() => setShowFleetForm(false)} style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={fleetSaving} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {fleetSaving ? 'Creating…' : 'Create Fleet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Contact Modal */}
      {contactFleetId !== null && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setContactFleetId(null); }}>
          <div style={modalBox}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#111827' }}>Add Contact</h3>
            <div style={{ color: '#6B7280', fontSize: 12, marginBottom: 18 }}>
              {fleets.find(f => f.fleet_id === contactFleetId)?.fleet_name}
            </div>
            <form onSubmit={handleCreateContact} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" onClick={() => setContactFleetId(null)} style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={contactSaving} style={{ background: '#1c3660', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {contactSaving ? 'Adding…' : 'Add Contact'}
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
  const [authed, setAuthed] = useState(!!localStorage.getItem('token'));
  const [entering, setEntering] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [fleetState, setFleetState] = useState(null);
  const [general, setGeneral] = useState({});
  const [tech, setTech] = useState({});
  const [techCategories, setTechCategories] = useState({});
  const [selectedConfig, setSelectedConfig] = useState(1);
  const [mpg, setMpg] = useState({});
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
            <MpgChart mpg={mpg} techData={tech} years={fleet?.submissionYears} />
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
