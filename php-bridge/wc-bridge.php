<?php
/* =====================================================================
   WESTCOAST AI Procurement Agent — MySQL bridge (for phpMyAdmin hosting)
   Upload this ONE file to your PHP hosting (e.g. public_html/wc-bridge.php).
   The procurement app (Vercel or PC) saves all data through it into MySQL.
   Works on PHP 7.4+ with MySQL 5.7+ / MariaDB 10.2+.
   ===================================================================== */

// ---------- 1. EDIT THESE 5 LINES ----------
$DB_HOST = 'localhost';
$DB_NAME = 'your_database_name';
$DB_USER = 'your_database_user';
$DB_PASS = 'your_database_password';
$BRIDGE_KEY = 'CHANGE_ME_to_a_long_random_secret_40_chars_min';   // same value as PHP_BRIDGE_KEY in Vercel
// -------------------------------------------

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => true, 'service' => 'wc-bridge', 'hint' => 'POST only'], 200);
if (strlen($BRIDGE_KEY) < 32 || strpos($BRIDGE_KEY, 'CHANGE_ME') === 0) out(['error' => 'Set $BRIDGE_KEY (32+ characters) at the top of wc-bridge.php'], 500);
$given = isset($_SERVER['HTTP_X_BRIDGE_KEY']) ? $_SERVER['HTTP_X_BRIDGE_KEY'] : '';
if (!hash_equals(hash('sha256', $BRIDGE_KEY), hash('sha256', $given))) { usleep(300000); out(['error' => 'Bridge key is wrong'], 401); }

$req = json_decode(file_get_contents('php://input'), true);
if (!is_array($req)) out(['error' => 'Bad JSON body'], 400);
$action = isset($req['action']) ? $req['action'] : '';
$COLL_RE = '/^[a-z]{2,20}$/';
$ID_RE = '/^[A-Za-z0-9_|.@-]{1,200}$/';
function coll_ok($c) { global $COLL_RE; return is_string($c) && preg_match($COLL_RE, $c); }
function id_ok($i) { global $ID_RE; return is_string($i) && preg_match($ID_RE, $i); }

