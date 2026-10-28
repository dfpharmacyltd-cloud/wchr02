/* West-Coast Recruitment Mailer → user accounts (Admin only).
   Runs on Vercel at /api/users. Uses the Supabase service-role key, which stays on the server.

   Vercel → Project → Settings → Environment Variables:
     SUPABASE_URL               https://gattnafiadinackpztwr.supabase.co
     SUPABASE_ANON_KEY          the anon public key (same as config.js)
     SUPABASE_SERVICE_ROLE_KEY  Supabase → Project Settings → API Keys → service_role (SECRET – never in the browser or GitHub) */
module.exports = async (req, res) => {
  const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
  if (req.method !== "POST") return send(405, { error: "Use POST." });
  const URL_ = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const ANON = String(process.env.SUPABASE_ANON_KEY || "").trim();
  const SR = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!URL_ || !ANON || !SR) return send(500, { error: "Add SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables, then Redeploy." });

  // Caller must be a signed-in Admin
  const auth = req.headers.authorization || "";
  let me;
  try {
    const r = await fetch(URL_ + "/auth/v1/user", { headers: { apikey: ANON, Authorization: auth } });
    if (!r.ok) return send(401, { error: "Please sign in again." });
    me = await r.json();
  } catch (e) { return send(502, { error: "Could not check the sign-in: " + e.message }); }
  if (!me || !me.app_metadata || me.app_metadata.role !== "admin") return send(403, { error: "Only an Admin can manage users." });

  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b || "{}"); } catch { b = {}; } } b = b || {};
  const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
  const call = async (method, path, body) => {
    const r = await fetch(URL_ + "/auth/v1/admin" + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch { j = { msg: t }; }
    if (!r.ok) throw new Error(j.msg || j.message || j.error_description || j.error || ("HTTP " + r.status));
    return j;
  };
  const shape = u => ({ id: u.id, email: u.email, name: (u.user_metadata || {}).name || "", code: (u.app_metadata || {}).code || "",
    role: (u.app_metadata || {}).role === "admin" ? "Admin" : ((u.app_metadata || {}).app_role || "HR Executive"),
    disabled: !!(u.banned_until && Date.parse(u.banned_until) > Date.now()), lastSignIn: u.last_sign_in_at || "", created: u.created_at || "" });
  const cleanCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  const ROLES = ["HR Manager", "HR Executive", "Viewer"];

  try {
    if (b.action === "list") {
      const j = await call("GET", "/users?per_page=500");
      return send(200, { users: (j.users || []).map(shape) });
    }
    if (b.action === "create") {
      const email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(400, { error: "Enter a valid email." });
      if (password.length < 8) return send(400, { error: "Password must be at least 8 characters." });
      const code = cleanCode(b.code) || cleanCode(email.split("@")[0].slice(0, 2));
      if (code === "WC") return send(400, { error: "WC is reserved for Admin. Choose another short code." });
      const list = (await call("GET", "/users?per_page=500")).users || [];
      if (list.some(u => ((u.app_metadata || {}).code || "") === code)) return send(400, { error: "Short code " + code + " is already used by another user." });
      const role = ROLES.includes(b.role) ? b.role : "HR Executive";
      const u = await call("POST", "/users", { email, password, email_confirm: true, user_metadata: { name: String(b.name || "").slice(0, 60) }, app_metadata: { role: "user", app_role: role, code } });
      return send(200, { user: shape(u) });
    }
    if (b.action === "update") {
      if (!b.id) return send(400, { error: "Which user?" });
      if (b.id === me.id && (b.disabled || b.role)) return send(400, { error: "You cannot change or disable your own Admin account here." });
      const cur = await call("GET", "/users/" + encodeURIComponent(b.id));
      const patch = {};
      if (b.password) { if (String(b.password).length < 8) return send(400, { error: "Password must be at least 8 characters." }); patch.password = String(b.password); }
      if (b.role && ROLES.includes(b.role)) patch.app_metadata = Object.assign({}, cur.app_metadata || {}, { app_role: b.role });
      if (b.name !== undefined) patch.user_metadata = Object.assign({}, cur.user_metadata || {}, { name: String(b.name).slice(0, 60) });
      if (b.disabled !== undefined) patch.ban_duration = b.disabled ? "876000h" : "none";
      const u = await call("PUT", "/users/" + encodeURIComponent(b.id), patch);
      return send(200, { user: shape(u) });
    }
    if (b.action === "delete") {
      if (!b.id || b.id === me.id) return send(400, { error: "You cannot delete your own Admin account." });
      await call("DELETE", "/users/" + encodeURIComponent(b.id));
      return send(200, { ok: true });
    }
    return send(400, { error: "Unknown action." });
  } catch (e) { return send(400, { error: e.message }); }
};
