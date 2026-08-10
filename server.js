// =============================================================
// Tomorrow Life — static site + Monday CRM lead endpoint
// Serves the site and accepts quote-form submissions, which it
// forwards to monday.com as a new board item (lead).
// The Monday API token lives ONLY in server env (Fly secret).
// =============================================================
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Keep the raw body so we can verify Meta's X-Hub-Signature-256.
app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));

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
  source:   process.env.COL_SOURCE   || "",   // text column: which page/form the lead came from
  sourceGroup: process.env.COL_SOURCE_GROUP || "", // status column: channel bucket (e.g. "Meta Ads")
  notes:    process.env.COL_NOTES    || "",   // long-text column: full answer summary
  // Marketing attribution → dedicated text columns
  clid:        process.env.COL_CLID         || "",  // Google click id (gclid)
  utmSource:   process.env.COL_UTM_SOURCE   || "",
  utmCampaign: process.env.COL_UTM_CAMPAIGN || "",
  utmAdGroup:  process.env.COL_UTM_ADGROUP  || "",
  utmKeyword:  process.env.COL_UTM_KEYWORD  || "",
};
const STATUS_LABEL = process.env.MONDAY_STATUS_LABEL || "New Lead";
const LEAD_SOURCE = process.env.LEAD_SOURCE || "Website Quote Form";
// Lead Source Group (status column) for web-form leads, chosen from the ad campaign ID
// the visit carried. Known campaigns map to a specific group; a submission with no
// campaign (or an unmapped one) falls back to the default. Extend/override the map
// without a deploy via WEB_FORM_CAMPAIGN_GROUPS (JSON: {"<campaignId>":"Group"}).
const WEB_SOURCE_GROUP_DEFAULT = process.env.WEB_SOURCE_GROUP_DEFAULT || "Direct Web Form";
const WEB_FORM_CAMPAIGN_GROUPS = {
  "23965944477": "FEX Google Form",
  "24004738509": "WL Google Form",
};
try {
  if (process.env.WEB_FORM_CAMPAIGN_GROUPS) Object.assign(WEB_FORM_CAMPAIGN_GROUPS, JSON.parse(process.env.WEB_FORM_CAMPAIGN_GROUPS));
} catch { console.warn("WEB_FORM_CAMPAIGN_GROUPS env is not valid JSON — ignoring"); }

// --- Meta Lead Ads (Instant Forms) webhook config ---
const {
  META_APP_SECRET,     // for verifying X-Hub-Signature-256
  META_PAGE_TOKEN,     // System User / Page token with leads_retrieval
  META_VERIFY_TOKEN,   // string you set here + in the Meta webhook config
  META_GRAPH_VERSION = "v21.0",
  META_GRAPH_BASE = "https://graph.facebook.com", // overridable for testing
} = process.env;

// Ad URLs sometimes pass the numeric Meta campaign ID as utm_campaign (e.g. {{campaign.id}}),
// so leads can land with a bare number as their "campaign". Resolve that ID to the real
// campaign name via the Graph API. Cached in-process; best-effort with a short timeout so it
// never blocks or fails a lead. Empty results are cached too (e.g. Google IDs the Graph API
// can't resolve) to avoid re-hitting them.
const metaCampaignNameCache = new Map();
async function resolveMetaCampaignName(campaignId) {
  const id = String(campaignId || "").trim();
  if (!/^\d+$/.test(id) || !META_PAGE_TOKEN) return "";
  if (metaCampaignNameCache.has(id)) return metaCampaignNameCache.get(id);
  const url = `${META_GRAPH_BASE}/${META_GRAPH_VERSION}/${encodeURIComponent(id)}`
    + `?fields=name&access_token=${encodeURIComponent(META_PAGE_TOKEN)}`;
  let name = "";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const d = await r.json().catch(() => ({}));
    if (r.ok && d && d.name) name = String(d.name);
  } catch { /* best-effort — leave name empty */ }
  metaCampaignNameCache.set(id, name);
  return name;
}

// Only try to resolve Meta campaign IDs for Meta-sourced traffic (an/fb/ig/audience network),
// so a numeric Google campaign ID doesn't cause a pointless Graph call that 400s.
const META_TRAFFIC_SOURCES = new Set(["an", "meta", "fb", "facebook", "ig", "instagram", "msg", "audiencenetwork"]);
function looksMetaTraffic(attr = {}) {
  return Boolean(attr.fbclid) || META_TRAFFIC_SOURCES.has(String(attr.utm_source || "").toLowerCase());
}

