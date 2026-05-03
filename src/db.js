// src/db.js
// Database initialization using better-sqlite3 (faster, synchronous)

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

/**
 * Initialize database and create tables if they don't exist
 */
function initDb(dbPath = null) {
  // Use in-memory DB for testing or file-based for persistence
  const actualPath = dbPath || path.join(__dirname, '..', 'data', 'yever.db');

  // Ensure directory exists
  const dir = path.dirname(actualPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(actualPath);
  console.log(`[db] Conectado ao banco: ${actualPath}`);

  // Enable foreign keys
  db.pragma('journal_mode = WAL');

  createTables();

  return db;
}

/**
 * Create tables schema
 */
function createTables() {
  const sql = `
    CREATE TABLE IF NOT EXISTS checkouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      yever_checkout_id TEXT UNIQUE NOT NULL,
      yever_reference TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      customer_phone_e164 TEXT,
      value_total REAL,
      currency TEXT DEFAULT 'BRL',
      products TEXT,
      recovery_url TEXT,
      last_step TEXT,
      order_status TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'recovered_message_sent', 'ignored')),
      created_at TEXT,
      abandoned_at TEXT,
      paid_at TEXT,
      message_sent_at TEXT,
      octadesk_response TEXT,
      raw_payload TEXT,
      created_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_checkouts_status ON checkouts(status);
    CREATE INDEX IF NOT EXISTS idx_checkouts_customer_email ON checkouts(customer_email);
    CREATE INDEX IF NOT EXISTS idx_checkouts_customer_phone ON checkouts(customer_phone_e164);
    CREATE INDEX IF NOT EXISTS idx_checkouts_created_at ON checkouts(created_at);
    CREATE INDEX IF NOT EXISTS idx_checkouts_abandoned_at ON checkouts(abandoned_at);
  `;

  try {
    db.exec(sql);
    console.log('[db] Tabelas criadas com sucesso');
  } catch (err) {
    console.error('[db] Erro ao criar tabelas:', err.message);
    throw err;
  }
}

/**
 * Get database instance
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

/**
 * Insert or update a checkout
 */
function upsertCheckout(checkoutData) {
  const {
    yever_checkout_id,
    yever_reference,
    customer_name,
    customer_email,
    customer_phone,
    customer_phone_e164,
    value_total,
    currency,
    products,
    recovery_url,
    last_step,
    order_status,
    status,
    created_at,
    abandoned_at,
    paid_at,
    raw_payload
  } = checkoutData;

  const sql = `
    INSERT INTO checkouts (
      yever_checkout_id, yever_reference, customer_name, customer_email,
      customer_phone, customer_phone_e164, value_total, currency, products,
      recovery_url, last_step, order_status, status, created_at,
      abandoned_at, paid_at, raw_payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(yever_reference) DO UPDATE SET
      customer_name = excluded.customer_name,
      customer_email = excluded.customer_email,
      customer_phone = excluded.customer_phone,
      customer_phone_e164 = excluded.customer_phone_e164,
      value_total = excluded.value_total,
      products = excluded.products,
      recovery_url = excluded.recovery_url,
      last_step = excluded.last_step,
      order_status = excluded.order_status,
      status = excluded.status,
      abandoned_at = excluded.abandoned_at,
      paid_at = excluded.paid_at,
      updated_timestamp = CURRENT_TIMESTAMP,
      raw_payload = excluded.raw_payload
  `;

  const stmt = db.prepare(sql);
  const result = stmt.run(
    yever_checkout_id,
    yever_reference,
    customer_name,
    customer_email,
    customer_phone,
    customer_phone_e164,
    value_total,
    currency,
    JSON.stringify(products),
    recovery_url,
    last_step,
    order_status,
    status,
    created_at,
    abandoned_at,
    paid_at,
    JSON.stringify(raw_payload)
  );

  return { id: result.lastInsertRowid, changes: result.changes };
}

/**
 * Find pending checkouts older than given minutes
 */
function findPendingCheckoutsOlderThan(minutes) {
  const sql = `
    SELECT * FROM checkouts
    WHERE status = 'pending'
      AND abandoned_at IS NOT NULL
      AND message_sent_at IS NULL
      AND datetime(abandoned_at) < datetime('now', '-' || ? || ' minutes')
    ORDER BY abandoned_at ASC
  `;

  const stmt = db.prepare(sql);
  return stmt.all(minutes);
}

/**
 * Find most recent checkout for email/phone
 */
function findMostRecentCheckoutByEmailOrPhone(email, phone) {
  const sql = `
    SELECT * FROM checkouts
    WHERE (customer_email = ? OR customer_phone_e164 = ?)
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const stmt = db.prepare(sql);
  return stmt.get(email, phone) || null;
}

/**
 * Update checkout status and message_sent_at
 */
function markMessageSent(checkoutId, octadeskResponse) {
  const sql = `
    UPDATE checkouts
    SET status = 'recovered_message_sent',
        message_sent_at = CURRENT_TIMESTAMP,
        octadesk_response = ?
    WHERE id = ?
  `;

  const stmt = db.prepare(sql);
  const result = stmt.run(JSON.stringify(octadeskResponse), checkoutId);
  return result.changes;
}

/**
 * Mark checkout as paid (update status)
 */
function markCheckoutAsPaid(yeverReference, paidAt) {
  const sql = `
    UPDATE checkouts
    SET status = 'paid',
        paid_at = ?,
        updated_timestamp = CURRENT_TIMESTAMP
    WHERE yever_reference = ?
  `;

  const stmt = db.prepare(sql);
  const result = stmt.run(paidAt, yeverReference);
  return result.changes;
}

/**
 * Get checkout by yever_reference
 */
function getCheckoutByReference(yeverReference) {
  const sql = `SELECT * FROM checkouts WHERE yever_reference = ?`;

  const stmt = db.prepare(sql);
  return stmt.get(yeverReference) || null;
}

/**
 * Get all checkouts (for debug)
 */
function getAllCheckouts() {
  const sql = `SELECT * FROM checkouts ORDER BY created_at DESC LIMIT 50`;
  const stmt = db.prepare(sql);
  return stmt.all();
}

/**
 * Close database connection
 */
function closeDb() {
  if (db) {
    db.close();
    console.log('[db] Conexão fechada');
    db = null;
  }
}

module.exports = {
  initDb,
  getDb,
  closeDb,
  upsertCheckout,
  findPendingCheckoutsOlderThan,
  findMostRecentCheckoutByEmailOrPhone,
  markMessageSent,
  markCheckoutAsPaid,
  getCheckoutByReference,
  getAllCheckouts
};
