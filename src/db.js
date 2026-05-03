// src/db.js
// Database initialization using PostgreSQL (via DATABASE_URL env var)

const { Pool } = require('pg');

let pool = null;

/**
 * Initialize database connection pool
 */
function initDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false // Required for Railway
    }
  });

  console.log('[db] Pool de conexões criado');

  // Test connection
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('[db] ❌ Erro ao conectar:', err.message);
    } else {
      console.log('[db] ✓ Conectado ao Postgres');
    }
  });

  // Create tables
  createTables();

  return pool;
}

/**
 * Create tables schema
 */
function createTables() {
  const sql = `
    CREATE TABLE IF NOT EXISTS checkouts (
      id SERIAL PRIMARY KEY,
      yever_checkout_id TEXT UNIQUE NOT NULL,
      yever_reference TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      customer_phone_e164 TEXT,
      value_total NUMERIC,
      currency TEXT DEFAULT 'BRL',
      products JSONB,
      recovery_url TEXT,
      last_step TEXT,
      order_status TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'recovered_message_sent', 'ignored')),
      created_at TIMESTAMP,
      abandoned_at TIMESTAMP,
      paid_at TIMESTAMP,
      message_sent_at TIMESTAMP,
      octadesk_response JSONB,
      raw_payload JSONB,
      created_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_checkouts_status ON checkouts(status);
    CREATE INDEX IF NOT EXISTS idx_checkouts_customer_email ON checkouts(customer_email);
    CREATE INDEX IF NOT EXISTS idx_checkouts_customer_phone ON checkouts(customer_phone_e164);
    CREATE INDEX IF NOT EXISTS idx_checkouts_created_at ON checkouts(created_at);
    CREATE INDEX IF NOT EXISTS idx_checkouts_abandoned_at ON checkouts(abandoned_at);
  `;

  pool.query(sql, (err) => {
    if (err) {
      console.error('[db] Erro ao criar tabelas:', err.message);
    } else {
      console.log('[db] ✓ Tabelas criadas com sucesso');
    }
  });
}

/**
 * Get pool instance
 */
function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return pool;
}

/**
 * Insert or update a checkout
 */
function upsertCheckout(checkoutData) {
  return new Promise((resolve, reject) => {
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT(yever_reference) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        customer_email = EXCLUDED.customer_email,
        customer_phone = EXCLUDED.customer_phone,
        customer_phone_e164 = EXCLUDED.customer_phone_e164,
        value_total = EXCLUDED.value_total,
        products = EXCLUDED.products,
        recovery_url = EXCLUDED.recovery_url,
        last_step = EXCLUDED.last_step,
        order_status = EXCLUDED.order_status,
        status = EXCLUDED.status,
        abandoned_at = EXCLUDED.abandoned_at,
        paid_at = EXCLUDED.paid_at,
        updated_timestamp = CURRENT_TIMESTAMP,
        raw_payload = EXCLUDED.raw_payload
      RETURNING id
    `;

    const params = [
      yever_checkout_id,
      yever_reference,
      customer_name,
      customer_email,
      customer_phone,
      customer_phone_e164,
      value_total,
      currency,
      products ? JSON.stringify(products) : null,
      recovery_url,
      last_step,
      order_status,
      status,
      created_at,
      abandoned_at,
      paid_at,
      raw_payload ? JSON.stringify(raw_payload) : null
    ];

    pool.query(sql, params, (err, result) => {
      if (err) {
        reject(err);
      } else {
        const id = result.rows[0]?.id || null;
        resolve({ id, changes: result.rowCount });
      }
    });
  });
}

/**
 * Find pending checkouts older than given minutes
 */
function findPendingCheckoutsOlderThan(minutes) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM checkouts
      WHERE status = 'pending'
        AND abandoned_at IS NOT NULL
        AND message_sent_at IS NULL
        AND abandoned_at < NOW() - INTERVAL '1 minute' * $1
      ORDER BY abandoned_at ASC
    `;

    pool.query(sql, [minutes], (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result.rows || []);
      }
    });
  });
}

/**
 * Find most recent checkout for email/phone
 */
function findMostRecentCheckoutByEmailOrPhone(email, phone) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM checkouts
      WHERE (customer_email = $1 OR customer_phone_e164 = $2)
      ORDER BY created_at DESC
      LIMIT 1
    `;

    pool.query(sql, [email, phone], (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result.rows[0] || null);
      }
    });
  });
}

/**
 * Update checkout status and message_sent_at
 */
function markMessageSent(checkoutId, octadeskResponse) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE checkouts
      SET status = 'recovered_message_sent',
          message_sent_at = CURRENT_TIMESTAMP,
          octadesk_response = $1
      WHERE id = $2
    `;

    pool.query(sql, [octadeskResponse ? JSON.stringify(octadeskResponse) : null, checkoutId], (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result.rowCount);
      }
    });
  });
}

/**
 * Mark checkout as paid (update status)
 */
function markCheckoutAsPaid(yeverReference, paidAt) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE checkouts
      SET status = 'paid',
          paid_at = $1,
          updated_timestamp = CURRENT_TIMESTAMP
      WHERE yever_reference = $2
    `;

    pool.query(sql, [paidAt, yeverReference], (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result.rowCount);
      }
    });
  });
}

/**
 * Get checkout by yever_reference
 */
function getCheckoutByReference(yeverReference) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM checkouts WHERE yever_reference = $1`;

    pool.query(sql, [yeverReference], (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result.rows[0] || null);
      }
    });
  });
}

/**
 * Get all checkouts (for debug)
 */
function getAllCheckouts() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM checkouts ORDER BY created_at DESC LIMIT 50`;

    pool.query(sql, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result.rows || []);
      }
    });
  });
}

/**
 * Close database connection
 */
function closeDb() {
  return new Promise((resolve, reject) => {
    if (pool) {
      pool.end((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('[db] Conexão fechada');
          pool = null;
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  initDb,
  getPool,
  closeDb,
  upsertCheckout,
  findPendingCheckoutsOlderThan,
  findMostRecentCheckoutByEmailOrPhone,
  markMessageSent,
  markCheckoutAsPaid,
  getCheckoutByReference,
  getAllCheckouts
};
