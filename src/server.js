// src/server.js
// Yever Recovery Bridge — Fase 1
// Objetivo: receber e registrar webhooks da Yever para inspecionar o payload real.
// NÃO envia nada para Octadesk. NÃO mexe na Shopify. Apenas captura e loga.

require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { classifyYeverEvent, eventToCheckoutRecord } = require('./services/webhook-router');
const { normalizePhoneBR } = require('./services/normalize-phone');
const { startRecoveryJob, stopRecoveryJob, forceRecoveryCheckNow } = require('./jobs/recovery-job');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Diretórios de log
// ---------------------------------------------------------------------------
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const PAYLOADS_DIR = path.join(LOGS_DIR, 'payloads');

for (const dir of [LOGS_DIR, PAYLOADS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const ACCESS_LOG_FILE = path.join(LOGS_DIR, 'access.log');

function appendAccessLog(line) {
  const stamped = `[${new Date().toISOString()}] ${line}\n`;
  fs.appendFile(ACCESS_LOG_FILE, stamped, (err) => {
    if (err) {
      // Falha em log não deve derrubar a aplicação
      console.error('[access-log] falha ao gravar log:', err.message);
    }
  });
  // Espelho no stdout para facilitar debug
  process.stdout.write(stamped);
}

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------
// Captura o corpo bruto (raw) ANTES do parse, para podermos:
// - salvar exatamente o que a Yever enviou
// - validar assinatura HMAC no futuro (se a Yever assinar os webhooks)
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf ? buf.toString('utf8') : '';
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '2mb',
    verify: (req, _res, buf) => {
      // Não sobrescreve rawBody se já foi setado pelo express.json
      if (!req.rawBody) {
        req.rawBody = buf ? buf.toString('utf8') : '';
      }
    },
  })
);

// Logger simples para todas as requisições
app.use((req, _res, next) => {
  appendAccessLog(`${req.method} ${req.originalUrl} from ${req.ip}`);
  next();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timestampForFilename() {
  // Formato: 2026-05-03T18-31-22-123Z
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function shortId() {
  return crypto.randomBytes(4).toString('hex');
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value);
  }
}

/**
 * Salva o webhook recebido em logs/payloads/<timestamp>-<id>.json
 * Inclui método, URL, query, headers, rawBody e body parseado.
 */
function persistWebhook(req) {
  const filename = `${timestampForFilename()}-${shortId()}.json`;
  const filepath = path.join(PAYLOADS_DIR, filename);

  const record = {
    receivedAt: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    ip: req.ip,
    query: req.query,
    headers: req.headers,
    rawBody: req.rawBody || '',
    body: req.body,
  };

  fs.writeFile(filepath, safeStringify(record), (err) => {
    if (err) {
      console.error('[webhook] falha ao salvar payload:', err.message);
    } else {
      appendAccessLog(`webhook salvo em logs/payloads/${filename}`);
    }
  });

  return filename;
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

// Healthcheck
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook principal da Yever
app.post('/webhooks/yever', (req, res) => {
  // Responde rápido para a Yever, depois processa de forma assíncrona.
  res.status(200).json({ received: true });

  try {
    const filename = persistWebhook(req);
    appendAccessLog(`webhook Yever processado: ${filename}`);

    // Classifica o evento (abandonado vs pago)
    const classified = classifyYeverEvent(req.body);

    if (!classified.valid) {
      appendAccessLog(`[classify] Evento inválido: ${classified.error}`);
      return;
    }

    appendAccessLog(`[classify] Tipo de evento: ${classified.type}`);

    // Converte para formato de banco
    const checkoutRecord = eventToCheckoutRecord(classified);
    if (!checkoutRecord) {
      appendAccessLog(`[classify] Falha ao converter para registro`);
      return;
    }

    // Normaliza telefone
    if (checkoutRecord.customer_phone) {
      checkoutRecord.customer_phone_e164 = normalizePhoneBR(checkoutRecord.customer_phone);
    }

    // Grava no banco (assincronamente)
    db.upsertCheckout(checkoutRecord)
      .then((result) => {
        appendAccessLog(`[db] Checkout gravado: ${checkoutRecord.yever_reference} (id=${result.id})`);

        // Se for pagamento, marca como pago
        if (classified.type === 'payment_approved') {
          db.markCheckoutAsPaid(checkoutRecord.yever_reference, classified.paid_at);
          appendAccessLog(`[db] Checkout marcado como PAGO: ${checkoutRecord.yever_reference}`);
        }
      })
      .catch((err) => {
        console.error('[db] Erro ao gravar checkout:', err.message);
      });
  } catch (err) {
    console.error('[webhook] erro ao processar webhook Yever:', err);
  }
});

// Aceita também GET no mesmo path para validação manual (curl/navegador).
app.get('/webhooks/yever', (_req, res) => {
  res.status(200).json({
    ok: true,
    message:
      'Endpoint do webhook da Yever. Este endpoint espera POST. Configure a Yever para enviar eventos para esta URL.',
  });
});

// Debug: listar payloads salvos em arquivo
app.get('/payloads', (_req, res) => {
  try {
    if (!fs.existsSync(PAYLOADS_DIR)) {
      return res.json({ payloads: [] });
    }

    const files = fs.readdirSync(PAYLOADS_DIR).sort().reverse();
    const payloads = files.map((file) => {
      try {
        const content = fs.readFileSync(path.join(PAYLOADS_DIR, file), 'utf-8');
        return { file, payload: JSON.parse(content) };
      } catch (err) {
        return { file, error: err.message };
      }
    });

    res.json({ count: payloads.length, payloads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: listar checkouts no banco
app.get('/debug/checkouts', async (_req, res) => {
  try {
    const checkouts = await db.getAllCheckouts();
    res.json({ count: checkouts.length, checkouts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: forçar execução do job agora
app.post('/debug/force-recovery-check', (_req, res) => {
  try {
    forceRecoveryCheckNow();
    res.json({ message: 'Recovery check forçado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 404 padrão
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.originalUrl });
});

// Tratador de erros
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'internal_error' });
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
function bootstrap() {
  try {
    // Initialize database
    db.initDb();
    console.log('[bootstrap] ✓ Database initialized');

    // Start recovery job (1x per hour by default)
    const jobInterval = parseInt(process.env.JOB_INTERVAL_MINUTES || '60', 10);
    startRecoveryJob(jobInterval);

    // Start server
    app.listen(PORT, () => {
      appendAccessLog(`Yever Recovery Bridge ouvindo na porta ${PORT}`);
      console.log(`Health:  http://localhost:${PORT}/health`);
      console.log(`Webhook: http://localhost:${PORT}/webhooks/yever`);
      console.log(`Debug:   http://localhost:${PORT}/debug/checkouts`);
    });
  } catch (error) {
    console.error('[bootstrap] ❌ Erro ao iniciar:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[bootstrap] SIGTERM recebido, encerrando...');
  stopRecoveryJob();
  await db.closeDb();
  process.exit(0);
});

bootstrap();
