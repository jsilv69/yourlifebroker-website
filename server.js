// =============================================================
// Tomorrow Life — static site + Monday CRM lead endpoint
// Serves the site and accepts quote-form submissions, which it
// forwards to monday.com as a new board item (lead).
// The Monday API token lives ONLY in server env (Fly secret).
// =============================================================
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "16kb" }));

const {
  MONDAY_TOKEN,
  MONDAY_BOARD_ID,
  MONDAY_GROUP_ID,        // optional: group/section to drop leads into
  MONDAY_API_VERSION,     // optional: e.g. "2024-10"
  ALLOW_ORIGIN,           // optional: set if the form is served from another domain
  MONDAY_API_URL = "https://api.monday.com/v2", // overridable for testing
  PORT = 8080,
} = process.env;

// --- Map each form field to a column ID on YOUR Monday board. ---
// Override any of these with COL_* env vars (see .env.example / README).
// An unset/blank COL_* means "don't write this field" — no guessed defaults, so the
// payload never references a column that doesn't exist on the board.
const COLS = {
  email:    process.env.COL_EMAIL    || "",
  phone:    process.env.COL_PHONE    || "",
  state:    process.env.COL_STATE    || "",
  coverage: process.env.COL_COVERAGE || "",
  age:      process.env.COL_AGE      || "",
  gender:   process.env.COL_GENDER   || "",
  nicotine: process.env.COL_NICOTINE || "",
  status:   process.env.COL_STATUS   || "",   // a "status" column
  source:   process.env.COL_SOURCE   || "",   // a text column tagging where the lead came from
  notes:    process.env.COL_NOTES    || "",   // a long-text column: full answer summary
};
const STATUS_LABEL = process.env.MONDAY_STATUS_LABEL || "New Lead";
const LEAD_SOURCE = process.env.LEAD_SOURCE || "Website Quote Form";

// Human-readable summary of every answer — handy when the board lacks a column per field.
const buildNotes = (lead) =>
  [
    `Source: ${LEAD_SOURCE}`,
    `Coverage: ${lead.coverage || "—"}`,
    `State: ${lead.state || "—"}`,
    `Age: ${lead.age || "—"}`,
    `Gender: ${lead.gender || "—"}`,
    `Nicotine: ${lead.nicotine || "—"}`,
    `Email: ${lead.email || "—"}`,
    `Phone: ${lead.phone || "—"}`,
  ].join("\n");

// CORS — the static site is hosted on Cloudflare (different origin), so the browser
// sends a cross-origin POST (with an OPTIONS preflight) to this Fly API.
// ALLOW_ORIGIN may be a single origin, a comma-separated list, or "*".
const ALLOWED_ORIGINS = (ALLOW_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
const allowAll = ALLOWED_ORIGINS.includes("*");
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowAll) {
    res.set("Access-Control-Allow-Origin", "*");
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const clean = (v) => (v == null ? "" : String(v).trim());

app.post("/api/lead", async (req, res) => {
  try {
    if (!MONDAY_TOKEN || !MONDAY_BOARD_ID) {
      console.error("Missing MONDAY_TOKEN or MONDAY_BOARD_ID env vars.");
      return res.status(500).json({ ok: false, error: "Server not configured" });
    }

    const b = req.body || {};
    const lead = {
      fname:    clean(b.fname),
      lname:    clean(b.lname),
      email:    clean(b.email),
      phone:    clean(b.phone).replace(/\D/g, ""),
      state:    clean(b.state),
      coverage: clean(b.coverage),
      gender:   clean(b.gender),
      nicotine: clean(b.nicotine),
      age:      clean(b.age),
    };

    // Minimal server-side validation.
    if (!lead.fname || !lead.lname) return res.status(400).json({ ok: false, error: "Name is required" });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) return res.status(400).json({ ok: false, error: "Valid email is required" });
    if (lead.phone.length < 7) return res.status(400).json({ ok: false, error: "Valid phone is required" });

    // Build Monday column_values. A field is only sent if its column ID is configured,
    // so leaving a COL_* blank cleanly skips that field (no empty-key payloads).
    const columnValues = {};
    if (COLS.email)               columnValues[COLS.email]    = { email: lead.email, text: lead.email };
    if (COLS.phone)               columnValues[COLS.phone]    = { phone: lead.phone, countryShortName: "US" };
    if (COLS.state && lead.state)       columnValues[COLS.state]    = lead.state;
    if (COLS.coverage && lead.coverage) columnValues[COLS.coverage] = lead.coverage;
    if (COLS.gender && lead.gender)     columnValues[COLS.gender]   = lead.gender;
    if (COLS.nicotine && lead.nicotine) columnValues[COLS.nicotine] = lead.nicotine;
    if (COLS.age && lead.age)           columnValues[COLS.age]      = Number(lead.age) || 0;
    if (COLS.status)              columnValues[COLS.status]   = { label: STATUS_LABEL };
    if (COLS.source)              columnValues[COLS.source]   = LEAD_SOURCE;
    if (COLS.notes)               columnValues[COLS.notes]    = { text: buildNotes(lead) };

    const query = `
      mutation ($board: ID!, $group: String, $name: String!, $cols: JSON!) {
        create_item (board_id: $board, group_id: $group, item_name: $name, column_values: $cols) { id }
      }`;
    const variables = {
      board: String(MONDAY_BOARD_ID),
      group: MONDAY_GROUP_ID || null,
      name: `${lead.fname} ${lead.lname}`.trim(),
      cols: JSON.stringify(columnValues),
    };

    const headers = {
      "Content-Type": "application/json",
      Authorization: MONDAY_TOKEN,
    };
    if (MONDAY_API_VERSION) headers["API-Version"] = MONDAY_API_VERSION;

    const r = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok || data.errors || data.error_message) {
      console.error("Monday API error:", JSON.stringify(data));
      return res.status(502).json({ ok: false, error: "Could not save your request — please call us." });
    }

    return res.json({ ok: true, id: data?.data?.create_item?.id || null });
  } catch (err) {
    console.error("Lead handler error:", err);
    return res.status(500).json({ ok: false, error: "Unexpected error — please try again." });
  }
});

// Health check for Fly.
app.get("/healthz", (_req, res) => res.type("text").send("ok"));

// Serve the static site from public/ (same directory Cloudflare deploys).
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"], dotfiles: "ignore" }));

app.listen(PORT, () => console.log(`YourLifeBroker listening on :${PORT}`));
