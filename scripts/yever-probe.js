// scripts/yever-probe.js
//
// Sonda múltiplas bases candidatas e endpoints comuns da API da Yever
// usando o token do .env (Authorization: Bearer ...).
//
// PRINCÍPIOS DE SEGURANÇA:
// - O token NUNCA é impresso. Qualquer ocorrência do token em qualquer
//   string de saída é mascarada antes de ir pro stdout.
// - O script só faz GETs idempotentes (não cria, não altera, não deleta nada).
//
// USO:
//   node scripts/yever-probe.js
//
// Requer Node 18+ (fetch nativo) e a variável YEVER_API_TOKEN no .env.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.YEVER_API_TOKEN;
if (!TOKEN || !TOKEN.trim()) {
  console.error('YEVER_API_TOKEN nao definido no .env. Abortando.');
  process.exit(1);
}

// --- Mascara qualquer ocorrência do token em qualquer string ---
const TOKEN_PREVIEW =
  TOKEN.length > 8 ? TOKEN.slice(0, 4) + '...' + TOKEN.slice(-2) : '***';

function mask(s) {
  if (typeof s !== 'string') return s;
  return s.split(TOKEN).join(TOKEN_PREVIEW);
}

function safeLog(...args) {
  console.log(...args.map(mask));
}

// --- Base URL oficial da API Yever (confirmada na doc oficial) ---
//   https://docs.yever.com.br/developers/index.html
const BASES = ['https://api.yever.com.br/api/v1'];

// --- Caminhos GET candidatos.
// A doc oficial cita /order/list explicitamente. Os outros são palpites
// no mesmo padrão singular/list, para descobrir o que existe.
const PATHS = [
  '/order/list',
  '/order',
  '/cart/list',
  '/cart',
  '/checkout/list',
  '/checkout',
  '/abandoned-cart/list',
  '/abandoned-cart',
  '/customer/list',
  '/customer',
  '/product/list',
  '/product',
  '/webhook/list',
  '/webhook',
  '/store',
  '/me',
  '/user',
];

const TIMEOUT_MS = 7000;

async function probe(base, p) {
  const url = base.replace(/\/$/, '') + p;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'yever-recovery-bridge-probe/0.1',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const ct = res.headers.get('content-type') || '';
    let text = '';
    try {
      text = await res.text();
    } catch (_) {}
    const snippet = text.slice(0, 240).replace(/\s+/g, ' ');
    return { url, status: res.status, ct, snippet };
  } catch (err) {
    return {
      url,
      status: 0,
      ct: '',
      snippet: 'ERR ' + (err && err.message ? err.message : String(err)),
    };
  } finally {
    clearTimeout(t);
  }
}

(async () => {
  safeLog(`Iniciando probe da API Yever. Token preview: ${TOKEN_PREVIEW}`);
  safeLog('GETs apenas. Nada e criado, alterado ou deletado.');
  safeLog('---');

  const interesting = [];
  for (const base of BASES) {
    for (const p of PATHS) {
      const r = await probe(base, p);
      const isJson =
        r.ct.includes('json') ||
        r.snippet.startsWith('{') ||
        r.snippet.startsWith('[');
      const promising =
        r.status === 200 ||
        r.status === 201 ||
        r.status === 401 ||
        r.status === 403 ||
        r.status === 422 ||
        (r.status >= 200 && r.status < 300 && isJson);
      const tag = promising ? 'HIT' : '   ';
      safeLog(
        `[${tag}] ${String(r.status).padStart(3)} ${r.url}` +
          `  ct=${r.ct || '-'}` +
          `  body=${r.snippet}`
      );
      if (promising) interesting.push(r);
    }
  }

  safeLog('---');
  safeLog(`Probes promissoras: ${interesting.length}`);
  if (interesting.length) {
    safeLog('Resumo das promissoras:');
    for (const r of interesting) {
      safeLog(`  ${r.status}  ${r.url}  (${r.ct || '-'})`);
    }
  } else {
    safeLog(
      'Nenhuma base candidata respondeu de forma autenticada. Possiveis causas:'
    );
    safeLog(' - A base URL real da API da Yever nao esta na lista (precisa pedir pra Yever).');
    safeLog(' - A API exige outro header (X-API-KEY, Token-Yever, etc).');
    safeLog(' - O token esta restrito a determinados escopos.');
  }
})();