// Google's ad URLs pass {campaignid} (a bare number) as utm_campaign and there's no lightweight
// name lookup like Meta's, so we map known campaign IDs to readable names here. Add new campaigns
// to this list, or override/extend without a deploy via the GOOGLE_CAMPAIGN_NAMES env var (JSON).
const GOOGLE_CAMPAIGN_NAMES = {
  "24069673439": "Video Efficient reach - 2026-07-26",
  "23965953543": "Customer Service 1",
  "23965944477": "FEX Buyers 1",
  "24004738509": "Whole Life - Search",
  "24078790730": "Customer Service - Priority Carriers",
  "24014276785": "Video Non-skippable - 2026-07-07",
  "23964148947": "Zeta XXX",
  "24004736085": "Mortgage Protection - Search",
};
try {
  if (process.env.GOOGLE_CAMPAIGN_NAMES) Object.assign(GOOGLE_CAMPAIGN_NAMES, JSON.parse(process.env.GOOGLE_CAMPAIGN_NAMES));
} catch { console.warn("GOOGLE_CAMPAIGN_NAMES env is not valid JSON — ignoring"); }
const META_LEAD_SOURCE = process.env.META_LEAD_SOURCE || "Meta Instant Form";
const META_SOURCE_GROUP = process.env.META_SOURCE_GROUP || "Meta Ads"; // Lead Source Group status label

// Marketing attribution passed from the form (UTM params + ad click IDs).
const ATTR_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_adgroup", "gclid", "gbraid", "wbraid", "fbclid"];

// Human-readable summary of every answer — handy when the board lacks a column per field.
const buildNotes = (lead, attr = {}, source = LEAD_SOURCE) => {
  const lines = [
    `Source: ${source}`,
    `Coverage: ${lead.coverage || "—"}`,
    `State: ${lead.state || "—"}`,
    `Age: ${lead.age || "—"}`,
    `Gender: ${lead.gender || "—"}`,
    `Nicotine: ${lead.nicotine || "—"}`,
    `Email: ${lead.email || "—"}`,
    `Phone: ${lead.phone || "—"}`,
  ];
  const marketing = ATTR_KEYS.filter((k) => attr[k]).map((k) => `${k}: ${attr[k]}`);
  if (marketing.length) lines.push("", "Marketing:", ...marketing);
  return lines.join("\n");
};

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Create one item (lead) on the Monday board. Returns { ok, id } or { ok:false, data }.
// Retries transient Monday errors (500 / DOWNSTREAM_SERVICE_ERROR / rate limits) with backoff;
// deterministic errors (e.g. ColumnValueException) fail fast.
async function mondayCreateItem(itemName, columnValues, { retries = 3 } = {}) {
  const query = `
    mutation ($board: ID!, $group: String, $name: String!, $cols: JSON!) {
      create_item (board_id: $board, group_id: $group, item_name: $name, column_values: $cols, create_labels_if_missing: true) { id }
    }`;
  const variables = {
    board: String(MONDAY_BOARD_ID),
    group: MONDAY_GROUP_ID || null,
    name: itemName,
    cols: JSON.stringify(columnValues),
  };
  const headers = { "Content-Type": "application/json", Authorization: MONDAY_TOKEN };
  if (MONDAY_API_VERSION) headers["API-Version"] = MONDAY_API_VERSION;

  let last = { ok: false, data: {} };
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(Math.min(4000, 400 * 2 ** (attempt - 1)));
    let r, data;
    try {
      r = await fetch(MONDAY_API_URL, { method: "POST", headers, body: JSON.stringify({ query, variables }) });
      data = await r.json().catch(() => ({}));
    } catch (e) {
      last = { ok: false, data: { error: String(e) } };
      continue; // network error → retry
    }
    if (r.ok && !data.errors && !data.error_message) {
      if (attempt) console.log(`Monday create succeeded on retry #${attempt}`);
      return { ok: true, id: data?.data?.create_item?.id || null };
    }
    last = { ok: false, data };
    const transient = !r.ok || /INTERNAL_SERVER_ERROR|DOWNSTREAM_SERVICE_ERROR|complexity|rate.?limit|timeout|ETIMEDOUT|502|503|504/i.test(JSON.stringify(data));
    if (!transient) break; // don't retry a real/deterministic rejection
    console.warn(`Monday create transient error (attempt ${attempt + 1}/${retries + 1}), retrying…`);
  }
  return last;
}

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

    // Marketing attribution (UTM / click IDs) — optional, appended to Notes.
    const attr = {};
    for (const k of ATTR_KEYS) { const v = clean(b[k]); if (v) attr[k] = v; }

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
    // Lead Source = the ad campaign name when the click carried one, else the per-page form name.
    let campaign = clean(attr.utm_campaign);
    if (/^\d+$/.test(campaign)) {
      // Meta traffic: resolve the numeric campaign ID to its name via the Graph API.
      if (looksMetaTraffic(attr)) {
        const name = await resolveMetaCampaignName(campaign);
        if (name) campaign = name;
      }
      // Still numeric (e.g. Google): map the known campaign ID to a readable name.
      if (/^\d+$/.test(campaign) && GOOGLE_CAMPAIGN_NAMES[campaign]) campaign = GOOGLE_CAMPAIGN_NAMES[campaign];
    }
    const leadSource = campaign || clean(b.lead_source) || LEAD_SOURCE;
    if (COLS.source)              columnValues[COLS.source]   = leadSource;
    // Lead Source Group = from the ad campaign ID the visit carried (mapped), else default.
    const campaignId = clean(attr.utm_campaign);
    if (COLS.sourceGroup)         columnValues[COLS.sourceGroup] = { label: WEB_FORM_CAMPAIGN_GROUPS[campaignId] || WEB_SOURCE_GROUP_DEFAULT };
    if (COLS.notes)               columnValues[COLS.notes]    = { text: buildNotes(lead, attr, leadSource) };

    // Marketing attribution → dedicated CRM text columns.
    const clid = attr.gclid || attr.gbraid || attr.wbraid || "";
    if (COLS.clid && clid)                       columnValues[COLS.clid]        = clid;
    if (COLS.utmSource && attr.utm_source)       columnValues[COLS.utmSource]   = attr.utm_source;
    if (COLS.utmCampaign && attr.utm_campaign)   columnValues[COLS.utmCampaign] = attr.utm_campaign;
    if (COLS.utmAdGroup && (attr.utm_adgroup || attr.utm_content)) columnValues[COLS.utmAdGroup] = attr.utm_adgroup || attr.utm_content;
    if (COLS.utmKeyword && attr.utm_term)        columnValues[COLS.utmKeyword]  = attr.utm_term;

    const result = await mondayCreateItem(`${lead.fname} ${lead.lname}`.trim(), columnValues);
    if (!result.ok) {
      console.error("Monday API error:", JSON.stringify(result.data));
      return res.status(502).json({ ok: false, error: "Could not save your request — please call us." });
    }
    return res.json({ ok: true, id: result.id });
  } catch (err) {
    console.error("Lead handler error:", err);
    return res.status(500).json({ ok: false, error: "Unexpected error — please try again." });
  }
});

