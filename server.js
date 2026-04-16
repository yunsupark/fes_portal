// server.js — NACFE Fleet Benchmarking API
// Requirements: npm install express mysql2 cors bcryptjs jsonwebtoken dotenv
// Usage: node server.js (or nodemon server.js for dev)

require("dotenv").config();
const express = require("express");
const mysql   = require("mysql2/promise");
const cors    = require("cors");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

/*
  Run once in MySQL to set up submission tracking:

  CREATE TABLE IF NOT EXISTS ffs_submission (
    fleet_id     INT NOT NULL,
    survey_year  INT NOT NULL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    contact_id   INT,
    PRIMARY KEY (fleet_id, survey_year)
  );

  -- Populate from existing data (marks the latest year with data before 2024 as submitted):
  INSERT IGNORE INTO ffs_submission (fleet_id, survey_year)
  SELECT fleet_id, MAX(yr) AS survey_year
  FROM (
    SELECT fleet_id, adoption_year AS yr FROM ffs_adoption WHERE adoption_year < 2024
    UNION ALL
    SELECT fleet_id, mpg_year AS yr FROM ffs_mpg WHERE mpg_year < 2024
  ) t
  GROUP BY fleet_id;

  -- Settings table for admin-configurable values:
  CREATE TABLE IF NOT EXISTS ffs_settings (
    setting_key   VARCHAR(64) NOT NULL PRIMARY KEY,
    setting_value TEXT
  );
  INSERT IGNORE INTO ffs_settings (setting_key, setting_value) VALUES
    ('editable_year_from', '2003'),
    ('editable_year_to',   '2026');
*/

// ─── Logging Middleware ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
  next();
});

// ─── Database Pool ──────────────────────────────────────────────────────────
const db = mysql.createPool({
  host:     process.env.DB_HOST     || "localhost",
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || "root",
  password: process.env.DB_PASS     || "",
  database: process.env.DB_NAME     || "",
  waitForConnections: true,
  connectionLimit: 10,
});

// ─── DB Init ────────────────────────────────────────────────────────────────
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ffs_settings (
        setting_key   VARCHAR(64) NOT NULL PRIMARY KEY,
        setting_value TEXT
      )
    `);
    await db.query(`
      INSERT IGNORE INTO ffs_settings (setting_key, setting_value) VALUES
        ('editable_year_from', '2003'),
        ('editable_year_to',   '${new Date().getFullYear()}'),
        ('example_fleet_id',   '45')
    `);
    // Use INFORMATION_SCHEMA for compatibility with MySQL < 8.0
    const [[{ col_exists }]] = await db.query(
      `SELECT COUNT(*) AS col_exists FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ffs_contact' AND COLUMN_NAME = 'portal_access'`
    );
    if (!col_exists) {
      await db.query(`ALTER TABLE ffs_contact ADD COLUMN portal_access TINYINT(1) NOT NULL DEFAULT 0`);
      console.log("Added portal_access column to ffs_contact");
    }
  } catch (e) { console.error("DB init error:", e); }
})();

// ─── Auth Middleware ─────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    console.warn(`[AUTH] Missing Authorization header on ${req.method} ${req.path}`);
    return res.status(401).json({ error: "Missing Authorization header" });
  }
  if (!header.startsWith("Bearer ")) {
    console.warn(`[AUTH] Invalid Authorization format: ${header.substring(0, 20)}...`);
    return res.status(401).json({ error: "Invalid token format" });
  }
  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    console.warn(`[AUTH] JWT verification failed: ${err.message}`);
    res.status(401).json({ error: "Invalid token" });
  }
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { email }
 * Returns: { token, fleet }
 *
 * This login accepts only an email address and matches it against
 * `ffs_contact.email`. It joins to the `fleets` table to return fleet info.
 */
