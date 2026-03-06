# NACFE Fleet Benchmarking Portal — Prototype

A full-stack prototype: React frontend + Node/Express backend + MySQL.

## Quick Start

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # fill in your DB credentials and JWT secret
node server.js            # or: npx nodemon server.js
# → API running at http://localhost:3001
```

Verify DB connection:
```
curl http://localhost:3001/api/health
# → {"status":"ok","db":"connected"}
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# → App at http://localhost:5173
```

The Vite dev server proxies `/api/*` to `localhost:3001` automatically.

---

## Database Assumptions

The backend expects these tables (based on your existing MySQL schema from the uploaded spreadsheets):

### `fleets`
| column | type | notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| fleet_name | VARCHAR(255) | used as login username |
| password_hash | VARCHAR(255) | bcrypt hash |
| contact_name | VARCHAR(255) | |
| email | VARCHAR(255) | |
| phone | VARCHAR(50) | |
| hq_location | VARCHAR(255) | |
| address | TEXT | |

To create a fleet login:
```javascript
// run once: node -e "const b=require('bcryptjs'); b.hash('mypassword',10).then(console.log)"
// then INSERT INTO fleets (fleet_name, password_hash, ...) VALUES ('Werner', '<hash>', ...);
```

### `general_data`
| column | type |
|--------|------|
| fleet_id | INT FK |
| survey_year | YEAR |
| sleeper_tractors_owned | INT |
| day_cab_tractors_owned | INT |
| trailers_owned | INT |
| leased_tractors | INT |
| owner_operators | INT |
| avg_tractor_age | DECIMAL(4,2) |
| avg_trailer_age | DECIMAL(4,2) |
| ecm_miles | BIGINT |
| ecm_fuel | BIGINT |
| submitted_at | DATETIME |

Unique constraint: `(fleet_id, survey_year)`

### `tech_adoptions`
| column | type | notes |
|--------|------|-------|
| fleet_id | INT FK | |
| survey_year | YEAR | |
| config_num | TINYINT | 1 or 2 (Tractor 1 / Tractor 2) |
| tech_key | VARCHAR(50) | e.g. "diesel_apu", "battery_hvac" |
| pct_adoption | DECIMAL(5,4) | 0.0000–1.0000 (e.g. 0.95 = 95%) |

Unique constraint: `(fleet_id, survey_year, config_num, tech_key)`

**If your existing schema uses different column names**, update the SELECT queries in `server.js` — they're all clearly labelled with comments.

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/health` | No | DB connectivity check |
| GET | `/api/fleet/me` | JWT | Fleet profile + submission years |
| GET | `/api/general` | JWT | All historical general data |
| GET | `/api/techs?config=1` | JWT | All historical tech adoption |
| POST | `/api/submissions` | JWT | Save new year's data |
| GET | `/api/submissions/:year` | JWT | Fetch one year's full submission |

---

## Wiring the Frontend to the API

The frontend currently uses **mock data** (`MOCK_FLEET`, `MOCK_GENERAL`, `MOCK_TECH` at the top of `App.jsx`). To connect it to the live API:

1. On login: call `POST /api/auth/login`, store the returned JWT in state
2. Add an auth header helper:
   ```javascript
   const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
   ```
3. Replace mock constants with `useEffect` calls:
   ```javascript
   useEffect(() => {
     fetch('/api/fleet/me', { headers }).then(r => r.json()).then(setFleet);
     fetch('/api/general',  { headers }).then(r => r.json()).then(setGeneral);
     fetch('/api/techs?config=1', { headers }).then(r => r.json()).then(setTech);
   }, [token]);
   ```
4. On form submit: `POST /api/submissions` with the form state as JSON body.

---

## Next Steps (after prototype)

- [ ] Wire frontend to live API (replace mock data)
- [ ] Add Tractor Config 2 tab to data entry form
- [ ] Add interview/wizard mode (question-by-question for returning fleets)
- [ ] Admin view: see all fleet submissions, flag incomplete ones
- [ ] Email reminders when survey opens
- [ ] Export back to Excel format
