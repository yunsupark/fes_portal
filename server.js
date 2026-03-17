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
      `SELECT f.*, c.first_name, c.last_name, c.email
       FROM ffs_contact c
       JOIN ffs_fleet f ON c.fleet_id = f.fleet_id
       WHERE c.email = ? LIMIT 1`,
      [email]
    );
    const row = rows[0];
    if (!row) return res.status(401).json({ error: "Fleet not found for that email" });

    const token = jwt.sign(
      { fleet_id: row.fleet_id, fleet_name: row.fleet_name },
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
  const config = parseInt(req.query.config) || 1;
  try {
    const [rows] = await db.query(
      `SELECT a.adoption_year, t.tech_group, t.technology, t.tech_expl, a.adoption_percent
       FROM ffs_adoption a JOIN ffs_tech t ON a.tech_id = t.tech_id
       WHERE a.fleet_id = ? AND a.config = ?
       ORDER BY a.adoption_year, t.tech_group, t.technology`,
      [fleet_id, config]
    );

    // build categories map and year data
    const categories = {};
    const byYear = {};

    rows.forEach(r => {
      // categories: group -> array of { label, desc }
      if (!categories[r.tech_group]) categories[r.tech_group] = [];
      // avoid duplicates
      if (!categories[r.tech_group].some(t => t.label === r.technology)) {
        categories[r.tech_group].push({ label: r.technology, desc: r.tech_expl || '' });
      }

      if (!byYear[r.adoption_year]) byYear[r.adoption_year] = {};
      byYear[r.adoption_year][r.technology] = parseFloat(r.adoption_percent);
    });

    // Get distinct config numbers + cab_type directly from ffs_adoption
    const [cfgRows] = await db.query(
      `SELECT DISTINCT config, cab_type FROM ffs_adoption WHERE fleet_id = ? ORDER BY config`,
      [fleet_id]
    );
    const configsWithMeta = cfgRows.map(r => ({
      config:   r.config,
      cab_type: r.cab_type || null,
      label:    r.cab_type ? `Config ${r.config}, ${r.cab_type}` : `Config ${r.config}`,
    }));

    res.json({ categories, data: byYear, configs: configsWithMeta });
  } catch (err) {
    console.error("Error fetching techs:", err.message);
    res.status(500).json({ error: "Failed to fetch technology data" });
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
app.put("/api/fleet-details/:year", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
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
              grossed_out_perc, cubed_out_perc, ave_length_haul, empty_miles_perc)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             utliz_tractor_qty = VALUES(utliz_tractor_qty),
             utliz_trailer_qty = VALUES(utliz_trailer_qty),
             grossed_out_perc  = VALUES(grossed_out_perc),
             cubed_out_perc    = VALUES(cubed_out_perc),
             ave_length_haul   = VALUES(ave_length_haul),
             empty_miles_perc  = VALUES(empty_miles_perc)`,
          [fleet_id, year, row.application ?? null,
           row.tractors ?? null, row.trailers ?? null,
           row.grossed_out_perc ?? null, row.cubed_out_perc ?? null,
           row.ave_length_haul ?? null, row.empty_miles_perc ?? null]
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

/**
 * PUT /api/fuel/:year
 * Replaces all fuel rows for this fleet and year.
 * Body: { rows: [{ fuel_type, ifta_miles, ifta_fuel, nat_gas_dge }] }
 */
app.put("/api/fuel/:year", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
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
        `INSERT INTO ffs_mpg (fleet_id, mpg_year, fuel_type, ifta_miles, ifta_fuel, nat_gas_dge)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fleet_id, year,
         r.fuel_type   || null,
         r.ifta_miles  != null && r.ifta_miles  !== '' ? parseFloat(r.ifta_miles)  : null,
         isCng ? null : (r.volume != null && r.volume !== '' ? parseFloat(r.volume) : null),
         isCng ? (r.volume != null && r.volume !== '' ? parseFloat(r.volume) : null) : null]
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

/**
 * PUT /api/fleet-equip/:year
 * Replaces all equipment rows for this fleet and equip_year.
 * Body: { rows: [{ qty, cab_type, tractor_make, ... }] }
 */
app.put("/api/fleet-equip/:year", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
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
            axle_make, axle_model, axle_ratio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [fleet_id, year,
         r.qty               || null, r.cab_type          || null,
         r.tractor_make      || null, r.tractor_model     || null,
         r.engine_make       || null, r.engine_model      || null,
         r.engine_rating     || null,
         r.transmission_make  || null, r.transmission_model || null,
         r.axle_make         || null, r.axle_model        || null,
         r.axle_ratio != null && r.axle_ratio !== '' ? parseFloat(r.axle_ratio) : null]
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