app.post("/api/auth/login", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });

  try {
    const [rows] = await db.query(
      `SELECT f.fleet_id, f.fleet_name, f.fleet_city, f.fleet_state,
              c.contact_id AS user_contact_id, c.first_name, c.last_name, c.email
       FROM ffs_contact c
       JOIN ffs_fleet f ON c.fleet_id = f.fleet_id
       WHERE c.email = ? LIMIT 1`,
      [email]
    );
    const row = rows[0];
    if (!row) return res.status(401).json({ error: "Fleet not found for that email" });

    // Admins (fleet_id=0) always have access; others must have portal_access=1
    if (row.fleet_id !== 0) {
      try {
        const [[accessRow]] = await db.query(
          `SELECT COALESCE(portal_access, 0) AS portal_access FROM ffs_contact WHERE contact_id = ?`,
          [row.user_contact_id]
        );
        if (!accessRow?.portal_access) {
          return res.status(403).json({ error: "Access to this portal is not yet available for your fleet." });
        }
      } catch (e) {
        // portal_access column not yet created — deny non-admin access
        return res.status(403).json({ error: "Access to this portal is not yet available for your fleet." });
      }
    }

    const token = jwt.sign(
      { fleet_id: row.fleet_id, fleet_name: row.fleet_name, contact_id: row.user_contact_id },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      fleet: {
        id:      row.fleet_id,
        name:    row.fleet_name,
        contact: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        email:   row.email,
        hq:      row.fleet_city ? `${row.fleet_city}, ${row.fleet_state}` : null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── Fleet Routes ─────────────────────────────────────────────────────────────

/**
 * GET /api/fleet/me
 * Returns the current fleet's profile and list of years they've submitted
 */
app.get("/api/fleet/me", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    const [fleetRows] = await db.query(
      "SELECT * FROM ffs_fleet WHERE fleet_id = ?",
      [fleet_id]
    );
    if (!fleetRows[0]) return res.status(404).json({ error: "Fleet not found" });

    const [yearRows] = await db.query(
      "SELECT DISTINCT adoption_year FROM ffs_adoption WHERE fleet_id = ? ORDER BY adoption_year DESC",
      [fleet_id]
    );

    const f = fleetRows[0];
    res.json({
      fleet: {
        id: f.fleet_id,
        name: f.fleet_name,
        contact: null,
        email: null,
        hq: f.fleet_city && f.fleet_state ? `${f.fleet_city}, ${f.fleet_state}` : null,
        submissionYears: yearRows.map(r => r.adoption_year),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── General Data Routes ──────────────────────────────────────────────────────

/**
 * GET /api/general?fleet_id=1
 * Returns all historical general data rows for this fleet keyed by year.
 * ASSUMPTION: `general_data` table has columns matching the General tab:
 *   fleet_id, survey_year,
 *   sleeper_tractors_owned, day_cab_tractors_owned, trailers_owned,
 *   leased_tractors, owner_operators, avg_tractor_age, avg_trailer_age,
 *   ecm_miles, ecm_fuel
 */
app.get("/api/general", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    const [rows] = await db.query(
      `SELECT utilization_year, application, utliz_tractor_qty AS tractors, utliz_trailer_qty AS trailers
       FROM ffs_equip_utilization
       WHERE fleet_id = ?
       ORDER BY utilization_year`,
      [fleet_id]
    );
    // Transform array → { year: data } map for the frontend
    const byYear = {};
    rows.forEach(r => { byYear[r.utilization_year] = r; });
    res.json(byYear);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── Technology Adoption Routes ───────────────────────────────────────────────

/**
 * GET /api/mpg
 * Returns IFTA miles per gallon by year for the fleet.
 * response: { "2023": 4.32, "2022": 4.21, ... }
 */
app.get("/api/mpg", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    const [rows] = await db.query(
      `SELECT mpg_year, 
              IF(SUM(ifta_fuel) > 0, SUM(ifta_miles)/SUM(ifta_fuel), NULL) AS mpg
       FROM ffs_mpg
       WHERE fleet_id = ?
       GROUP BY mpg_year
       ORDER BY mpg_year`,
      [fleet_id]
    );
    const byYear = {};
    rows.forEach(r => {
      if (r.mpg != null) byYear[r.mpg_year] = parseFloat(r.mpg);
    });
    res.json(byYear);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── Submission Status ────────────────────────────────────────────────────────

app.get("/api/submission-status", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    // Submitted years for this fleet
    const [subRows] = await db.query(
      'SELECT survey_year, submitted_at FROM ffs_submission WHERE fleet_id = ? ORDER BY survey_year',
      [fleet_id]
    );
    const submittedYears = subRows.map(r => Number(r.survey_year));
    const lastSubmitted  = submittedYears.length ? Math.max(...submittedYears) : null;
    // A fleet is "new" if it has no submissions with a submitted_at in the past (i.e. no real historical data)
    const isNewFleet = !subRows.some(r => r.submitted_at != null);
    // Editable: configurable window from ffs_settings
    const [settingRows] = await db.query(
      `SELECT setting_key, setting_value FROM ffs_settings WHERE setting_key IN ('editable_year_from','editable_year_to')`
    );
    const settingsMap = Object.fromEntries(settingRows.map(r => [r.setting_key, Number(r.setting_value)]));
    const yrFrom = settingsMap.editable_year_from ?? 2003;
    const yrTo   = settingsMap.editable_year_to   ?? new Date().getFullYear();
    const editableYears = [];
    const startYear = lastSubmitted ? Math.max(lastSubmitted + 1, yrFrom) : yrFrom;
    for (let yr = startYear; yr <= yrTo; yr++) editableYears.push(yr);

    // Use editableYears as the years to query for status
    const years = editableYears.length ? editableYears : [new Date().getFullYear()];

    const [utilRows] = await db.query(
      `SELECT utilization_year AS yr, COUNT(*) AS cnt FROM ffs_equip_utilization
       WHERE fleet_id = ? AND utilization_year IN (?) GROUP BY utilization_year`,
      [fleet_id, years]
    );
    const [equipRows] = await db.query(
      `SELECT equip_year AS yr, COUNT(*) AS cnt FROM ffs_fleet_equip
       WHERE fleet_id = ? AND equip_year IN (?) GROUP BY equip_year`,
      [fleet_id, years]
    );
    const [fuelRows] = await db.query(
      `SELECT mpg_year AS yr, COUNT(*) AS cnt,
              GROUP_CONCAT(DISTINCT fuel_type ORDER BY fuel_type SEPARATOR ', ') AS fuel_types
       FROM ffs_mpg WHERE fleet_id = ? AND mpg_year IN (?) GROUP BY mpg_year`,
      [fleet_id, years]
    );
    const [techRows] = await db.query(
      `SELECT a.adoption_year AS yr, a.cab_type, COUNT(DISTINCT a.tech_id) AS cnt
       FROM ffs_adoption a
       JOIN ffs_tech t ON a.tech_id = t.tech_id
       WHERE a.fleet_id = ? AND a.adoption_year IN (?) AND a.cab_type IS NOT NULL
         AND t.active_to IS NULL
         AND (
           (a.cab_type = 'Sleeper'  AND (t.applies_sleeper = 1 OR t.applies_sleeper IS NULL))
           OR
           (a.cab_type = 'Day Cab' AND (t.applies_daycab  = 1 OR t.applies_daycab  IS NULL))
         )
       GROUP BY a.adoption_year, a.cab_type`,
      [fleet_id, years]
    );

    const toMap = (rows) => Object.fromEntries(rows.map(r => [r.yr, Number(r.cnt)]));
    const utilization = toMap(utilRows);
    const fleetEquip  = toMap(equipRows);
    const fuel        = Object.fromEntries(fuelRows.map(r => [r.yr, { cnt: Number(r.cnt), fuel_types: r.fuel_types || '' }]));

    const tech = {};
    techRows.forEach(r => {
      if (!tech[r.yr]) tech[r.yr] = {};
      tech[r.yr][r.cab_type] = Number(r.cnt);
    });

    const techTotals = {};
    for (const yr of years) {
      const [[sleeperRow]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM ffs_tech
         WHERE (applies_sleeper = 1 OR applies_sleeper IS NULL)
           AND (active_from IS NULL OR active_from <= ?)
           AND active_to IS NULL`,
        [yr]
      );
      const [[dayCabRow]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM ffs_tech
         WHERE (applies_daycab = 1 OR applies_daycab IS NULL)
           AND (active_from IS NULL OR active_from <= ?)
           AND active_to IS NULL`,
        [yr]
      );
      techTotals[yr] = { 'Sleeper': Number(sleeperRow.cnt), 'Day Cab': Number(dayCabRow.cnt) };
    }

    res.json({ years, utilization, fleetEquip, fuel, tech, techTotals, submittedYears, editableYears, isNewFleet });
  } catch (err) {
    console.error("Error fetching submission status:", err.message);
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

app.post("/api/submit/:year", requireAuth, async (req, res) => {
  const { fleet_id, contact_id } = req.user;
  const year = parseInt(req.params.year);
  if (isNaN(year)) return res.status(400).json({ error: "Invalid year" });
  try {
    await db.query(
      `INSERT IGNORE INTO ffs_submission (fleet_id, survey_year, contact_id) VALUES (?, ?, ?)`,
      [fleet_id, year, contact_id ?? null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Error submitting year:", err.message);
    res.status(500).json({ error: "Failed to submit" });
  }
});

/**
 * POST /api/submit-all
 * Submits all editable years at once (for initial submission by new fleets).
 */
app.post("/api/submit-all", requireAuth, async (req, res) => {
  const { fleet_id, contact_id } = req.user;
  try {
    const [settingRows] = await db.query(
      `SELECT setting_key, setting_value FROM ffs_settings WHERE setting_key IN ('editable_year_from','editable_year_to')`
    );
    const sm = Object.fromEntries(settingRows.map(r => [r.setting_key, Number(r.setting_value)]));
    const yrFrom = sm.editable_year_from ?? 2003;
    const yrTo   = sm.editable_year_to   ?? new Date().getFullYear();
    const [subRows] = await db.query(
      `SELECT survey_year FROM ffs_submission WHERE fleet_id = ? ORDER BY survey_year`, [fleet_id]
    );
    const submittedSet = new Set(subRows.map(r => Number(r.survey_year)));
    for (let yr = yrFrom; yr <= yrTo; yr++) {
      if (!submittedSet.has(yr)) {
        await db.query(
          `INSERT IGNORE INTO ffs_submission (fleet_id, survey_year, contact_id) VALUES (?, ?, ?)`,
          [fleet_id, yr, contact_id ?? null]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Error submitting all years:", err.message);
    res.status(500).json({ error: "Failed to submit" });
  }
});

/**
 * POST /api/admin/reset-example-fleet
 * Deletes all input data for the example fleet (fleet_id from ffs_settings).
 */
app.post("/api/admin/reset-example-fleet", requireAuth, requireAdmin, async (_req, res) => {
  const fleetId = 51;
  try {
    await db.query(`DELETE FROM ffs_adoption          WHERE fleet_id = ?`, [fleetId]);
    await db.query(`DELETE FROM ffs_mpg               WHERE fleet_id = ?`, [fleetId]);
    await db.query(`DELETE FROM ffs_fleet_equip        WHERE fleet_id = ?`, [fleetId]);
    await db.query(`DELETE FROM ffs_equip_utilization  WHERE fleet_id = ?`, [fleetId]);
    await db.query(`DELETE FROM ffs_submission         WHERE fleet_id = ?`, [fleetId]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error resetting example fleet:", err.message);
    res.status(500).json({ error: "Failed to reset example fleet" });
  }
});

// ─── Technology Adoption Routes ───────────────────────────────────────────────

/**
 * GET /api/techs?config=1
 * Returns technology adoption percentages for all years.
 * ASSUMPTION: your DB has a `tech_adoptions` table (from the Techs-Tractor tabs):
 *   fleet_id, survey_year, config_num (1 or 2), tech_key, pct_adoption
 *
 * tech_key matches the keys used in the frontend (e.g. "diesel_apu", "battery_hvac")
 */
app.get("/api/techs", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  const cab_type_filter = req.query.cab_type || null;
  try {
    // All tech categories (for full edit form even when no data exists)
    const categories = {};
    const [allTechRows] = await db.query(
      `SELECT tech_id, tech_group, technology, tech_expl, applies_sleeper, applies_daycab, active_from, active_to
       FROM ffs_tech ORDER BY tech_group, technology`
    );
    allTechRows.forEach(r => {
      if (!categories[r.tech_group]) categories[r.tech_group] = [];
      if (!categories[r.tech_group].some(t => t.label === r.technology)) {
        categories[r.tech_group].push({
          label: r.technology, desc: r.tech_expl || '', tech_id: r.tech_id,
          applies_sleeper: r.applies_sleeper, applies_daycab: r.applies_daycab,
          active_from: r.active_from ?? null, active_to: r.active_to ?? null,
        });
      }
    });

    // Adoption data filtered by cab_type (or all if none specified)
    let dataRows;
    if (cab_type_filter) {
      [dataRows] = await db.query(
        `SELECT a.adoption_year, t.tech_group, t.technology, a.adoption_percent, a.cab_type
         FROM ffs_adoption a JOIN ffs_tech t ON a.tech_id = t.tech_id
         WHERE a.fleet_id = ? AND a.cab_type = ?
         ORDER BY a.adoption_year, t.tech_group, t.technology`,
        [fleet_id, cab_type_filter]
      );
    } else {
      [dataRows] = await db.query(
        `SELECT a.adoption_year, t.tech_group, t.technology, a.adoption_percent, a.cab_type
         FROM ffs_adoption a JOIN ffs_tech t ON a.tech_id = t.tech_id
         WHERE a.fleet_id = ? AND a.config = 1
         ORDER BY a.adoption_year, t.tech_group, t.technology`,
        [fleet_id]
      );
    }

    const byYear = {};
    const meta = {};
    dataRows.forEach(r => {
      if (!byYear[r.adoption_year]) byYear[r.adoption_year] = {};
      byYear[r.adoption_year][r.technology] = parseFloat(r.adoption_percent);
      if (r.cab_type && !meta[r.adoption_year]) meta[r.adoption_year] = { cab_type: r.cab_type };
    });

    // Distinct cab_types that have data for this fleet
    const [cabTypeRows] = await db.query(
      `SELECT DISTINCT cab_type FROM ffs_adoption WHERE fleet_id = ? AND cab_type IS NOT NULL ORDER BY cab_type`,
      [fleet_id]
    );
    const availableCabTypes = cabTypeRows.map(r => r.cab_type);

    res.json({ categories, data: byYear, meta, availableCabTypes });
  } catch (err) {
    console.error("Error fetching techs:", err.message);
    res.status(500).json({ error: "Failed to fetch technology data" });
  }
});

/**
 * PUT /api/techs/:year?config=1
 * Upserts technology adoption percentages for a single year.
 * Body: { cab_type: 'Sleeper'|'Day Cab', techs: { 'Technology Label': '85', ... } }
 */
app.put("/api/techs/:year", requireAuth, async (req, res) => {
  const { fleet_id, contact_id } = req.user;
  const year = parseInt(req.params.year);
  const { cab_type, techs } = req.body;
  if (!cab_type) return res.status(400).json({ error: "cab_type is required" });
  try {
    // Validate year is within the admin-configured editable window
    const [settingRows] = await db.query(
      `SELECT setting_key, setting_value FROM ffs_settings WHERE setting_key IN ('editable_year_from','editable_year_to')`
    );
    const sm = Object.fromEntries(settingRows.map(r => [r.setting_key, Number(r.setting_value)]));
    const yrFrom = sm.editable_year_from ?? 2003;
    const yrTo   = sm.editable_year_to   ?? new Date().getFullYear();
    if (year < yrFrom || year > yrTo) {
      return res.status(400).json({ error: `Year ${year} is not in the editable range (${yrFrom}–${yrTo})` });
    }

    // Find existing config for this fleet + cab_type, or assign next available config number
    const [existingCfg] = await db.query(
      `SELECT DISTINCT config FROM ffs_adoption WHERE fleet_id = ? AND cab_type = ? LIMIT 1`,
      [fleet_id, cab_type]
    );
    let config;
    if (existingCfg.length) {
      config = existingCfg[0].config;
    } else {
      const [maxCfg] = await db.query(
        `SELECT COALESCE(MAX(config), 0) AS max_config FROM ffs_adoption WHERE fleet_id = ?`,
        [fleet_id]
      );
      config = maxCfg[0].max_config + 1;
    }

    // Resolve technology labels -> tech_id
    const labels = Object.keys(techs || {});
    if (!labels.length) return res.json({ ok: true });
    const [techRows] = await db.query(
      `SELECT tech_id, technology FROM ffs_tech WHERE technology IN (?)`,
      [labels]
    );
    const labelToId = {};
    techRows.forEach(r => { labelToId[r.technology] = r.tech_id; });

    for (const [label, pct] of Object.entries(techs)) {
      if (pct === '' || pct == null) continue;
      const tech_id = labelToId[label];
      if (!tech_id) continue;
      await db.query(
        `INSERT INTO ffs_adoption (fleet_id, tech_id, adoption_year, config, adoption_percent, cab_type, contact_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE adoption_percent = VALUES(adoption_percent), cab_type = VALUES(cab_type), contact_id = VALUES(contact_id)`,
        [fleet_id, tech_id, year, config, parseFloat(pct) / 100, cab_type, contact_id ?? null]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Error saving techs:", err.message);
    res.status(500).json({ error: "Failed to save technology data" });
  }
});

// ─── Fleet Details Routes ─────────────────────────────────────────────────────

/**
 * GET /api/fleet-details
 * Returns combined ffs_equip_utilization (per application row) + ffs_mpg keyed by year.
 * response: { "2023": { utilization: [...], ifta_miles, ifta_fuel }, ... }
 */
app.get("/api/fleet-details", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    const [utilRows] = await db.query(
      `SELECT utilization_year AS year, application,
              utliz_tractor_qty AS tractors, utliz_trailer_qty AS trailers,
              grossed_out_perc, cubed_out_perc, ave_length_haul, empty_miles_perc
       FROM ffs_equip_utilization
       WHERE fleet_id = ?
       ORDER BY utilization_year, application`,
      [fleet_id]
    );
    const [mpgRows] = await db.query(
      `SELECT mpg_year AS year,
              SUM(ifta_miles) AS ifta_miles,
              SUM(ifta_fuel)  AS ifta_fuel
       FROM ffs_mpg
       WHERE fleet_id = ?
       GROUP BY mpg_year
       ORDER BY mpg_year`,
      [fleet_id]
    );

    const byYear = {};
    utilRows.forEach(r => {
      if (!byYear[r.year]) byYear[r.year] = { utilization: [], ifta_miles: null, ifta_fuel: null };
      byYear[r.year].utilization.push({
        application:      r.application || '',
        tractors:         r.tractors         != null ? parseInt(r.tractors)          : null,
        trailers:         r.trailers         != null ? parseInt(r.trailers)          : null,
        grossed_out_perc: r.grossed_out_perc != null ? parseFloat(r.grossed_out_perc) : null,
        cubed_out_perc:   r.cubed_out_perc   != null ? parseFloat(r.cubed_out_perc)   : null,
        ave_length_haul:  r.ave_length_haul  != null ? parseInt(r.ave_length_haul)    : null,
        empty_miles_perc: r.empty_miles_perc != null ? parseFloat(r.empty_miles_perc) : null,
      });
    });
    mpgRows.forEach(r => {
      if (!byYear[r.year]) byYear[r.year] = { utilization: [], ifta_miles: null, ifta_fuel: null };
      byYear[r.year].ifta_miles = r.ifta_miles != null ? parseFloat(r.ifta_miles) : null;
      byYear[r.year].ifta_fuel  = r.ifta_fuel  != null ? parseFloat(r.ifta_fuel)  : null;
    });

    res.json(byYear);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * PUT /api/fleet-details/:year
 * Upserts one year's per-application utilization rows and mpg data.
 * Body: { utilization: [{ application, tractors, trailers, grossed_out_perc, cubed_out_perc, ave_length_haul, empty_miles_perc }], ifta_miles, ifta_fuel }
 */
app.delete("/api/fleet-details/:year/:application", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  const year = parseInt(req.params.year);
  const application = decodeURIComponent(req.params.application);
  try {
    await db.query(
      "DELETE FROM ffs_equip_utilization WHERE fleet_id = ? AND utilization_year = ? AND application = ?",
      [fleet_id, year, application]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete row" });
  }
});

app.put("/api/fleet-details/:year", requireAuth, async (req, res) => {
  const { fleet_id, contact_id } = req.user;
  const year = parseInt(req.params.year);
  if (isNaN(year)) return res.status(400).json({ error: "Invalid year" });

  const { utilization, ifta_miles, ifta_fuel } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (Array.isArray(utilization)) {
      for (const row of utilization) {
        await conn.query(
          `INSERT INTO ffs_equip_utilization
             (fleet_id, utilization_year, application,
              utliz_tractor_qty, utliz_trailer_qty,
              grossed_out_perc, cubed_out_perc, ave_length_haul, empty_miles_perc, contact_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             utliz_tractor_qty = VALUES(utliz_tractor_qty),
             utliz_trailer_qty = VALUES(utliz_trailer_qty),
             grossed_out_perc  = VALUES(grossed_out_perc),
             cubed_out_perc    = VALUES(cubed_out_perc),
             ave_length_haul   = VALUES(ave_length_haul),
             empty_miles_perc  = VALUES(empty_miles_perc),
             contact_id        = VALUES(contact_id)`,
          [fleet_id, year, row.application ?? null,
           row.tractors ?? null, row.trailers ?? null,
           row.grossed_out_perc ?? null, row.cubed_out_perc ?? null,
           row.ave_length_haul ?? null, row.empty_miles_perc ?? null, contact_id ?? null]
        );
      }
    }

    if (ifta_miles != null || ifta_fuel != null) {
      await conn.query(
        `INSERT INTO ffs_mpg (fleet_id, mpg_year, ifta_miles, ifta_fuel)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           ifta_miles = VALUES(ifta_miles),
           ifta_fuel  = VALUES(ifta_fuel)`,
        [fleet_id, year, ifta_miles ?? null, ifta_fuel ?? null]
      );
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to save fleet details" });
  } finally {
    conn.release();
  }
});

// ─── Fuel Routes ─────────────────────────────────────────────────────────────

/**
 * GET /api/fuel
 * Returns all ffs_mpg rows for the fleet, ordered by year desc.
 */
app.get("/api/fuel", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    const [rows] = await db.query(
      `SELECT mpg_id, mpg_year AS year, fuel_type,
              ifta_miles, ifta_fuel, nat_gas_dge
       FROM ffs_mpg
       WHERE fleet_id = ?
       ORDER BY mpg_year DESC, mpg_id`,
      [fleet_id]
    );
    res.json(rows.map(r => ({
      mpg_id:      r.mpg_id,
      year:        r.year,
      fuel_type:   r.fuel_type   || '',
      ifta_miles:  r.ifta_miles  != null ? parseFloat(r.ifta_miles)  : null,
      ifta_fuel:   r.ifta_fuel   != null ? parseFloat(r.ifta_fuel)   : null,
      nat_gas_dge: r.nat_gas_dge != null ? parseFloat(r.nat_gas_dge) : null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/api/fuel/row/:id", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  const id = parseInt(req.params.id);
  try {
    await db.query("DELETE FROM ffs_mpg WHERE mpg_id = ? AND fleet_id = ?", [id, fleet_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete row" });
  }
});

/**
 * PUT /api/fuel/:year
 * Replaces all fuel rows for this fleet and year.
 * Body: { rows: [{ fuel_type, ifta_miles, ifta_fuel, nat_gas_dge }] }
 */
app.put("/api/fuel/:year", requireAuth, async (req, res) => {
  const { fleet_id, contact_id } = req.user;
  const year = parseInt(req.params.year);
  if (isNaN(year)) return res.status(400).json({ error: "Invalid year" });

  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows array required" });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM ffs_mpg WHERE fleet_id = ? AND mpg_year = ?", [fleet_id, year]);
    for (const r of rows) {
      const isCng = ['CNG', 'LNG'].includes(r.fuel_type);
      await conn.query(
        `INSERT INTO ffs_mpg (fleet_id, mpg_year, fuel_type, ifta_miles, ifta_fuel, nat_gas_dge, contact_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [fleet_id, year,
         r.fuel_type   || null,
         r.ifta_miles  != null && r.ifta_miles  !== '' ? parseFloat(r.ifta_miles)  : null,
         isCng ? null : (r.volume != null && r.volume !== '' ? parseFloat(r.volume) : null),
         isCng ? (r.volume != null && r.volume !== '' ? parseFloat(r.volume) : null) : null,
         contact_id ?? null]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to save fuel data" });
  } finally {
    conn.release();
  }
});

// ─── Fleet Equipment Routes ───────────────────────────────────────────────────

/**
 * GET /api/fleet-equip/reference
 * Returns make/model lookup tables for the fleet equipment form.
 */
app.get("/api/fleet-equip/reference", requireAuth, async (req, res) => {
  try {
    const [makeModels]   = await db.query("SELECT make, model FROM ffs_make_model ORDER BY make, model");
    const [engineModels] = await db.query("SELECT make, engine_model AS model FROM ffs_engine_model ORDER BY make, engine_model");
    res.json({ makeModels, engineModels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * GET /api/fleet-equip
 * Returns all ffs_fleet_equip rows keyed by equip_year.
 */
app.get("/api/fleet-equip", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    const [rows] = await db.query(
      `SELECT fleet_equip_id, equip_year, qty, cab_type,
              tractor_make, tractor_model,
              engine_make, engine_model, engine_rating,
              transmission_make, transmission_model,
              axle_make, axle_model, axle_ratio
       FROM ffs_fleet_equip
       WHERE fleet_id = ?
       ORDER BY equip_year, fleet_equip_id`,
      [fleet_id]
    );
    const byYear = {};
    rows.forEach(r => {
      if (!byYear[r.equip_year]) byYear[r.equip_year] = [];
      byYear[r.equip_year].push({
        fleet_equip_id:    r.fleet_equip_id,
        qty:               r.qty,
        cab_type:          r.cab_type          || '',
        tractor_make:      r.tractor_make      || '',
        tractor_model:     r.tractor_model     || '',
        engine_make:       r.engine_make       || '',
        engine_model:      r.engine_model      || '',
        engine_rating:     r.engine_rating     || '',
        transmission_make:  r.transmission_make  || '',
        transmission_model: r.transmission_model || '',
        axle_make:         r.axle_make         || '',
        axle_model:        r.axle_model        || '',
        axle_ratio:        r.axle_ratio != null ? parseFloat(r.axle_ratio) : null,
      });
    });
    res.json(byYear);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/api/fleet-equip/row/:id", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  const id = parseInt(req.params.id);
  try {
    await db.query("DELETE FROM ffs_fleet_equip WHERE fleet_equip_id = ? AND fleet_id = ?", [id, fleet_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete row" });
  }
});

/**
 * PUT /api/fleet-equip/:year
 * Replaces all equipment rows for this fleet and equip_year.
 * Body: { rows: [{ qty, cab_type, tractor_make, ... }] }
 */
app.put("/api/fleet-equip/:year", requireAuth, async (req, res) => {
  const { fleet_id, contact_id } = req.user;
  const year = parseInt(req.params.year);
  if (isNaN(year)) return res.status(400).json({ error: "Invalid year" });

  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows array required" });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "DELETE FROM ffs_fleet_equip WHERE fleet_id = ? AND equip_year = ?",
      [fleet_id, year]
    );
    for (const r of rows) {
      await conn.query(
        `INSERT INTO ffs_fleet_equip
           (fleet_id, equip_year, qty, cab_type,
            tractor_make, tractor_model,
            engine_make, engine_model, engine_rating,
            transmission_make, transmission_model,
            axle_make, axle_model, axle_ratio, contact_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [fleet_id, year,
         r.qty               || null, r.cab_type          || null,
         r.tractor_make      || null, r.tractor_model     || null,
         r.engine_make       || null, r.engine_model      || null,
         r.engine_rating     || null,
         r.transmission_make  || null, r.transmission_model || null,
         r.axle_make         || null, r.axle_model        || null,
         r.axle_ratio != null && r.axle_ratio !== '' ? parseFloat(r.axle_ratio) : null,
         contact_id ?? null]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to save fleet equipment" });
  } finally {
    conn.release();
  }
});

// ─── Submission Routes ────────────────────────────────────────────────────────

/**
 * POST /api/submissions
 * Saves a new year's data entry.
 * Body: {
 *   survey_year: 2024,
 *   general: { sleepers, dayCabs, trailers, ecmMiles, ecmFuel },
 *   techs: { diesel_apu: 0, battery_hvac: 100, ... }   (values 0-100)
 * }
 */
app.post("/api/submissions", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  const { adoption_year, general, techs } = req.body;

  if (!survey_year || !general)
    return res.status(400).json({ error: "adoption_year and general data required" });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Upsert general data
    await conn.query(
      `INSERT INTO ffs_equip_utilization
         (fleet_id, utilization_year, utliz_tractor_qty,
         entry_timestamp)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         tractors_owned = VALUES(tractors_owned),
         trailers_owned         = VALUES(trailers_owned),
         submitted_at           = NOW()`,
      [fleet_id, survey_year,
       general.tractors, general.trailers]
    );

    // Upsert each technology row
    if (techs) {
      for (const [tech_key, pct] of Object.entries(techs)) {
        if (pct === "" || pct == null) continue;
        await conn.query(
          `INSERT INTO ffs_adoption (fleet_id, adoption_year, config, tech_id, adoption_percent)
           VALUES (?, ?, 1, ?, ?)
           ON DUPLICATE KEY UPDATE pct_adoption = VALUES(pct_adoption)`,
          [fleet_id, survey_year, tech_key, parseFloat(pct) / 100]
        );
      }
    }

    await conn.commit();
    res.json({ ok: true, message: `${survey_year} data saved.` });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to save submission" });
  } finally {
    conn.release();
  }
});

/**
 * GET /api/submissions/:year
 * Returns a single year's full submission for review/edit.
 */
app.get("/api/submissions/:year", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  const year = parseInt(req.params.year);
  try {
    const [[general]] = await db.query(
      "SELECT * FROM ffs_equip_utilization WHERE fleet_id = ? AND survey_year = ?",
      [fleet_id, year]
    );
    const [techRows] = await db.query(
      "SELECT technology, adoption_percent FROM ffs_adoption a join ffs_tech t on a.tech_id = t.tech_id WHERE fleet_id = ? AND survey_year = ? AND config_num = 1",
      [fleet_id, year]
    );
    const techs = {};
    techRows.forEach(r => { techs[r.tech_key] = r.pct_adoption; });
    res.json({ year, general: general || null, techs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  if (req.user?.fleet_id !== 0) return res.status(403).json({ error: "Admin access required" });
  next();
}

/*
  Run once to add new columns:
  ALTER TABLE ffs_contact ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1;
  ALTER TABLE ffs_contact ADD COLUMN IF NOT EXISTS portal_access TINYINT(1) NOT NULL DEFAULT 0;
  ALTER TABLE ffs_fleet   ADD COLUMN IF NOT EXISTS default_duty_cycle VARCHAR(50) NULL;
*/

/**
 * GET /api/admin/fleets
 * Returns all fleets with their contacts and last submission year.
 */
app.get("/api/admin/fleets", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [fleetRows] = await db.query(
      `SELECT f.fleet_id, f.fleet_name, f.fleet_city, f.fleet_state,
              f.default_duty_cycle,
              MAX(s.survey_year) AS last_submitted_year
       FROM ffs_fleet f
       LEFT JOIN ffs_submission s ON s.fleet_id = f.fleet_id
       WHERE f.fleet_id NOT IN (0, 45, 46)
       GROUP BY f.fleet_id, f.fleet_name, f.fleet_city, f.fleet_state, f.default_duty_cycle
       ORDER BY f.fleet_name`
    );
    const [contactRows] = await db.query(
      `SELECT contact_id, fleet_id, first_name, last_name, email, phone,
              COALESCE(active, 1) AS active,
              COALESCE(portal_access, 0) AS portal_access
       FROM ffs_contact
       WHERE fleet_id NOT IN (0, 45, 46)
       ORDER BY fleet_id, last_name, first_name`
    );
    const contactsByFleet = {};
    contactRows.forEach(c => {
      if (!contactsByFleet[c.fleet_id]) contactsByFleet[c.fleet_id] = [];
      contactsByFleet[c.fleet_id].push({ ...c, active: Number(c.active), portal_access: Number(c.portal_access) });
    });
    const fleets = fleetRows.map(f => ({
      ...f,
      contacts: contactsByFleet[f.fleet_id] || [],
    }));
    res.json({ fleets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * POST /api/admin/fleets
 * Creates a new fleet.
 * Body: { fleet_name, fleet_city, fleet_state, default_duty_cycle }
 */
app.post("/api/admin/fleets", requireAuth, requireAdmin, async (req, res) => {
  const { fleet_name, fleet_city, fleet_state, default_duty_cycle } = req.body;
  if (!fleet_name) return res.status(400).json({ error: "fleet_name required" });
  try {
    const [result] = await db.query(
      `INSERT INTO ffs_fleet (fleet_name, fleet_city, fleet_state, default_duty_cycle) VALUES (?, ?, ?, ?)`,
      [fleet_name, fleet_city || null, fleet_state || null, default_duty_cycle || null]
    );
    res.json({ ok: true, fleet_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create fleet" });
  }
});

/**
 * PUT /api/admin/fleets/:id
 * Updates an existing fleet.
 * Body: { fleet_name, fleet_city, fleet_state, default_duty_cycle }
 */
app.put("/api/admin/fleets/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { fleet_name, fleet_city, fleet_state, default_duty_cycle } = req.body;
  if (!fleet_name) return res.status(400).json({ error: "fleet_name required" });
  try {
    await db.query(
      `UPDATE ffs_fleet SET fleet_name=?, fleet_city=?, fleet_state=?, default_duty_cycle=? WHERE fleet_id=?`,
      [fleet_name, fleet_city || null, fleet_state || null, default_duty_cycle || null, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update fleet" });
  }
});

/**
 * POST /api/admin/contacts
 * Creates a new contact for a fleet.
 * Body: { fleet_id, first_name, last_name, email, phone }
 */
app.post("/api/admin/contacts", requireAuth, requireAdmin, async (req, res) => {
  const { fleet_id, first_name, last_name, email, phone } = req.body;
  if (!fleet_id || !email) return res.status(400).json({ error: "fleet_id and email required" });
  try {
    const [result] = await db.query(
      `INSERT INTO ffs_contact (fleet_id, first_name, last_name, email, phone, active) VALUES (?, ?, ?, ?, ?, 1)`,
      [fleet_id, first_name || null, last_name || null, email, phone || null]
    );
    res.json({ ok: true, contact_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create contact" });
  }
});

/**
 * PUT /api/admin/contacts/:id
 * Updates an existing contact.
 * Body: { first_name, last_name, email, phone, active }
 */
app.put("/api/admin/contacts/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { first_name, last_name, email, phone, active, portal_access } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });
  try {
    await db.query(
      `UPDATE ffs_contact SET first_name=?, last_name=?, email=?, phone=?, active=?, portal_access=? WHERE contact_id=?`,
      [first_name || null, last_name || null, email, phone || null, active ? 1 : 0, portal_access ? 1 : 0, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update contact" });
  }
});

/**
 * PATCH /api/admin/contacts/:id/access
 * Toggles portal_access for a contact. Body: { portal_access: bool }
 */
app.patch("/api/admin/contacts/:id/access", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { portal_access } = req.body;
  try {
    await db.query(
      `UPDATE ffs_contact SET portal_access=? WHERE contact_id=?`,
      [portal_access ? 1 : 0, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update access" });
  }
});

/**
 * GET /api/admin/preview-token/:fleet_id
 * Returns a short-lived JWT for the given fleet so admin can preview its submission screen.
 */
app.get("/api/admin/preview-token/:fleet_id", requireAuth, requireAdmin, async (req, res) => {
  const fleetId = parseInt(req.params.fleet_id);
  if (!fleetId || fleetId <= 0) return res.status(400).json({ error: "Invalid fleet_id" });
  try {
    const [[fleet]] = await db.query("SELECT fleet_name FROM ffs_fleet WHERE fleet_id = ?", [fleetId]);
    if (!fleet) return res.status(404).json({ error: "Fleet not found" });
    const previewToken = jwt.sign({ fleet_id: fleetId, contact_id: req.user.contact_id ?? null }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ token: previewToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate preview token" });
  }
});

/**
 * GET /api/admin/techs
 * Returns all technologies.
 */
app.get("/api/admin/techs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT tech_id, tech_group, technology, tech_expl, applies_sleeper, applies_daycab, active_from, active_to
       FROM ffs_tech ORDER BY tech_group, technology`
    );
    res.json({ techs: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch techs" });
  }
});

/**
 * POST /api/admin/techs
 * Creates a new technology.
 */
app.post("/api/admin/techs", requireAuth, requireAdmin, async (req, res) => {
  const { tech_group, technology, tech_expl, applies_sleeper, applies_daycab, active_from, active_to } = req.body;
  if (!tech_group || !technology || !tech_expl) return res.status(400).json({ error: "tech_group, technology, and description required" });
  try {
    const [result] = await db.query(
      `INSERT INTO ffs_tech (tech_group, technology, tech_expl, applies_sleeper, applies_daycab, active_from, active_to)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tech_group, technology, tech_expl || null, applies_sleeper ? 1 : 0, applies_daycab ? 1 : 0,
       active_from || null, active_to || null]
    );
    res.json({ tech_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create tech" });
  }
});

/**
 * PUT /api/admin/techs/:id
 * Updates a technology.
 */
app.put("/api/admin/techs/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { tech_group, technology, tech_expl, applies_sleeper, applies_daycab, active_from, active_to } = req.body;
  if (!tech_group || !technology) return res.status(400).json({ error: "tech_group and technology required" });
  try {
    await db.query(
      `UPDATE ffs_tech SET tech_group=?, technology=?, tech_expl=?, applies_sleeper=?, applies_daycab=?, active_from=?, active_to=?
       WHERE tech_id=?`,
      [tech_group, technology, tech_expl || null, applies_sleeper ? 1 : 0, applies_daycab ? 1 : 0,
       active_from || null, active_to || null, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update tech" });
  }
});

/**
 * GET /api/admin/settings
 * Returns all admin-configurable settings.
 */
app.get("/api/admin/settings", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(`SELECT setting_key, setting_value FROM ffs_settings`);
    const settings = Object.fromEntries(rows.map(r => [r.setting_key, r.setting_value]));
    res.json({ settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

/**
 * PUT /api/admin/settings
 * Body: { key: value, ... } — upserts each provided key.
 */
app.put("/api/admin/settings", requireAuth, requireAdmin, async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: "Body must be an object" });
  try {
    for (const [key, value] of Object.entries(updates)) {
      await db.query(
        `INSERT INTO ffs_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, String(value)]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

/**
 * GET /api/chart-data
 * Returns fleet's own MPG, peer MPG (same duty cycle), and avg adoption % by cab type.
 */
app.get("/api/chart-data", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    // Own MPG
    const [mpgRows] = await db.query(
      `SELECT mpg_year, IF(SUM(ifta_fuel)>0, SUM(ifta_miles)/SUM(ifta_fuel), NULL) AS mpg
       FROM ffs_mpg WHERE fleet_id = ? GROUP BY mpg_year ORDER BY mpg_year`,
      [fleet_id]
    );
    const ownMpg = {};
    mpgRows.forEach(r => { if (r.mpg != null) ownMpg[r.mpg_year] = parseFloat(parseFloat(r.mpg).toFixed(2)); });

    // Peer MPG (same default_duty_cycle)
    const [[fleetRow]] = await db.query(
      `SELECT default_duty_cycle FROM ffs_fleet WHERE fleet_id = ?`, [fleet_id]
    );
    const peerMpg = {};
    if (fleetRow?.default_duty_cycle) {
      const [peerRows] = await db.query(
        `SELECT mpg_year, AVG(mpg) AS avg_mpg FROM (
           SELECT fleet_id, mpg_year, SUM(ifta_miles)/SUM(ifta_fuel) AS mpg
           FROM ffs_mpg
           WHERE fleet_id IN (
             SELECT fleet_id FROM ffs_fleet
             WHERE default_duty_cycle = ? AND fleet_id != ? AND fleet_id NOT IN (0,45,46)
           )
           GROUP BY fleet_id, mpg_year HAVING SUM(ifta_fuel) > 0
         ) sub GROUP BY mpg_year ORDER BY mpg_year`,
        [fleetRow.default_duty_cycle, fleet_id]
      );
      peerRows.forEach(r => { if (r.avg_mpg != null) peerMpg[r.mpg_year] = parseFloat(parseFloat(r.avg_mpg).toFixed(2)); });
    }

    // Own adoption avg % by cab type
    const [adoptionRows] = await db.query(
      `SELECT adoption_year, cab_type, AVG(adoption_percent)*100 AS avg_pct
       FROM ffs_adoption WHERE fleet_id = ? AND cab_type IN ('Sleeper','Day Cab')
       GROUP BY adoption_year, cab_type ORDER BY adoption_year`,
      [fleet_id]
    );
    const sleeperAdoption = {}, dayCabAdoption = {};
    adoptionRows.forEach(r => {
      const v = parseFloat(parseFloat(r.avg_pct).toFixed(1));
      if (r.cab_type === 'Sleeper') sleeperAdoption[r.adoption_year] = v;
      else dayCabAdoption[r.adoption_year] = v;
    });

    // All-fleet average adoption % by cab type (all fleets, not just same duty cycle)
    const [allAdoptionRows] = await db.query(
      `SELECT adoption_year, cab_type, AVG(adoption_percent)*100 AS avg_pct
       FROM ffs_adoption
       WHERE fleet_id NOT IN (0,45,46) AND cab_type IN ('Sleeper','Day Cab')
       GROUP BY adoption_year, cab_type ORDER BY adoption_year`
    );
    const allFleetSleeperAdoption = {}, allFleetDayCabAdoption = {};
    allAdoptionRows.forEach(r => {
      const v = parseFloat(parseFloat(r.avg_pct).toFixed(1));
      if (r.cab_type === 'Sleeper') allFleetSleeperAdoption[r.adoption_year] = v;
      else allFleetDayCabAdoption[r.adoption_year] = v;
    });

    const dutyCycle = fleetRow?.default_duty_cycle || null;

    res.json({ ownMpg, peerMpg, sleeperAdoption, dayCabAdoption, allFleetSleeperAdoption, allFleetDayCabAdoption, dutyCycle });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(500).json({ status: "error", db: "unreachable" });
  }
});

// ─── Serve React frontend ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "dist")));

// Catch-all: serve index.html for any non-API route (React Router support)
app.get(/^(?!\/api).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => console.log(`NACFE API running on http://localhost:${PORT}`));
