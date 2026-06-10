// server.js — NACFE Fleet Benchmarking API
// Requirements: npm install express mysql2 cors bcryptjs jsonwebtoken dotenv
// Usage: node server.js (or nodemon server.js for dev)

require("dotenv").config();
const express    = require("express");
const mysql      = require("mysql2/promise");
const cors       = require("cors");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const path       = require("path");
const crypto     = require("crypto");
const { Resend } = require("resend");

const app  = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const APP_URL    = (process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3001").replace(/\/$/, "");

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@nacfe.org";

app.use(cors({
  // Reflect the requesting origin for HTTPS and localhost.
  // Safe because all sensitive routes are protected by JWT (not cookies).
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // curl / server-to-server
    if (
      origin.startsWith('https://') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1')
    ) {
      return callback(null, origin);
    }
    callback(new Error('CORS: origin not allowed'));
  },
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
    await db.query(`
      INSERT IGNORE INTO ffs_settings (setting_key, setting_value) VALUES
        ('invite_email_template', '{first_name}, {inviter_name} has added you to {fleet_name}''s NACFE Fleet Efficiency Study portal. The portal is for entering {fleet_name}''s data and to view technology adoption and MPG benchmarking data.\n\nPortal: https://fes.nacfe.org\nUsername: {email}\nTemporary password: {temp_password}\n\nPlease log in and change your password.')
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
    await db.query(`
      CREATE TABLE IF NOT EXISTS ffs_interview_progress (
        fleet_id     INT NOT NULL PRIMARY KEY,
        progress_json MEDIUMTEXT,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    // Password auth columns / table
    const [[{ pw_col }]] = await db.query(
      `SELECT COUNT(*) AS pw_col FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ffs_contact' AND COLUMN_NAME = 'password_hash'`
    );
    if (!pw_col) {
      await db.query(`ALTER TABLE ffs_contact ADD COLUMN password_hash VARCHAR(255) NULL`);
      console.log("Added password_hash column to ffs_contact");
    }
    const [[{ ll_col }]] = await db.query(
      `SELECT COUNT(*) AS ll_col FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ffs_contact' AND COLUMN_NAME = 'last_login'`
    );
    if (!ll_col) {
      await db.query(`ALTER TABLE ffs_contact ADD COLUMN last_login DATETIME NULL`);
      console.log("Added last_login column to ffs_contact");
    }
    // Remove placeholder admin account if it exists
    await db.query(
      `DELETE FROM ffs_contact WHERE fleet_id = 0 AND LOWER(first_name) = 'admin' AND LOWER(last_name) = 'admin'`
    );
    // Add admin_role column for fleet_id=0 contacts
    const [[{ role_col }]] = await db.query(
      `SELECT COUNT(*) AS role_col FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ffs_contact' AND COLUMN_NAME = 'admin_role'`
    );
    if (!role_col) {
      await db.query(`ALTER TABLE ffs_contact ADD COLUMN admin_role VARCHAR(20) NULL DEFAULT 'user'`);
      console.log("Added admin_role column to ffs_contact");
    }
    // Ensure yunsu.park@nacfe.org is fleet_id=0 (NACFE admin), regardless of any prior fleet association
    await db.query(`
      UPDATE ffs_contact SET fleet_id = 0, admin_role = 'admin'
      WHERE LOWER(email) = 'yunsu.park@nacfe.org'
    `);
    // Seed known admins by name
    await db.query(`
      UPDATE ffs_contact SET admin_role = 'admin'
      WHERE fleet_id = 0 AND (
        (LOWER(first_name) = 'mike'  AND LOWER(last_name) = 'mchorse')  OR
        (LOWER(first_name) = 'bruce' AND LOWER(last_name) = 'stockton') OR
        (LOWER(first_name) = 'mike'  AND LOWER(last_name) = 'roeth')    OR
        (LOWER(first_name) = 'yunsu' AND LOWER(last_name) = 'park')
      )
    `);
    // Backfill ffs_submission for years that have data in BOTH ffs_adoption and ffs_mpg
    await db.query(`
      INSERT IGNORE INTO ffs_submission (fleet_id, survey_year)
      SELECT DISTINCT a.fleet_id, a.adoption_year AS survey_year
      FROM ffs_adoption a
      WHERE EXISTS (SELECT 1 FROM ffs_mpg m WHERE m.fleet_id = a.fleet_id AND m.mpg_year = a.adoption_year)
    `);
    // Add fleet_role column for fleet_id != 0 contacts
    const [[{ fleet_role_col }]] = await db.query(
      `SELECT COUNT(*) AS fleet_role_col FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ffs_contact' AND COLUMN_NAME = 'fleet_role'`
    );
    if (!fleet_role_col) {
      await db.query(`ALTER TABLE ffs_contact ADD COLUMN fleet_role VARCHAR(20) NULL DEFAULT 'fleet_user'`);
      // All existing fleet contacts become fleet_admin
      await db.query(`UPDATE ffs_contact SET fleet_role = 'fleet_admin' WHERE fleet_id != 0`);
      console.log("Added fleet_role column; promoted existing fleet contacts to fleet_admin");
    }
    await db.query(`
      CREATE TABLE IF NOT EXISTS ffs_password_reset (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
        token      VARCHAR(64) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used       TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token),
        INDEX idx_contact (contact_id)
      )
    `);
    // ── Multi-fleet support ──────────────────────────────────────────────────
    // Junction table: one contact can belong to multiple fleets.
    await db.query(`
      CREATE TABLE IF NOT EXISTS ffs_contact_fleet (
        contact_id INT NOT NULL,
        fleet_id   INT NOT NULL,
        fleet_role VARCHAR(20) NOT NULL DEFAULT 'fleet_user',
        PRIMARY KEY (contact_id, fleet_id)
      )
    `);
    // Seed from existing ffs_contact rows so existing contacts keep working.
    await db.query(`
      INSERT IGNORE INTO ffs_contact_fleet (contact_id, fleet_id, fleet_role)
      SELECT contact_id, fleet_id, COALESCE(fleet_role, 'fleet_user')
      FROM ffs_contact
      WHERE fleet_id != 0
    `);
    // Trailer types
    await db.query(`
      CREATE TABLE IF NOT EXISTS ffs_trailer_type (
        type_id    INT AUTO_INCREMENT PRIMARY KEY,
        type_name  VARCHAR(100) NOT NULL,
        multiplier DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
        sort_order INT NOT NULL DEFAULT 0,
        is_active  TINYINT NOT NULL DEFAULT 1
      )
    `);
    await db.query(`
      INSERT IGNORE INTO ffs_trailer_type (type_id, type_name, multiplier, sort_order) VALUES
        (1, 'Van/Refrigerated', 1.0000, 1),
        (2, 'Flatbed',          1.0000, 2),
        (3, 'Tanker',           1.0000, 3),
        (4, 'Double',           1.0000, 4),
        (5, 'B-train (Canada)', 1.0000, 5)
    `);
    const [[{ tt_col }]] = await db.query(
      `SELECT COUNT(*) AS tt_col FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ffs_mpg' AND COLUMN_NAME = 'trailer_type_id'`
    );
    if (!tt_col) {
      await db.query(`ALTER TABLE ffs_mpg ADD COLUMN trailer_type_id INT NULL`);
      console.log("Added trailer_type_id column to ffs_mpg");
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
  const { email, password } = req.body;
  if (!email)    return res.status(400).json({ error: "email required" });
  if (!password) return res.status(400).json({ error: "password required" });

  try {
    // Step 1: authenticate the contact (no fleet join needed here)
    const [[contact]] = await db.query(
      `SELECT contact_id, fleet_id, first_name, last_name, email, password_hash,
              admin_role, fleet_role, COALESCE(portal_access, 0) AS portal_access
       FROM ffs_contact WHERE email = ? LIMIT 1`,
      [email]
    );
    if (!contact) return res.status(401).json({ error: "Invalid email or password" });
    if (!contact.password_hash) return res.status(401).json({ error: "no_password" });
    const match = await bcrypt.compare(password, contact.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid email or password" });

    await db.query(`UPDATE ffs_contact SET last_login = NOW() WHERE contact_id = ?`, [contact.contact_id]);

    // Step 2: NACFE admin path (fleet_id = 0) — issue token immediately
    if (contact.fleet_id === 0) {
      const token = jwt.sign(
        { fleet_id: 0, fleet_name: 'NACFE', contact_id: contact.contact_id,
          email: contact.email, first_name: contact.first_name || '', last_name: contact.last_name || '',
          admin_role: contact.admin_role || 'user', fleet_role: null },
        JWT_SECRET, { expiresIn: "30d" }
      );
      return res.json({
        token,
        fleet: { id: 0, name: 'NACFE', contact: `${contact.first_name||''} ${contact.last_name||''}`.trim(), email: contact.email, hq: null },
      });
    }

    // Step 3: Fleet contact — check portal access
    if (!contact.portal_access) {
      return res.status(403).json({ error: "Access to this portal is not yet available for your fleet." });
    }

    // Step 4: Query ffs_contact_fleet for all fleet associations
    const [cfRows] = await db.query(
      `SELECT cf.fleet_id, f.fleet_name, f.fleet_city, f.fleet_state, cf.fleet_role
       FROM ffs_contact_fleet cf
       JOIN ffs_fleet f ON cf.fleet_id = f.fleet_id
       WHERE cf.contact_id = ?
       ORDER BY f.fleet_name`,
      [contact.contact_id]
    );

    // Fall back to legacy ffs_contact.fleet_id if junction table has no entries yet
    let fleets = cfRows;
    if (fleets.length === 0 && contact.fleet_id) {
      const [[f]] = await db.query(
        `SELECT fleet_id, fleet_name, fleet_city, fleet_state FROM ffs_fleet WHERE fleet_id = ?`,
        [contact.fleet_id]
      );
      if (f) fleets = [{ ...f, fleet_role: contact.fleet_role || 'fleet_user' }];
    }
    if (fleets.length === 0) {
      return res.status(403).json({ error: "No fleet access found for this account." });
    }

    const makeFleetToken = (fleet) => jwt.sign(
      { fleet_id: fleet.fleet_id, fleet_name: fleet.fleet_name, contact_id: contact.contact_id,
        email: contact.email, first_name: contact.first_name || '', last_name: contact.last_name || '',
        admin_role: null, fleet_role: fleet.fleet_role || 'fleet_user' },
      JWT_SECRET, { expiresIn: "30d" }
    );
    const fleetObj = (fleet) => ({
      id:      fleet.fleet_id,
      name:    fleet.fleet_name,
      contact: `${contact.first_name||''} ${contact.last_name||''}`.trim(),
      email:   contact.email,
      hq:      fleet.fleet_city ? `${fleet.fleet_city}, ${fleet.fleet_state}` : null,
    });

    // Single fleet — issue JWT directly (same as before)
    if (fleets.length === 1) {
      return res.json({ token: makeFleetToken(fleets[0]), fleet: fleetObj(fleets[0]) });
    }

    // Multiple fleets — return a short-lived interim token and the fleet list
    const interimToken = jwt.sign(
      { contact_id: contact.contact_id, fleet_selection: true },
      JWT_SECRET, { expiresIn: "5m" }
    );
    return res.json({
      needs_fleet_selection: true,
      interim_token: interimToken,
      fleets: fleets.map(f => ({
        fleet_id: f.fleet_id, fleet_name: f.fleet_name,
        fleet_city: f.fleet_city || null, fleet_state: f.fleet_state || null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * POST /api/auth/select-fleet
 * Body: { interim_token, fleet_id }
 * Exchanges a multi-fleet interim token + a chosen fleet_id for a full JWT.
 */
app.post("/api/auth/select-fleet", async (req, res) => {
  const { interim_token, fleet_id } = req.body;
  if (!interim_token || !fleet_id) return res.status(400).json({ error: "interim_token and fleet_id required" });
  try {
    let payload;
    try { payload = jwt.verify(interim_token, JWT_SECRET); }
    catch { return res.status(401).json({ error: "Invalid or expired selection token. Please log in again." }); }
    if (!payload.fleet_selection) return res.status(401).json({ error: "Invalid token type" });

    const fid = parseInt(fleet_id);
    const [[cfRow]] = await db.query(
      `SELECT cf.fleet_role, f.fleet_name, f.fleet_city, f.fleet_state
       FROM ffs_contact_fleet cf
       JOIN ffs_fleet f ON cf.fleet_id = f.fleet_id
       WHERE cf.contact_id = ? AND cf.fleet_id = ?`,
      [payload.contact_id, fid]
    );
    if (!cfRow) return res.status(403).json({ error: "You do not have access to that fleet." });

    const [[contact]] = await db.query(
      `SELECT contact_id, first_name, last_name, email FROM ffs_contact WHERE contact_id = ?`,
      [payload.contact_id]
    );
    const token = jwt.sign(
      { fleet_id: fid, fleet_name: cfRow.fleet_name, contact_id: contact.contact_id,
        email: contact.email, first_name: contact.first_name || '', last_name: contact.last_name || '',
        admin_role: null, fleet_role: cfRow.fleet_role || 'fleet_user' },
      JWT_SECRET, { expiresIn: "30d" }
    );
    res.json({
      token,
      fleet: {
        id: fid, name: cfRow.fleet_name,
        contact: `${contact.first_name||''} ${contact.last_name||''}`.trim(),
        email: contact.email,
        hq: cfRow.fleet_city ? `${cfRow.fleet_city}, ${cfRow.fleet_state}` : null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Sends a password reset link. Always returns 200 to prevent email enumeration.
 */
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });
  try {
    const [[contact]] = await db.query(
      `SELECT contact_id, first_name FROM ffs_contact WHERE email = ? LIMIT 1`,
      [email]
    );
    if (contact) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      await db.query(
        `INSERT INTO ffs_password_reset (contact_id, token, expires_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at), used = 0`,
        [contact.contact_id, token, expiresAt]
      );
      const resetUrl = `${APP_URL}?reset=${token}`;
      const { error: sendErr } = await resend.emails.send({
        from: `Fleet Efficiency Study <${EMAIL_FROM}>`,
        to: email,
        subject: "Set your Fleet Efficiency Study password",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#1c3660">Fleet Efficiency Study</h2>
            <p>Hi ${contact.first_name || "there"},</p>
            <p>Click the button below to set your password. This link expires in <strong>2 hours</strong>.</p>
            <p style="margin:28px 0">
              <a href="${resetUrl}" style="background:#1c3660;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
                Set my password
              </a>
            </p>
            <p style="color:#6B7280;font-size:13px">
              If you didn't request this, you can ignore this email.<br>
              Or copy this link: ${resetUrl}
            </p>
          </div>`,
      });
      if (sendErr) console.error("[Resend] send error:", sendErr);
    }
  } catch (err) {
    console.error("forgot-password error:", err);
  }
  // Always return success
  res.json({ ok: true });
});

/**
 * POST /api/admin/test-email
 * Admin only — sends a test email and returns any SMTP error for debugging.
 */
app.post("/api/admin/test-email", requireAuth, requireAdminRole, async (req, res) => {
  const to = req.body.to || process.env.SMTP_USER;
  try {
    const { data, error } = await resend.emails.send({
      from: `Fleet Efficiency Study <${EMAIL_FROM}>`,
      to,
      subject: "Email test",
      text: "If you received this, Resend is working.",
    });
    if (error) return res.status(500).json({ ok: false, error });
    res.json({ ok: true, message: `Test email sent to ${to}`, id: data?.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 * Validates the reset token and sets a new password.
 */
app.post("/api/auth/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "token and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  try {
    const [[row]] = await db.query(
      `SELECT r.contact_id, r.expires_at, r.used
       FROM ffs_password_reset r
       WHERE r.token = ? LIMIT 1`,
      [token]
    );
    if (!row || row.used || new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
    }
    const hash = await bcrypt.hash(password, 12);
    await db.query(`UPDATE ffs_contact SET password_hash = ? WHERE contact_id = ?`, [hash, row.contact_id]);
    await db.query(`UPDATE ffs_password_reset SET used = 1 WHERE token = ?`, [token]);
    res.json({ ok: true });
  } catch (err) {
    console.error("reset-password error:", err);
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

app.get("/api/fleet/invite-template", requireAuth, async (req, res) => {
  try {
    const [[row]] = await db.query(`SELECT setting_value FROM ffs_settings WHERE setting_key = 'invite_email_template'`);
    res.json({ template: row?.setting_value || '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/fleet/contacts", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  if (fleet_id === 0) return res.status(403).json({ error: "Not a fleet user" });
  try {
    const [rows] = await db.query(
      `SELECT contact_id, first_name, last_name, email, phone, COALESCE(active,1) AS active, portal_access, last_login,
              COALESCE(fleet_role, 'fleet_user') AS fleet_role
       FROM ffs_contact WHERE fleet_id = ? ORDER BY last_name, first_name`,
      [fleet_id]
    );
    res.json({ contacts: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.patch("/api/fleet/contacts/:id/role", requireAuth, async (req, res) => {
  const { fleet_id, fleet_role } = req.user;
  if (fleet_id === 0 || fleet_role !== 'fleet_admin') return res.status(403).json({ error: "Fleet admin access required" });
  const contactId = parseInt(req.params.id);
  const { role } = req.body;
  if (!['fleet_admin', 'fleet_user'].includes(role)) return res.status(400).json({ error: "Invalid role" });
  try {
    // Verify contact belongs to this fleet
    const [[contact]] = await db.query(
      `SELECT fleet_role FROM ffs_contact WHERE contact_id = ? AND fleet_id = ?`, [contactId, fleet_id]
    );
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    if (role === 'fleet_user') {
      const [[{ admin_count }]] = await db.query(
        `SELECT COUNT(*) AS admin_count FROM ffs_contact WHERE fleet_id = ? AND fleet_role = 'fleet_admin' AND contact_id != ?`,
        [fleet_id, contactId]
      );
      if (admin_count === 0) return res.status(400).json({ error: "Cannot remove the last fleet admin" });
    }
    await db.query(`UPDATE ffs_contact SET fleet_role = ? WHERE contact_id = ?`, [role, contactId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/api/fleet/contacts/:id", requireAuth, async (req, res) => {
  const { fleet_id, fleet_role } = req.user;
  if (fleet_id === 0 || fleet_role !== 'fleet_admin') return res.status(403).json({ error: "Fleet admin access required" });
  const contactId = parseInt(req.params.id);
  try {
    const [[contact]] = await db.query(
      `SELECT fleet_role FROM ffs_contact WHERE contact_id = ? AND fleet_id = ?`, [contactId, fleet_id]
    );
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    if (contact.fleet_role === 'fleet_admin') {
      const [[{ admin_count }]] = await db.query(
        `SELECT COUNT(*) AS admin_count FROM ffs_contact WHERE fleet_id = ? AND fleet_role = 'fleet_admin' AND contact_id != ?`,
        [fleet_id, contactId]
      );
      if (admin_count === 0) return res.status(400).json({ error: "Cannot remove the last fleet admin" });
    }
    await db.query(`DELETE FROM ffs_contact WHERE contact_id = ? AND fleet_id = ?`, [contactId, fleet_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/fleet/invite", requireAuth, async (req, res) => {
  const { fleet_id, contact_id, fleet_role } = req.user;
  if (fleet_id === 0) return res.status(403).json({ error: "Not a fleet user" });
  if (fleet_role !== 'fleet_admin') return res.status(403).json({ error: "Fleet admin access required" });
  const { users, email_body } = req.body;
  if (!Array.isArray(users) || users.length === 0) return res.status(400).json({ error: "users array required" });

  try {
    const [[fleet]] = await db.query(`SELECT fleet_name FROM ffs_fleet WHERE fleet_id = ?`, [fleet_id]);
    const [[inviter]] = await db.query(`SELECT first_name, last_name FROM ffs_contact WHERE contact_id = ?`, [contact_id]);
    const inviterName = inviter ? [inviter.first_name, inviter.last_name].filter(Boolean).join(' ') : 'A colleague';

    const [[tmplRow]] = await db.query(`SELECT setting_value FROM ffs_settings WHERE setting_key = 'invite_email_template'`);
    const defaultTemplate = tmplRow?.setting_value || '{first_name}, {inviter_name} has added you to {fleet_name}\'s NACFE Fleet Efficiency Study portal.\n\nPortal: https://fes.nacfe.org\nUsername: {email}\nTemporary password: {temp_password}\n\nPlease log in and change your password.';

    const results = [];
    for (const u of users) {
      if (!u.email) { results.push({ email: u.email, ok: false, error: 'email required' }); continue; }
      try {
        const [existing] = await db.query(`SELECT contact_id FROM ffs_contact WHERE email = ?`, [u.email]);
        if (existing.length) { results.push({ email: u.email, ok: false, error: 'Email already exists' }); continue; }

        const tempPassword = crypto.randomBytes(5).toString('hex');
        const hash = await bcrypt.hash(tempPassword, 10);
        const role = ['fleet_admin', 'fleet_user'].includes(u.fleet_role) ? u.fleet_role : 'fleet_user';

        await db.query(
          `INSERT INTO ffs_contact (fleet_id, first_name, last_name, email, phone, active, portal_access, password_hash, fleet_role)
           VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`,
          [fleet_id, u.first_name || '', u.last_name || '', u.email, u.phone || '', hash, role]
        );

        // Use per-send email_body if provided, otherwise default template
        const template = email_body || defaultTemplate;
        const body = template
          .replace(/{first_name}/g, u.first_name || 'there')
          .replace(/{inviter_name}/g, inviterName)
          .replace(/{fleet_name}/g, fleet.fleet_name)
          .replace(/{email}/g, u.email)
          .replace(/{temp_password}/g, tempPassword);

        const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:#1c3660;padding:20px 32px">
  <p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold">Fleet Efficiency Study</p>
</td></tr>
<tr><td style="padding:32px">
  <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.6">${body.replace(/\n/g, '</p><p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.6">')}</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
  <p style="margin:0;font-size:11px;color:#9ca3af">NACFE · 965 Lakeshore Drive, Golden, CO 80401</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

        const { error: sendErr } = await resend.emails.send({
          from: `Fleet Efficiency Study <${EMAIL_FROM}>`,
          reply_to: EMAIL_FROM,
          to: u.email,
          subject: `Portal access: ${fleet.fleet_name} Fleet Efficiency Study`,
          text: body,
          html: htmlBody,
        });

        if (sendErr) console.error('Email send error:', sendErr);
        results.push({ email: u.email, ok: true });
      } catch (e) {
        console.error(e);
        results.push({ email: u.email, ok: false, error: e.message });
      }
    }
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.put("/api/user/password", requireAuth, async (req, res) => {
  const { contact_id } = req.user;
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: "current_password and new_password required" });
  if (new_password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  try {
    const [[row]] = await db.query(`SELECT password_hash FROM ffs_contact WHERE contact_id = ?`, [contact_id]);
    if (!row?.password_hash) return res.status(400).json({ error: "No password set" });
    const match = await bcrypt.compare(current_password, row.password_hash);
    if (!match) return res.status(401).json({ error: "Current password is incorrect" });
    const hash = await bcrypt.hash(new_password, 10);
    await db.query(`UPDATE ffs_contact SET password_hash = ? WHERE contact_id = ?`, [hash, contact_id]);
    res.json({ ok: true });
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
    for (let yr = yrFrom; yr <= yrTo; yr++) editableYears.push(yr);

    // Query status for all display years (editable range + any submitted years outside it)
    const years = [...new Set([...editableYears, ...submittedYears])].sort((a, b) => a - b);
    if (!years.length) years.push(new Date().getFullYear());

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

    // Count all currently-active techs per cab type (no active_to).
    // active_from is intentionally ignored so the total matches the list shown in the UI.
    const [[sleeperTotal]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM ffs_tech
       WHERE (applies_sleeper = 1 OR applies_sleeper IS NULL) AND active_to IS NULL`
    );
    const [[dayCabTotal]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM ffs_tech
       WHERE (applies_daycab = 1 OR applies_daycab IS NULL) AND active_to IS NULL`
    );
    const techTotals = {};
    for (const yr of years) {
      techTotals[yr] = { 'Sleeper': Number(sleeperTotal.cnt), 'Day Cab': Number(dayCabTotal.cnt) };
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
 * GET /api/admin/fhwa-mpg
 * Returns all ffs_mpg rows for the FHWA reference fleet (fleet_id=45),
 * sorted newest first.
 */
app.get("/api/admin/fhwa-mpg", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.mpg_id, m.mpg_year, COALESCE(m.mpg_quarter,'') AS mpg_quarter,
              m.ifta_miles, m.ifta_fuel, COALESCE(m.multiplier,1) AS multiplier,
              d.avg_diesel_price
       FROM ffs_mpg m
       LEFT JOIN ffs_mpg d
         ON d.fleet_id = 0 AND d.mpg_year = m.mpg_year AND COALESCE(d.mpg_quarter, '') = ''
       WHERE m.fleet_id = 45
       ORDER BY m.mpg_year DESC, m.mpg_quarter ASC, m.mpg_id DESC`
    );
    res.json({ rows: rows.map(r => ({
      mpg_id:            r.mpg_id,
      mpg_year:          r.mpg_year,
      mpg_quarter:       r.mpg_quarter,
      ifta_miles:        r.ifta_miles        != null ? parseFloat(r.ifta_miles)        : null,
      ifta_fuel:         r.ifta_fuel         != null ? parseFloat(r.ifta_fuel)         : null,
      multiplier:        parseFloat(r.multiplier),
      avg_diesel_price:  r.avg_diesel_price  != null ? parseFloat(r.avg_diesel_price)  : null,
    })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reference data" });
  }
});

/**
 * POST /api/admin/fhwa-mpg
 * Inserts a new FHWA IFTA row.
 * Body: { mpg_year, mpg_quarter, ifta_miles, ifta_fuel, multiplier }
 */
app.post("/api/admin/fhwa-mpg", requireAuth, requireAdminRole, async (req, res) => {
  const { contact_id } = req.user;
  const { mpg_year, ifta_miles, ifta_fuel, avg_diesel_price } = req.body;
  if (!mpg_year) return res.status(400).json({ error: "mpg_year required" });
  try {
    // Miles + fuel → fleet_id = 45
    await db.query(
      `INSERT INTO ffs_mpg (fleet_id, mpg_year, mpg_quarter, ifta_miles, ifta_fuel, multiplier, fuel_type, contact_id)
       VALUES (45, ?, '', ?, ?, 1, 'Diesel', ?)`,
      [
        parseInt(mpg_year),
        ifta_miles != null ? parseFloat(ifta_miles) : null,
        ifta_fuel  != null ? parseFloat(ifta_fuel)  : null,
        contact_id ?? null,
      ]
    );
    // Avg diesel price → fleet_id = 0
    if (avg_diesel_price != null && avg_diesel_price !== '') {
      const [[existing]] = await db.query(
        `SELECT mpg_id FROM ffs_mpg WHERE fleet_id = 0 AND mpg_year = ? AND COALESCE(mpg_quarter, '') = ''`,
        [parseInt(mpg_year)]
      );
      if (existing) {
        await db.query(
          `UPDATE ffs_mpg SET avg_diesel_price = ?, contact_id = ? WHERE mpg_id = ?`,
          [parseFloat(avg_diesel_price), contact_id ?? null, existing.mpg_id]
        );
      } else {
        await db.query(
          `INSERT INTO ffs_mpg (fleet_id, mpg_year, mpg_quarter, avg_diesel_price, contact_id)
           VALUES (0, ?, '', ?, ?)`,
          [parseInt(mpg_year), parseFloat(avg_diesel_price), contact_id ?? null]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to insert reference row" });
  }
});

/**
 * PUT /api/admin/fhwa-mpg/:id
 * Updates an existing FHWA IFTA row by mpg_id.
 * Body: { mpg_year, mpg_quarter, ifta_miles, ifta_fuel, multiplier }
 */
app.put("/api/admin/fhwa-mpg/:id", requireAuth, requireAdminRole, async (req, res) => {
  const { contact_id } = req.user;
  const id = parseInt(req.params.id);
  const { mpg_year, ifta_miles, ifta_fuel, avg_diesel_price } = req.body;
  if (!mpg_year) return res.status(400).json({ error: "mpg_year required" });
  try {
    // Miles + fuel → fleet_id = 45
    await db.query(
      `UPDATE ffs_mpg SET mpg_year=?, mpg_quarter='', ifta_miles=?, ifta_fuel=?,
                          multiplier=1, fuel_type='Diesel', contact_id=?
       WHERE mpg_id = ? AND fleet_id = 45`,
      [
        parseInt(mpg_year),
        ifta_miles != null ? parseFloat(ifta_miles) : null,
        ifta_fuel  != null ? parseFloat(ifta_fuel)  : null,
        contact_id ?? null,
        id,
      ]
    );
    // Avg diesel price → fleet_id = 0 (upsert by year)
    if (avg_diesel_price != null && avg_diesel_price !== '') {
      const [[existing]] = await db.query(
        `SELECT mpg_id FROM ffs_mpg WHERE fleet_id = 0 AND mpg_year = ? AND COALESCE(mpg_quarter, '') = ''`,
        [parseInt(mpg_year)]
      );
      if (existing) {
        await db.query(
          `UPDATE ffs_mpg SET avg_diesel_price = ?, contact_id = ? WHERE mpg_id = ?`,
          [parseFloat(avg_diesel_price), contact_id ?? null, existing.mpg_id]
        );
      } else {
        await db.query(
          `INSERT INTO ffs_mpg (fleet_id, mpg_year, mpg_quarter, avg_diesel_price, contact_id)
           VALUES (0, ?, '', ?, ?)`,
          [parseInt(mpg_year), parseFloat(avg_diesel_price), contact_id ?? null]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update reference row" });
  }
});

/**
 * DELETE /api/admin/fhwa-mpg/:id
 * Deletes a FHWA IFTA row by mpg_id.
 */
app.delete("/api/admin/fhwa-mpg/:id", requireAuth, requireAdminRole, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await db.query("DELETE FROM ffs_mpg WHERE mpg_id = ? AND fleet_id = 45", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete FHWA row" });
  }
});

// ─── Trailer Types ───────────────────────────────────────────────────────────

app.get("/api/trailer-types", requireAuth, async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT type_id, type_name, multiplier, sort_order FROM ffs_trailer_type WHERE is_active = 1 ORDER BY sort_order`
    );
    res.json(rows.map(r => ({ ...r, multiplier: parseFloat(r.multiplier) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/admin/trailer-types", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM ffs_trailer_type ORDER BY sort_order`);
    res.json(rows.map(r => ({ ...r, multiplier: parseFloat(r.multiplier) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/admin/trailer-types", requireAuth, requireAdminRole, async (req, res) => {
  const { type_name, multiplier, sort_order } = req.body;
  if (!type_name) return res.status(400).json({ error: "type_name required" });
  try {
    const [result] = await db.query(
      `INSERT INTO ffs_trailer_type (type_name, multiplier, sort_order) VALUES (?, ?, ?)`,
      [type_name.trim(), parseFloat(multiplier) || 1.0, parseInt(sort_order) || 0]
    );
    res.json({ type_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create trailer type" });
  }
});

app.put("/api/admin/trailer-types/:id", requireAuth, requireAdminRole, async (req, res) => {
  const id = parseInt(req.params.id);
  const { type_name, multiplier, sort_order, is_active } = req.body;
  try {
    await db.query(
      `UPDATE ffs_trailer_type SET type_name=?, multiplier=?, sort_order=?, is_active=? WHERE type_id=?`,
      [type_name, parseFloat(multiplier) || 1.0, parseInt(sort_order) || 0, is_active ? 1 : 0, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update trailer type" });
  }
});

app.delete("/api/admin/trailer-types/:id", requireAuth, requireAdminRole, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await db.query(`UPDATE ffs_trailer_type SET is_active = 0 WHERE type_id = ?`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete trailer type" });
  }
});

/**
 * POST /api/admin/reset-example-fleet
 * Deletes all input data for the example fleet (fleet_id from ffs_settings).
 */
app.post("/api/admin/reset-example-fleet", requireAuth, requireAdminRole, async (_req, res) => {
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
              ifta_miles, ifta_fuel, nat_gas_dge, trailer_type_id
       FROM ffs_mpg
       WHERE fleet_id = ?
       ORDER BY mpg_year DESC, mpg_id`,
      [fleet_id]
    );
    res.json(rows.map(r => ({
      mpg_id:          r.mpg_id,
      year:            r.year,
      fuel_type:       r.fuel_type       || '',
      ifta_miles:      r.ifta_miles      != null ? parseFloat(r.ifta_miles)      : null,
      ifta_fuel:       r.ifta_fuel       != null ? parseFloat(r.ifta_fuel)       : null,
      nat_gas_dge:     r.nat_gas_dge     != null ? parseFloat(r.nat_gas_dge)     : null,
      trailer_type_id: r.trailer_type_id != null ? parseInt(r.trailer_type_id)   : null,
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

  const { rows, trailer_type_id } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows array required" });

  // Look up multiplier for the selected trailer type
  let multiplier = 1.0;
  const ttId = trailer_type_id ? parseInt(trailer_type_id) : null;
  if (ttId) {
    const [[tt]] = await db.query(`SELECT multiplier FROM ffs_trailer_type WHERE type_id = ?`, [ttId]);
    if (tt) multiplier = parseFloat(tt.multiplier);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM ffs_mpg WHERE fleet_id = ? AND mpg_year = ?", [fleet_id, year]);
    for (const r of rows) {
      const isCng = ['CNG', 'LNG'].includes(r.fuel_type);
      await conn.query(
        `INSERT INTO ffs_mpg (fleet_id, mpg_year, fuel_type, ifta_miles, ifta_fuel, nat_gas_dge, multiplier, trailer_type_id, contact_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [fleet_id, year,
         r.fuel_type   || null,
         r.ifta_miles  != null && r.ifta_miles  !== '' ? parseFloat(r.ifta_miles)  : null,
         isCng ? null : (r.volume != null && r.volume !== '' ? parseFloat(r.volume) : null),
         isCng ? (r.volume != null && r.volume !== '' ? parseFloat(r.volume) : null) : null,
         multiplier,
         ttId,
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

/**
 * GET /api/fuel/benchmarks
 * Returns average MPG per fuel type across all other fleets (excludes current fleet).
 */
app.get("/api/fuel/benchmarks", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    const [rows] = await db.query(
      `SELECT fuel_type,
              AVG(mpg) AS avg_mpg,
              COUNT(*) AS fleet_count
       FROM (
         SELECT fleet_id, fuel_type,
                SUM(ifta_miles) / NULLIF(SUM(ifta_fuel), 0) AS mpg
         FROM ffs_mpg
         WHERE fleet_id != ?
           AND ifta_fuel > 0 AND ifta_miles > 0
           AND fuel_type IN ('Diesel','Biodiesel','CNG','LNG')
         GROUP BY fleet_id, mpg_year, fuel_type
         HAVING mpg > 0.5 AND mpg < 50
       ) sub
       GROUP BY fuel_type`,
      [fleet_id]
    );
    const result = {};
    for (const r of rows) {
      result[r.fuel_type] = { avg_mpg: parseFloat(r.avg_mpg), fleet_count: Number(r.fleet_count) };
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/interview/progress — load saved interview progress for this fleet
 */
app.get("/api/interview/progress", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    const [[row]] = await db.query(
      `SELECT progress_json FROM ffs_interview_progress WHERE fleet_id = ?`, [fleet_id]
    );
    if (!row || !row.progress_json) return res.json({ progress: null });
    res.json({ progress: JSON.parse(row.progress_json) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * PUT /api/interview/progress — save (upsert) interview progress for this fleet
 */
app.put("/api/interview/progress", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  const { progress } = req.body;
  try {
    if (progress === null) {
      await db.query(`DELETE FROM ffs_interview_progress WHERE fleet_id = ?`, [fleet_id]);
    } else {
      await db.query(
        `INSERT INTO ffs_interview_progress (fleet_id, progress_json) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE progress_json = VALUES(progress_json)`,
        [fleet_id, JSON.stringify(progress)]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
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

// Requires fleet_id=0 AND admin_role='admin'
function requireAdminRole(req, res, next) {
  if (req.user?.fleet_id !== 0) return res.status(403).json({ error: "Admin access required" });
  if (req.user?.admin_role !== 'admin') return res.status(403).json({ error: "Admin role required" });
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
    // Use junction table so a contact that belongs to multiple fleets
    // appears under each fleet they are associated with.
    const [contactRows] = await db.query(
      `SELECT c.contact_id, cf.fleet_id, c.first_name, c.last_name, c.email, c.phone,
              COALESCE(c.active, 1) AS active,
              COALESCE(c.portal_access, 0) AS portal_access,
              c.last_login,
              COALESCE(cf.fleet_role, 'fleet_user') AS fleet_role
       FROM ffs_contact_fleet cf
       JOIN ffs_contact c ON cf.contact_id = c.contact_id
       WHERE cf.fleet_id NOT IN (0, 45, 46)
       ORDER BY cf.fleet_id, c.last_name, c.first_name`
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
app.post("/api/admin/fleets", requireAuth, requireAdminRole, async (req, res) => {
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
app.put("/api/admin/fleets/:id", requireAuth, requireAdminRole, async (req, res) => {
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
app.post("/api/admin/contacts", requireAuth, requireAdminRole, async (req, res) => {
  const { fleet_id, first_name, last_name, email, phone, fleet_role } = req.body;
  if (!fleet_id || !email) return res.status(400).json({ error: "fleet_id and email required" });
  const resolvedRole = parseInt(fleet_id) !== 0 && ['fleet_admin', 'fleet_user'].includes(fleet_role) ? fleet_role : null;
  try {
    const [result] = await db.query(
      `INSERT INTO ffs_contact (fleet_id, first_name, last_name, email, phone, active, portal_access, fleet_role) VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
      [fleet_id, first_name || null, last_name || null, email, phone || null, resolvedRole]
    );
    const newId = result.insertId;
    // Also insert into junction table so multi-fleet logic works immediately
    if (parseInt(fleet_id) !== 0) {
      await db.query(
        `INSERT IGNORE INTO ffs_contact_fleet (contact_id, fleet_id, fleet_role) VALUES (?, ?, ?)`,
        [newId, fleet_id, resolvedRole || 'fleet_user']
      );
    }
    res.json({ ok: true, contact_id: newId });
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
app.put("/api/admin/contacts/:id", requireAuth, requireAdminRole, async (req, res) => {
  const id = parseInt(req.params.id);
  const { first_name, last_name, email, phone, active, portal_access, fleet_role } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });
  try {
    // If fleet_role supplied, validate and enforce at-least-one-fleet_admin
    if (fleet_role !== undefined) {
      if (!['fleet_admin', 'fleet_user'].includes(fleet_role)) return res.status(400).json({ error: "Invalid fleet_role" });
      if (fleet_role === 'fleet_user') {
        const [[{ fleet_id_row }]] = await db.query(`SELECT fleet_id AS fleet_id_row FROM ffs_contact WHERE contact_id = ?`, [id]);
        const [[{ admin_count }]] = await db.query(
          `SELECT COUNT(*) AS admin_count FROM ffs_contact WHERE fleet_id = ? AND fleet_role = 'fleet_admin' AND contact_id != ?`,
          [fleet_id_row, id]
        );
        if (admin_count === 0) return res.status(400).json({ error: "Cannot remove the last fleet admin" });
      }
      await db.query(`UPDATE ffs_contact SET fleet_role=? WHERE contact_id=?`, [fleet_role, id]);
    }
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
 * PATCH /api/admin/contacts/:id/fleet-role
 * Lets NACFE admins change the fleet_role of a fleet contact inline.
 */
app.patch("/api/admin/contacts/:id/fleet-role", requireAuth, requireAdminRole, async (req, res) => {
  const id = parseInt(req.params.id);
  const { fleet_role, fleet_id } = req.body;
  if (!['fleet_admin', 'fleet_user'].includes(fleet_role)) return res.status(400).json({ error: "Invalid fleet_role" });
  try {
    const fid = fleet_id ? parseInt(fleet_id) : null;
    if (fleet_role === 'fleet_user' && fid) {
      // Enforce at-least-one-admin per fleet using the junction table
      const [[{ admin_count }]] = await db.query(
        `SELECT COUNT(*) AS admin_count FROM ffs_contact_fleet
         WHERE fleet_id = ? AND fleet_role = 'fleet_admin' AND contact_id != ?`,
        [fid, id]
      );
      if (admin_count === 0) return res.status(400).json({ error: "Cannot remove the last fleet admin" });
    }
    // Update junction table (authoritative for login)
    if (fid) {
      await db.query(
        `UPDATE ffs_contact_fleet SET fleet_role = ? WHERE contact_id = ? AND fleet_id = ?`,
        [fleet_role, id, fid]
      );
    }
    // Keep ffs_contact.fleet_role in sync (backward compat)
    await db.query(`UPDATE ffs_contact SET fleet_role = ? WHERE contact_id = ?`, [fleet_role, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * GET /api/admin/contacts/:id/fleets
 * Returns all fleet associations for a contact (for the edit-contact modal).
 */
app.get("/api/admin/contacts/:id/fleets", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const [rows] = await db.query(
      `SELECT cf.fleet_id, f.fleet_name, f.fleet_city, f.fleet_state, cf.fleet_role
       FROM ffs_contact_fleet cf
       JOIN ffs_fleet f ON cf.fleet_id = f.fleet_id
       WHERE cf.contact_id = ?
       ORDER BY f.fleet_name`, [id]
    );
    res.json({ fleets: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * POST /api/admin/contacts/:id/fleets
 * Adds (or updates the role for) a fleet association for a contact.
 * Body: { fleet_id, fleet_role }
 */
app.post("/api/admin/contacts/:id/fleets", requireAuth, requireAdminRole, async (req, res) => {
  const id = parseInt(req.params.id);
  const { fleet_id, fleet_role } = req.body;
  if (!fleet_id) return res.status(400).json({ error: "fleet_id required" });
  const role = ['fleet_admin', 'fleet_user'].includes(fleet_role) ? fleet_role : 'fleet_user';
  try {
    await db.query(
      `INSERT INTO ffs_contact_fleet (contact_id, fleet_id, fleet_role) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE fleet_role = VALUES(fleet_role)`,
      [id, fleet_id, role]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add fleet association" });
  }
});

/**
 * DELETE /api/admin/contacts/:id/fleets/:fleet_id
 * Removes a fleet association for a contact.
 */
app.delete("/api/admin/contacts/:id/fleets/:fleet_id", requireAuth, requireAdminRole, async (req, res) => {
  const contactId = parseInt(req.params.id);
  const fleetId   = parseInt(req.params.fleet_id);
  try {
    await db.query(
      `DELETE FROM ffs_contact_fleet WHERE contact_id = ? AND fleet_id = ?`,
      [contactId, fleetId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove fleet association" });
  }
});

/**
 * PATCH /api/admin/contacts/:id/access
 * Toggles portal_access for a contact. Body: { portal_access: bool }
 */
app.patch("/api/admin/contacts/:id/access", requireAuth, requireAdminRole, async (req, res) => {
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
 * GET /api/admin/admin-contacts
 * Returns all contacts with fleet_id = 0 (admins), including last_login.
 */
app.get("/api/admin/admin-contacts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT contact_id, first_name, last_name, email, phone,
              COALESCE(active, 1) AS active, last_login,
              COALESCE(admin_role, 'user') AS admin_role
       FROM ffs_contact
       WHERE fleet_id = 0
       ORDER BY last_name, first_name`
    );
    res.json({ contacts: rows.map(c => ({ ...c, active: Number(c.active) })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * PATCH /api/admin/admin-contacts/:id/role
 * Changes the admin_role of a fleet_id=0 contact.
 * Requires admin role. Enforces at-least-one-admin constraint.
 */
app.patch("/api/admin/admin-contacts/:id/role", requireAuth, requireAdminRole, async (req, res) => {
  const contactId = parseInt(req.params.id);
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: "Invalid role" });
  try {
    // Prevent removing last admin
    if (role === 'user') {
      const [[{ admin_count }]] = await db.query(
        `SELECT COUNT(*) AS admin_count FROM ffs_contact WHERE fleet_id = 0 AND admin_role = 'admin' AND contact_id != ?`,
        [contactId]
      );
      if (admin_count === 0) return res.status(400).json({ error: "Cannot remove the last admin" });
    }
    await db.query(
      `UPDATE ffs_contact SET admin_role = ? WHERE contact_id = ? AND fleet_id = 0`,
      [role, contactId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * POST /api/admin/admin-contacts
 * Creates a new fleet_id=0 (NACFE) user.
 */
app.post("/api/admin/admin-contacts", requireAuth, requireAdminRole, async (req, res) => {
  const { first_name, last_name, email, phone, admin_role } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });
  const role = ['admin', 'user'].includes(admin_role) ? admin_role : 'user';
  try {
    const [existing] = await db.query(`SELECT contact_id FROM ffs_contact WHERE email = ?`, [email]);
    if (existing.length) return res.status(400).json({ error: "A user with that email already exists" });
    await db.query(
      `INSERT INTO ffs_contact (fleet_id, first_name, last_name, email, phone, active, admin_role)
       VALUES (0, ?, ?, ?, ?, 1, ?)`,
      [first_name || '', last_name || '', email, phone || '', role]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * DELETE /api/admin/admin-contacts/:id
 * Removes a fleet_id=0 (NACFE) user. Enforces at-least-one-admin constraint.
 */
app.delete("/api/admin/admin-contacts/:id", requireAuth, requireAdminRole, async (req, res) => {
  const contactId = parseInt(req.params.id);
  try {
    const [[contact]] = await db.query(
      `SELECT admin_role FROM ffs_contact WHERE contact_id = ? AND fleet_id = 0`, [contactId]
    );
    if (!contact) return res.status(404).json({ error: "User not found" });
    if (contact.admin_role === 'admin') {
      const [[{ admin_count }]] = await db.query(
        `SELECT COUNT(*) AS admin_count FROM ffs_contact WHERE fleet_id = 0 AND admin_role = 'admin' AND contact_id != ?`,
        [contactId]
      );
      if (admin_count === 0) return res.status(400).json({ error: "Cannot remove the last admin" });
    }
    await db.query(`DELETE FROM ffs_contact WHERE contact_id = ? AND fleet_id = 0`, [contactId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
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
app.post("/api/admin/techs", requireAuth, requireAdminRole, async (req, res) => {
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
app.put("/api/admin/techs/:id", requireAuth, requireAdminRole, async (req, res) => {
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
app.put("/api/admin/settings", requireAuth, requireAdminRole, async (req, res) => {
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
         ) sub GROUP BY mpg_year HAVING COUNT(*) >= 3 ORDER BY mpg_year`,
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

    // Peer-average adoption % by cab type — same duty cycle only, excluding self
    const peerSleeperAdoption = {}, peerDayCabAdoption = {};
    if (fleetRow?.default_duty_cycle) {
      const [peerAdoptRows] = await db.query(
        `SELECT adoption_year, cab_type, AVG(adoption_percent)*100 AS avg_pct
         FROM ffs_adoption
         WHERE fleet_id IN (
           SELECT fleet_id FROM ffs_fleet
           WHERE default_duty_cycle = ? AND fleet_id != ? AND fleet_id NOT IN (0,45,46)
         )
         AND cab_type IN ('Sleeper','Day Cab')
         GROUP BY adoption_year, cab_type ORDER BY adoption_year`,
        [fleetRow.default_duty_cycle, fleet_id]
      );
      peerAdoptRows.forEach(r => {
        const v = parseFloat(parseFloat(r.avg_pct).toFixed(1));
        if (r.cab_type === 'Sleeper') peerSleeperAdoption[r.adoption_year] = v;
        else peerDayCabAdoption[r.adoption_year] = v;
      });
    }

    const dutyCycle = fleetRow?.default_duty_cycle || null;

    res.json({ ownMpg, peerMpg, sleeperAdoption, dayCabAdoption,
               peerSleeperAdoption, peerDayCabAdoption, dutyCycle });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
});

// ─── Benchmarking ─────────────────────────────────────────────────────────────

/**
 * GET /api/benchmark/fleets
 * Returns list of fleets in same duty cycle as the requesting fleet that have
 * at least one submission, excluding fleet_id 0, 45, 46 and the current fleet.
 */
app.get("/api/benchmark/fleets", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    const [[fleetRow]] = await db.query(
      `SELECT default_duty_cycle FROM ffs_fleet WHERE fleet_id = ?`, [fleet_id]
    );
    if (!fleetRow?.default_duty_cycle) return res.json({ dutyCycle: null, fleets: [] });

    const [rows] = await db.query(
      `SELECT f.fleet_id, f.fleet_name, COUNT(DISTINCT s.survey_year) AS submission_count
       FROM ffs_fleet f
       JOIN ffs_submission s ON s.fleet_id = f.fleet_id
       WHERE f.default_duty_cycle = ?
         AND f.fleet_id != ?
         AND f.fleet_id NOT IN (0, 45, 46)
       GROUP BY f.fleet_id, f.fleet_name
       ORDER BY f.fleet_name`,
      [fleetRow.default_duty_cycle, fleet_id]
    );
    res.json({ dutyCycle: fleetRow.default_duty_cycle, fleets: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch benchmark fleets" });
  }
});

/**
 * GET /api/benchmark/data?fleet_ids=1,2,3
 * Returns per-year MPG and per-tech adoption % for the requested comparison
 * fleet IDs plus the current fleet. Comparison fleets are returned with
 * randomly-assigned labels (Fleet 1, Fleet 2, …); the current fleet is "You".
 * fleet_ids must be comma-separated integers from the same duty cycle.
 */
app.get("/api/benchmark/data", requireAuth, async (req, res) => {
  const { fleet_id } = req.user;
  try {
    const rawIds = (req.query.fleet_ids || '').split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0);
    if (rawIds.length === 0) return res.status(400).json({ error: "fleet_ids required" });

    // Validate all requested fleets are in same duty cycle as requesting fleet
    const [[fleetRow]] = await db.query(
      `SELECT default_duty_cycle FROM ffs_fleet WHERE fleet_id = ?`, [fleet_id]
    );
    if (!fleetRow?.default_duty_cycle) return res.status(400).json({ error: "Fleet has no duty cycle" });

    const [validRows] = await db.query(
      `SELECT fleet_id FROM ffs_fleet
       WHERE fleet_id IN (?) AND default_duty_cycle = ? AND fleet_id NOT IN (0, 45, 46)
         AND fleet_id != ?`,
      [rawIds, fleetRow.default_duty_cycle, fleet_id]  // exclude self even if it slips in
    );
    const validIds = validRows.map(r => r.fleet_id);
    const allIds = [fleet_id, ...validIds];

    // MPG per fleet per year
    const [mpgRows] = await db.query(
      `SELECT fleet_id, mpg_year,
              IF(SUM(ifta_fuel)>0, SUM(ifta_miles)/SUM(ifta_fuel), NULL) AS mpg
       FROM ffs_mpg
       WHERE fleet_id IN (?)
       GROUP BY fleet_id, mpg_year
       ORDER BY mpg_year`,
      [allIds]
    );

    // Adoption per fleet per tech per year (latest config only)
    const [adoptionRows] = await db.query(
      `SELECT a.fleet_id, a.adoption_year, t.technology, a.cab_type,
              a.adoption_percent * 100 AS adoption_pct
       FROM ffs_adoption a
       JOIN ffs_tech t ON a.tech_id = t.tech_id
       WHERE a.fleet_id IN (?)
         AND a.cab_type IN ('Sleeper', 'Day Cab')
         AND a.config = (
           SELECT MAX(a2.config) FROM ffs_adoption a2
           WHERE a2.fleet_id = a.fleet_id AND a2.adoption_year = a.adoption_year AND a2.cab_type = a.cab_type
         )
       ORDER BY a.adoption_year, t.tech_group, t.technology`,
      [allIds]
    );

    // Shuffle comparison fleet IDs for anonymisation
    const shuffled = [...validIds].sort(() => Math.random() - 0.5);
    const labelMap = { [fleet_id]: 'You' };
    shuffled.forEach((id, i) => { labelMap[id] = `Fleet ${i + 1}`; });

    // Structure mpg: { fleetLabel: { year: mpg } }
    const mpgByFleet = {};
    for (const r of mpgRows) {
      const label = labelMap[r.fleet_id];
      if (!label) continue;
      if (!mpgByFleet[label]) mpgByFleet[label] = {};
      if (r.mpg != null) mpgByFleet[label][r.mpg_year] = parseFloat(parseFloat(r.mpg).toFixed(2));
    }

    // Structure adoption: { technology: { cab_type: { fleetLabel: { year: pct } } } }
    const adoptionByTech = {};
    for (const r of adoptionRows) {
      const label = labelMap[r.fleet_id];
      if (!label) continue;
      if (!adoptionByTech[r.technology]) adoptionByTech[r.technology] = {};
      if (!adoptionByTech[r.technology][r.cab_type]) adoptionByTech[r.technology][r.cab_type] = {};
      if (!adoptionByTech[r.technology][r.cab_type][label]) adoptionByTech[r.technology][r.cab_type][label] = {};
      adoptionByTech[r.technology][r.cab_type][label][r.adoption_year] = parseFloat(parseFloat(r.adoption_pct).toFixed(1));
    }

    // Tech group ordering from ffs_tech
    const [techRows] = await db.query(
      `SELECT tech_group, technology FROM ffs_tech WHERE active_to IS NULL ORDER BY tech_group, technology`
    );
    const techGroups = {};
    for (const r of techRows) {
      if (!techGroups[r.tech_group]) techGroups[r.tech_group] = [];
      techGroups[r.tech_group].push(r.technology);
    }

    // Collect all years across all data
    const allYears = [...new Set([
      ...mpgRows.map(r => r.mpg_year),
      ...adoptionRows.map(r => r.adoption_year),
    ])].sort((a, b) => a - b);

    res.json({
      dutyCycle: fleetRow.default_duty_cycle,
      labels: ['You', ...shuffled.map((_, i) => `Fleet ${i + 1}`)],
      years: allYears,
      mpg: mpgByFleet,
      adoption: adoptionByTech,
      techGroups,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch benchmark data" });
  }
});

// ─── Admin Charts ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/charts/adoption
 * Returns two datasets for the charts page:
 *   techRows  – per-technology per-year average adoption % across all study fleets
 *   catRows   – per-tech-group per-year average adoption % across all study fleets
 * fleet_id 0/45/46 are excluded (NACFE admin, FHWA reference, BAU reference).
 * adoption values are returned as percentages (0–100).
 */
app.get("/api/admin/charts/adoption", requireAuth, requireAdmin, async (req, res) => {
  try {
    // max_year: prefer query param, fall back to DB setting
    let maxYear;
    if (req.query.max_year && !isNaN(parseInt(req.query.max_year))) {
      maxYear = parseInt(req.query.max_year);
    } else {
      const [settingRows] = await db.query(
        `SELECT setting_value FROM ffs_settings WHERE setting_key = 'charts_max_year'`
      );
      maxYear = settingRows[0]?.setting_value
        ? parseInt(settingRows[0].setting_value)
        : new Date().getFullYear();
    }
    const minYear = 2003;

    // haul_type: 'lh' | 'rh' | 'combined' (default)
    const haulType = req.query.haul_type || 'combined';

    // Build WHERE clause and JOIN based on haul_type.
    // lh  = line-haul fleets, sleeper cab only (exclude Day Cab rows)
    // rh  = regional-haul fleets (all cab) + line-haul fleets' Day Cab rows
    // combined = all study fleets (existing behaviour)
    let fleetJoin  = '';
    let fleetWhere = 'a.fleet_id NOT IN (0, 45, 46)';
    if (haulType === 'lh') {
      fleetJoin  = 'JOIN ffs_fleet f ON a.fleet_id = f.fleet_id';
      fleetWhere = `LOWER(f.default_duty_cycle) = 'lh'
                   AND (a.cab_type IS NULL OR a.cab_type != 'Day Cab')
                   AND a.fleet_id NOT IN (0, 45, 46)`;
    } else if (haulType === 'rh') {
      fleetJoin  = 'JOIN ffs_fleet f ON a.fleet_id = f.fleet_id';
      fleetWhere = `(LOWER(f.default_duty_cycle) = 'rh'
                    OR (LOWER(f.default_duty_cycle) = 'lh' AND a.cab_type = 'Day Cab'))
                   AND a.fleet_id NOT IN (0, 45, 46)`;
    }

    const [techRows] = await db.query(`
      SELECT a.tech_id, t.tech_group, t.technology,
             a.adoption_year AS year,
             AVG(a.adoption_percent) * 100 AS adoption
      FROM ffs_adoption a
      JOIN ffs_tech t ON a.tech_id = t.tech_id
      ${fleetJoin}
      WHERE ${fleetWhere}
        AND a.adoption_year >= ? AND a.adoption_year <= ?
      GROUP BY a.tech_id, t.tech_group, t.technology, a.adoption_year
      ORDER BY t.tech_group, t.technology, a.adoption_year
    `, [minYear, maxYear]);
    const [catRows] = await db.query(`
      SELECT t.tech_group,
             a.adoption_year AS year,
             AVG(a.adoption_percent) * 100 AS adoption
      FROM ffs_adoption a
      JOIN ffs_tech t ON a.tech_id = t.tech_id
      ${fleetJoin}
      WHERE ${fleetWhere}
        AND a.adoption_year >= ? AND a.adoption_year <= ?
      GROUP BY t.tech_group, a.adoption_year
      ORDER BY t.tech_group, a.adoption_year
    `, [minYear, maxYear]);
    res.json({
      techRows: techRows.map(r => ({ ...r, adoption: parseFloat(r.adoption) })),
      catRows:  catRows.map(r => ({ ...r, adoption: parseFloat(r.adoption) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch adoption chart data" });
  }
});

/**
 * GET /api/admin/charts/mpg
 * Returns per-year: fleet-average IFTA MPG, FHWA MPG (fleet 45), BAU MPG (fleet 46),
 * and overall average adoption % — all for the combined IFTA MPG & Adoption chart.
 */
app.get("/api/admin/charts/mpg", requireAuth, requireAdmin, async (req, res) => {
  try {
    // max_year: prefer query param, fall back to DB setting
    let maxYear;
    if (req.query.max_year && !isNaN(parseInt(req.query.max_year))) {
      maxYear = parseInt(req.query.max_year);
    } else {
      const [settingRows] = await db.query(
        `SELECT setting_value FROM ffs_settings WHERE setting_key = 'charts_max_year'`
      );
      maxYear = settingRows[0]?.setting_value
        ? parseInt(settingRows[0].setting_value)
        : new Date().getFullYear();
    }
    const minYear = 2003;

    // Split fleet average MPG by duty cycle (LH / RH).
    // LOWER() normalises stored values ('LH','lh','Lh' → 'lh') so the
    // JS check below is case-insensitive without an exhaustive IN list.
    // Fleets with no duty_cycle set are excluded from both series.
    const [fleetRows] = await db.query(`
      SELECT m.mpg_year AS year,
             LOWER(f.default_duty_cycle) AS duty_cycle,
             ROUND(AVG(m.multiplier * m.ifta_miles / NULLIF(m.ifta_fuel + COALESCE(m.nat_gas_dge,0), 0)), 3) AS fleet_mpg
      FROM ffs_mpg m
      JOIN ffs_fleet f ON m.fleet_id = f.fleet_id
      WHERE COALESCE(m.mpg_quarter,'') = '' AND m.fleet_id NOT IN (0, 45, 46)
        AND m.ifta_fuel > 0 AND m.ifta_miles > 0
        AND m.mpg_year >= ? AND m.mpg_year <= ?
        AND LOWER(f.default_duty_cycle) IN ('lh', 'rh')
      GROUP BY m.mpg_year, LOWER(f.default_duty_cycle)
      ORDER BY m.mpg_year
    `, [minYear, maxYear]);
    const [fhwaRows] = await db.query(`
      SELECT mpg_year AS year, ROUND(ifta_miles / NULLIF(ifta_fuel, 0), 3) AS mpg
      FROM ffs_mpg
      WHERE fleet_id = 45 AND COALESCE(mpg_quarter,'') = ''
        AND mpg_year >= 2007 AND mpg_year <= ?
      ORDER BY mpg_year
    `, [maxYear]);
    const [bauRows] = await db.query(`
      SELECT mpg_year AS year, ROUND(ifta_miles / NULLIF(ifta_fuel, 0), 3) AS mpg
      FROM ffs_mpg WHERE fleet_id = 46 AND mpg_quarter = ''
        AND mpg_year >= ? AND mpg_year <= ?
      ORDER BY mpg_year
    `, [minYear, maxYear]);
    const [adoptRows] = await db.query(`
      SELECT adoption_year AS year, AVG(adoption_percent) * 100 AS adoption
      FROM ffs_adoption WHERE fleet_id NOT IN (0, 45, 46)
        AND adoption_year >= ? AND adoption_year <= ?
      GROUP BY adoption_year ORDER BY adoption_year
    `, [minYear, maxYear]);
    // Combined MPG across all fleets regardless of duty cycle
    const [combinedRows] = await db.query(`
      SELECT m.mpg_year AS year,
             ROUND(AVG(m.multiplier * m.ifta_miles / NULLIF(m.ifta_fuel + COALESCE(m.nat_gas_dge,0), 0)), 3) AS combined_mpg
      FROM ffs_mpg m
      JOIN ffs_fleet f ON m.fleet_id = f.fleet_id
      WHERE COALESCE(m.mpg_quarter,'') = '' AND m.fleet_id NOT IN (0, 45, 46)
        AND m.ifta_fuel > 0 AND m.ifta_miles > 0
        AND m.mpg_year >= ? AND m.mpg_year <= ?
        AND LOWER(f.default_duty_cycle) IN ('lh', 'rh')
      GROUP BY m.mpg_year
      ORDER BY m.mpg_year
    `, [minYear, maxYear]);
    // LH adoption (line-haul fleets, sleeper cab rows only)
    const [lhAdoptRows] = await db.query(`
      SELECT a.adoption_year AS year, AVG(a.adoption_percent) * 100 AS lh_adoption
      FROM ffs_adoption a
      JOIN ffs_fleet f ON a.fleet_id = f.fleet_id
      WHERE a.fleet_id NOT IN (0, 45, 46)
        AND LOWER(f.default_duty_cycle) = 'lh'
        AND (a.cab_type IS NULL OR a.cab_type != 'Day Cab')
        AND a.adoption_year >= ? AND a.adoption_year <= ?
      GROUP BY a.adoption_year ORDER BY a.adoption_year
    `, [minYear, maxYear]);
    // RH adoption (regional-haul fleets + LH day-cab rows)
    const [rhAdoptRows] = await db.query(`
      SELECT a.adoption_year AS year, AVG(a.adoption_percent) * 100 AS rh_adoption
      FROM ffs_adoption a
      JOIN ffs_fleet f ON a.fleet_id = f.fleet_id
      WHERE a.fleet_id NOT IN (0, 45, 46)
        AND (LOWER(f.default_duty_cycle) = 'rh'
             OR (LOWER(f.default_duty_cycle) = 'lh' AND a.cab_type = 'Day Cab'))
        AND a.adoption_year >= ? AND a.adoption_year <= ?
      GROUP BY a.adoption_year ORDER BY a.adoption_year
    `, [minYear, maxYear]);
    const map = {};
    fleetRows.forEach(r => {
      if (!map[r.year]) map[r.year] = { year: r.year };
      if (r.duty_cycle === 'lh') map[r.year].lh_mpg = parseFloat(r.fleet_mpg);
      if (r.duty_cycle === 'rh') map[r.year].rh_mpg = parseFloat(r.fleet_mpg);
    });
    fhwaRows.forEach(r       => { if (!map[r.year]) map[r.year] = { year: r.year }; map[r.year].fhwa_mpg    = parseFloat(r.mpg); });
    bauRows.forEach(r        => { if (!map[r.year]) map[r.year] = { year: r.year }; map[r.year].bau_mpg     = parseFloat(r.mpg); });
    adoptRows.forEach(r      => { if (!map[r.year]) map[r.year] = { year: r.year }; map[r.year].adoption    = parseFloat(r.adoption); });
    combinedRows.forEach(r   => { if (!map[r.year]) map[r.year] = { year: r.year }; map[r.year].combined_mpg  = parseFloat(r.combined_mpg); });
    lhAdoptRows.forEach(r    => { if (!map[r.year]) map[r.year] = { year: r.year }; map[r.year].lh_adoption  = parseFloat(r.lh_adoption); });
    rhAdoptRows.forEach(r    => { if (!map[r.year]) map[r.year] = { year: r.year }; map[r.year].rh_adoption  = parseFloat(r.rh_adoption); });
    const rows = Object.values(map).sort((a, b) => a.year - b.year);
    res.json({ rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch MPG chart data" });
  }
});

/**
 * POST /api/admin/charts/run-query
 * Executes an admin-supplied SELECT query and returns the result rows.
 * Restricted to NACFE admin role. Only SELECT statements are permitted;
 * results are capped at 5 000 rows.
 */
app.post("/api/admin/charts/run-query", requireAuth, requireAdminRole, async (req, res) => {
  const { sql } = req.body;
  if (!sql || typeof sql !== 'string') return res.status(400).json({ error: 'sql is required' });
  const trimmed = sql.trim();
  if (!/^SELECT\b/i.test(trimmed)) return res.status(400).json({ error: 'Only SELECT statements are allowed' });
  try {
    const [rows] = await db.query(trimmed);
    if (rows.length > 5000) {
      return res.status(400).json({ error: `Query returned ${rows.length} rows (max 5 000). Add a LIMIT clause.` });
    }
    res.json({ rows });
  } catch (err) {
    res.status(400).json({ error: err.sqlMessage || err.message });
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