try {
  $pdo = new PDO("mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4", $DB_USER, $DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
} catch (Exception $e) { out(['error' => 'MySQL connection failed — check DB name/user/password in wc-bridge.php'], 500); }

function ensure_table($pdo) {
  $pdo->exec("CREATE TABLE IF NOT EXISTS wc_records (
    coll VARCHAR(20) NOT NULL, id VARCHAR(200) NOT NULL, doc LONGTEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (coll, id), KEY idx_coll (coll)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  // Friendly read-only views so the data is easy to browse in phpMyAdmin
  $j = function ($f) { return "JSON_UNQUOTE(JSON_EXTRACT(doc,'$.$f'))"; };
  $views = [
    'v_suppliers' => "SELECT id, IFNULL({$j('dept')},'RM') AS dept, {$j('name')} AS company, {$j('city')} AS city, {$j('state')} AS state, {$j('country')} AS country, {$j('website')} AS website, {$j('type')} AS type, {$j('origin')} AS found_by, JSON_UNQUOTE(JSON_EXTRACT(doc,'$.materials')) AS materials, {$j('createdAt')} AS created_at FROM wc_records WHERE coll='suppliers' AND JSON_EXTRACT(doc,'$.mergedInto') IS NULL",
    'v_contacts' => "SELECT c.id, IFNULL(JSON_UNQUOTE(JSON_EXTRACT(c.doc,'$.dept')),'RM') AS dept, JSON_UNQUOTE(JSON_EXTRACT(s.doc,'$.name')) AS company, JSON_UNQUOTE(JSON_EXTRACT(c.doc,'$.kind')) AS type, JSON_UNQUOTE(JSON_EXTRACT(c.doc,'$.value')) AS value, JSON_UNQUOTE(JSON_EXTRACT(c.doc,'$.person')) AS person, JSON_UNQUOTE(JSON_EXTRACT(c.doc,'$.designation')) AS designation, JSON_UNQUOTE(JSON_EXTRACT(c.doc,'$.provider')) AS source, JSON_UNQUOTE(JSON_EXTRACT(c.doc,'$.decision')) AS review FROM wc_records c LEFT JOIN wc_records s ON s.coll='suppliers' AND s.id=JSON_UNQUOTE(JSON_EXTRACT(c.doc,'$.supplierId')) WHERE c.coll='contacts'",
    'v_purchase_requests' => "SELECT id, IFNULL({$j('dept')},'RM') AS dept, {$j('code')} AS request_id, {$j('api')} AS api, {$j('qty')} AS qty, {$j('unit')} AS unit, {$j('pharmacopoeia')} AS pharmacopoeia, {$j('countries')} AS country, {$j('owner')} AS owner, {$j('status')} AS status, {$j('createdAt')} AS created_at FROM wc_records WHERE coll='prs'",
    'v_messages' => "SELECT id, IFNULL({$j('dept')},'RM') AS dept, {$j('channel')} AS channel, {$j('to')} AS sent_to, {$j('subject')} AS subject, {$j('status')} AS status, {$j('sentAt')} AS sent_at FROM wc_records WHERE coll='rfqs'",
    'v_replies' => "SELECT id, IFNULL({$j('dept')},'RM') AS dept, {$j('from')} AS from_email, {$j('subject')} AS subject, {$j('receivedAt')} AS received_at, {$j('reviewStatus')} AS review FROM wc_records WHERE coll='replies'",
    'v_inquiries' => "SELECT id, IFNULL({$j('dept')},'RM') AS dept, {$j('code')} AS inquiry, {$j('status')} AS status, {$j('deliveryTime')} AS delivery_time, {$j('deliveryLocation')} AS delivery_location, {$j('createdByName')} AS created_by, {$j('createdAt')} AS created_at FROM wc_records WHERE coll='inquiries'",
    'v_quotes' => "SELECT q.id, IFNULL(JSON_UNQUOTE(JSON_EXTRACT(q.doc,'$.dept')),'RM') AS dept, JSON_UNQUOTE(JSON_EXTRACT(i.doc,'$.code')) AS inquiry, JSON_UNQUOTE(JSON_EXTRACT(q.doc,'$.supplierName')) AS vendor, JSON_UNQUOTE(JSON_EXTRACT(q.doc,'$.submittedAt')) AS submitted_at, JSON_EXTRACT(q.doc,'$.items') AS rates FROM wc_records q LEFT JOIN wc_records i ON i.coll='inquiries' AND i.id=JSON_UNQUOTE(JSON_EXTRACT(q.doc,'$.inquiryId')) WHERE q.coll='quotes'",
    'v_audit' => "SELECT id, {$j('at')} AS at, {$j('by')} AS by_user, {$j('action')} AS action, {$j('detail')} AS detail FROM wc_records WHERE coll='audit'"
  ];
  foreach ($views as $name => $sql) { try { $pdo->exec("CREATE OR REPLACE VIEW $name AS $sql"); } catch (Exception $e) { /* old MySQL without JSON functions: views skipped, data still saved */ } }
}

try {
  if ($action === 'init') { ensure_table($pdo); out(['ok' => true]); }
  if ($action === 'all') {
    $colls = isset($req['colls']) && is_array($req['colls']) ? array_values(array_filter($req['colls'], 'coll_ok')) : [];
    $res = []; foreach ($colls as $c) $res[$c] = [];
    if ($colls) {
      $in = implode(',', array_fill(0, count($colls), '?'));
      $st = $pdo->prepare("SELECT coll, doc FROM wc_records WHERE coll IN ($in) ORDER BY coll, id");
      $st->execute($colls);
      while ($r = $st->fetch()) $res[$r['coll']][] = json_decode($r['doc'], true);
    }
    out($res);
  }
  if ($action === 'get') {
    if (!coll_ok($req['coll'] ?? null) || !id_ok($req['id'] ?? null)) out(['error' => 'Bad coll/id'], 400);
    $st = $pdo->prepare('SELECT doc FROM wc_records WHERE coll=? AND id=?'); $st->execute([$req['coll'], $req['id']]);
    $r = $st->fetch(); out(['doc' => $r ? json_decode($r['doc'], true) : null]);
  }
  if ($action === 'put') {
    if (!coll_ok($req['coll'] ?? null) || !id_ok($req['id'] ?? null) || !is_array($req['doc'] ?? null)) out(['error' => 'Bad coll/id/doc'], 400);
    $doc = json_encode($req['doc'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!empty($req['insertOnly'])) {
      try { $st = $pdo->prepare('INSERT INTO wc_records (coll,id,doc) VALUES (?,?,?)'); $st->execute([$req['coll'], $req['id'], $doc]); }
      catch (PDOException $e) { if ($e->getCode() === '23000') out(['error' => 'Audit entries are append-only'], 409); throw $e; }
    } else {
      $st = $pdo->prepare('INSERT INTO wc_records (coll,id,doc) VALUES (?,?,?) ON DUPLICATE KEY UPDATE doc=VALUES(doc), updated_at=CURRENT_TIMESTAMP');
      $st->execute([$req['coll'], $req['id'], $doc]);
    }
    out(['ok' => true]);
  }
  if ($action === 'del') {
    if (!coll_ok($req['coll'] ?? null) || !id_ok($req['id'] ?? null)) out(['error' => 'Bad coll/id'], 400);
    $st = $pdo->prepare('DELETE FROM wc_records WHERE coll=? AND id=?'); $st->execute([$req['coll'], $req['id']]);
    out(['ok' => true]);
  }
  out(['error' => 'Unknown action'], 400);
} catch (PDOException $e) {
  if (strpos($e->getMessage(), "doesn't exist") !== false) { ensure_table($pdo); out(['error' => 'Table was just created — please retry'], 503); }
  out(['error' => 'Database error: ' . substr($e->getMessage(), 0, 200)], 500);
}