// =============================================================
// Meta Lead Ads (Instant Forms) → Monday
// Meta sends a `leadgen` webhook with a leadgen_id; we fetch the
// lead from the Graph API and create a Monday item.
// =============================================================

// 1) Verification handshake (Meta GET with hub.challenge).
app.get("/webhooks/meta", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && META_VERIFY_TOKEN && token === META_VERIFY_TOKEN) {
    return res.status(200).send(String(challenge ?? ""));
  }
  return res.sendStatus(403);
});

// Verify the request really came from Meta (HMAC-SHA256 of the raw body).
function verifyMetaSignature(req) {
  if (!META_APP_SECRET) return false;
  const sig = req.get("x-hub-signature-256") || "";
  const expected = "sha256=" + crypto.createHmac("sha256", META_APP_SECRET).update(req.rawBody || Buffer.alloc(0)).digest("hex");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Fetch one lead's field data from the Graph API.
async function fetchMetaLead(leadgenId) {
  const fields = "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic";
  const url = `${META_GRAPH_BASE}/${META_GRAPH_VERSION}/${encodeURIComponent(leadgenId)}`
    + `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(META_PAGE_TOKEN || "")}`;
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error("Graph API error: " + JSON.stringify(data.error || data));
  return data;
}

// Normalise Meta's field_data array into common fields + a flat map.
function parseFieldData(fieldData = []) {
  const map = {};
  for (const f of fieldData) map[f.name] = Array.isArray(f.values) ? f.values.join(", ") : "";
  const email = map.email || map.email_address || "";
  const phone = (map.phone_number || map.phone || map.work_phone_number || "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  let first = map.first_name || "", last = map.last_name || "";
  let full = map.full_name || map.name || "";
  if (!full && (first || last)) full = `${first} ${last}`.trim();
  if (full && !first && !last) { const p = full.split(/\s+/); first = p.shift() || ""; last = p.join(" "); }
  return { map, email, phone, first, last, full };
}

// In-process idempotency so Meta retries don't double-create (best effort).
const seenMetaLeads = new Set();

async function processMetaLead(leadgenId) {
  if (seenMetaLeads.has(leadgenId)) { console.log("Meta lead already processed:", leadgenId); return; }
  const lead = await fetchMetaLead(leadgenId);
  const p = parseFieldData(lead.field_data);

  // Lead Source (text) = the Meta campaign name; falls back to a generic label for
  // organic leads with no campaign. Lead Source Group (status) buckets it as "Meta Ads".
  let campaign = lead.campaign_name || "";
  // If Meta returned the campaign ID (or nothing) instead of a readable name, resolve it.
  if ((!campaign || /^\d+$/.test(campaign)) && lead.campaign_id) {
    const name = await resolveMetaCampaignName(lead.campaign_id);
    if (name) campaign = name;
  }
  const leadSourceValue = campaign || META_LEAD_SOURCE;

  const columnValues = {};
  if (COLS.email && p.email) columnValues[COLS.email] = { email: p.email, text: p.email };
  if (COLS.phone && p.phone) columnValues[COLS.phone] = { phone: p.phone, countryShortName: "US" };
  if (COLS.status)           columnValues[COLS.status] = { label: STATUS_LABEL };
  if (COLS.source)           columnValues[COLS.source] = leadSourceValue;
  if (COLS.sourceGroup)      columnValues[COLS.sourceGroup] = { label: META_SOURCE_GROUP };
  // Meta ad hierarchy → attribution columns (parity with the web form's UTM columns).
  if (COLS.utmSource)                        columnValues[COLS.utmSource]   = "meta";
  if (COLS.utmCampaign && campaign)          columnValues[COLS.utmCampaign] = campaign;
  if (COLS.utmAdGroup && lead.adset_name)     columnValues[COLS.utmAdGroup]  = lead.adset_name;
  if (COLS.utmKeyword && lead.ad_name)        columnValues[COLS.utmKeyword]  = lead.ad_name;
  // Notes: every answer (incl. custom questions) + Meta IDs for traceability.
  if (COLS.notes) {
    const lines = [`Source: ${leadSourceValue}`, `Lead Source Group: ${META_SOURCE_GROUP}`];
    for (const [k, v] of Object.entries(p.map)) lines.push(`${k}: ${v}`);
    lines.push("", "Meta:",
      `form_id: ${lead.form_id || "—"}`,
      `campaign: ${lead.campaign_name || "—"}`,
      `ad set: ${lead.adset_name || "—"}`,
      `ad: ${lead.ad_name || "—"}`,
      `platform: ${lead.platform || "—"}`,
      `leadgen_id: ${leadgenId}`,
      `created: ${lead.created_time || "—"}`);
    columnValues[COLS.notes] = { text: lines.join("\n") };
  }

  const itemName = p.full || p.email || `Meta Lead ${leadgenId}`;
  const result = await mondayCreateItem(itemName, columnValues);
  if (!result.ok) {
    console.error("Meta→Monday create FAILED. item=" + JSON.stringify(itemName)
      + " cols=" + JSON.stringify(columnValues)
      + " resp=" + JSON.stringify(result.data));
    throw new Error("Monday create failed");
  }
  seenMetaLeads.add(leadgenId);
  console.log("Meta lead created in Monday:", { leadgenId, monday_item_id: result.id, name: itemName });
}

// 2) Receive leadgen events.
app.post("/webhooks/meta", async (req, res) => {
  if (!verifyMetaSignature(req)) {
    console.warn("Meta webhook: bad or missing signature");
    return res.sendStatus(403);
  }
  const body = req.body || {};
  if (body.object !== "page") return res.sendStatus(200);

  const ids = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "leadgen" && change.value && change.value.leadgen_id) {
        ids.push(String(change.value.leadgen_id));
      }
    }
  }
  if (!ids.length) return res.sendStatus(200);

  if (!MONDAY_TOKEN || !MONDAY_BOARD_ID || !META_PAGE_TOKEN) {
    console.error("Meta webhook: not fully configured (Monday or Meta token missing)");
    return res.sendStatus(500); // 5xx → Meta will retry once configured
  }

  try {
    for (const id of ids) await processMetaLead(id);
    return res.sendStatus(200);
  } catch (err) {
    console.error("Meta webhook processing error:", err?.message || err);
    return res.sendStatus(500); // let Meta retry transient failures
  }
});

// Health check for Fly.
app.get("/healthz", (_req, res) => res.type("text").send("ok"));

// Serve the static site from public/ (same directory Cloudflare deploys).
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"], dotfiles: "ignore" }));

app.listen(PORT, () => console.log(`YourLifeBroker listening on :${PORT}`));
