/* West-Coast Recruitment Mailer → WATI (WhatsApp) bridge.
   Runs on Vercel as a serverless function at /api/wati.
   The WATI token stays here on the server (Vercel environment variables) and is never sent to browsers.
   Only HR users signed in to the app (Supabase) can use it.

   Vercel → Project → Settings → Environment Variables:
     WATI_API_ENDPOINT   e.g. https://live-mt-server.wati.io/123456   (WATI → API Docs → API Endpoint)
     WATI_API_TOKEN      the Access Token from the same WATI page (with or without "Bearer ")
     SUPABASE_URL        https://gattnafiadinackpztwr.supabase.co
     SUPABASE_ANON_KEY   the anon public key (same as in config.js)                                    */
module.exports = async (req, res) => {
  const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
  if (req.method !== "POST") return send(405, { error: "Use POST." });

  const WATI_URL = String(process.env.WATI_API_ENDPOINT || "").trim().replace(/\/+$/, "");
  const WATI_TOKEN = String(process.env.WATI_API_TOKEN || "").trim().replace(/^Bearer\s+/i, "");
  const SUPA_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const SUPA_ANON = String(process.env.SUPABASE_ANON_KEY || "").trim();
  if (!WATI_URL || !WATI_TOKEN) return send(500, { error: "WATI is not set up on the server. Add WATI_API_ENDPOINT and WATI_API_TOKEN in Vercel → Settings → Environment Variables, then redeploy." });
  if (!SUPA_URL || !SUPA_ANON) return send(500, { error: "Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables, then redeploy." });

  // Only signed-in HR users
  const auth = req.headers.authorization || "";
  if (!/^Bearer\s+\S+/.test(auth)) return send(401, { error: "Please sign in to the app again." });
  try {
    const u = await fetch(SUPA_URL + "/auth/v1/user", { headers: { apikey: SUPA_ANON, Authorization: auth } });
    if (!u.ok) return send(401, { error: "Your sign-in has expired. Please sign in to the app again." });
  } catch (e) { return send(502, { error: "Could not check the sign-in: " + e.message }); }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { body = {}; } }
  body = body || {};
  const hdr = { Authorization: "Bearer " + WATI_TOKEN, Accept: "application/json" };
  const relay = async (r) => { const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = { info: text.slice(0, 500) }; } return send(r.ok ? 200 : r.status, j); };

  try {
    if (body.action === "templates") {
      const r = await fetch(WATI_URL + "/api/v1/getMessageTemplates?pageSize=500&pageNumber=1", { headers: hdr });
      return relay(r);
    }
    if (body.action === "send") {
      const num = String(body.whatsappNumber || "").replace(/\D/g, "");
      if (num.length < 10 || num.length > 15) return send(400, { result: false, info: "Invalid WhatsApp number: " + (body.whatsappNumber || "(blank)") });
      if (!body.template_name) return send(400, { result: false, info: "No WhatsApp template chosen." });
      const params = Array.isArray(body.parameters) ? body.parameters.map(p => ({ name: String(p.name), value: String(p.value ?? "") })) : [];
      const r = await fetch(WATI_URL + "/api/v1/sendTemplateMessage?whatsappNumber=" + encodeURIComponent(num), {
        method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, hdr),
        body: JSON.stringify({ template_name: body.template_name, broadcast_name: String(body.broadcast_name || "Recruitment").slice(0, 100), parameters: params })
      });
      return relay(r);
    }
    return send(400, { error: "Unknown action." });
  } catch (e) { return send(502, { error: "Could not reach WATI: " + e.message }); }
};
