const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isLikelyEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

async function supabaseFetch(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase environment variables in Netlify.");
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

  if (!res.ok) {
    const message = data && data.message ? data.message : `Supabase request failed: ${res.status}`;
    throw new Error(message);
  }

  return data;
}

async function getOrCreateLearner(email) {
  const email_normalized = normalizeEmail(email);

  const existing = await supabaseFetch(
    `learners?select=id,email,email_normalized&email_normalized=eq.${encodeURIComponent(email_normalized)}&limit=1`,
    { method: "GET", headers: { Prefer: "" } }
  );

  if (Array.isArray(existing) && existing.length) {
    const learner = existing[0];
    await supabaseFetch(`learners?id=eq.${learner.id}`, {
      method: "PATCH",
      body: JSON.stringify({ last_seen_at: new Date().toISOString() })
    });
    return { learner, isNew: false };
  }

  const created = await supabaseFetch("learners", {
    method: "POST",
    body: JSON.stringify({ email: email_normalized, email_normalized })
  });

  return { learner: created[0], isNew: true };
}

async function getProgress(learnerId) {
  const rows = await supabaseFetch(
    `learner_progress?select=payload,updated_at,app_version,deck_version&learner_id=eq.${learnerId}&limit=1`,
    { method: "GET", headers: { Prefer: "" } }
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function saveProgress(learnerId, payload, appVersion, deckVersion) {
  const rows = await supabaseFetch("learner_progress?on_conflict=learner_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      learner_id: learnerId,
      app_version: appVersion || payload?.appVersion || "BrainForge_SAFEStudy_v1",
      deck_version: deckVersion || payload?.deckVersion || "SAFE_MASTER_v1",
      payload: payload || {},
      updated_at: new Date().toISOString()
    })
  });
  return rows[0];
}

function getQueryParam(event, name) {
  return event.queryStringParameters && event.queryStringParameters[name];
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(200, { ok: true });

  try {
    if (event.httpMethod === "GET") {
      const email = normalizeEmail(getQueryParam(event, "learner") || getQueryParam(event, "email"));
      if (!isLikelyEmail(email)) return response(400, { error: "A valid email address is required." });

      const { learner, isNew } = await getOrCreateLearner(email);
      const progress = await getProgress(learner.id);
      return response(200, {
        ok: true,
        learnerId: learner.id,
        isNew,
        payload: progress ? progress.payload : null,
        updatedAt: progress ? progress.updated_at : null,
        appVersion: progress ? progress.app_version : null,
        deckVersion: progress ? progress.deck_version : null
      });
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try { body = JSON.parse(event.body || "{}"); } catch (_) { body = {}; }

      const email = normalizeEmail(body.email || body.learner);
      if (!isLikelyEmail(email)) return response(400, { error: "A valid email address is required." });

      const { learner, isNew } = await getOrCreateLearner(email);

      // Supports the current BrainForge HTML, which POSTs { learner, payload }.
      // Also supports future action-based calls.
      if (!body.action || body.action === "save") {
        const saved = await saveProgress(learner.id, body.payload || {}, body.appVersion, body.deckVersion);
        return response(200, {
          ok: true,
          learnerId: learner.id,
          isNew,
          payload: saved.payload,
          updatedAt: saved.updated_at
        });
      }

      if (body.action === "init") {
        const progress = await getProgress(learner.id);
        return response(200, {
          ok: true,
          learnerId: learner.id,
          isNew,
          payload: progress ? progress.payload : null,
          updatedAt: progress ? progress.updated_at : null
        });
      }

      return response(400, { error: "Unsupported action." });
    }

    return response(405, { error: "Use GET or POST." });
  } catch (error) {
    return response(500, { error: error.message || "Cloud sync failed." });
  }
};
