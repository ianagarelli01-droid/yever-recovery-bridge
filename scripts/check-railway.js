// scripts/check-railway.js
//
// Faz um healthcheck e um POST de teste contra o servidor publicado no Railway
// (ou em qualquer outra base URL que voce passar como argumento).
//
// USO:
//   node scripts/check-railway.js
//   node scripts/check-railway.js https://seu-dominio.up.railway.app
//
// Nada que dependa de token sai por aqui.

const DEFAULT_BASE = 'https://yever-recovery-bridge-production.up.railway.app';
const BASE = (process.argv[2] || DEFAULT_BASE).replace(/\/$/, '');

function shortBody(body) {
  return body.length > 300 ? body.slice(0, 300) + '... [truncado]' : body;
}

(async () => {
  console.log(`Base URL: ${BASE}`);

  // /health
  console.log(`\n[1/2] GET ${BASE}/health`);
  try {
    const res = await fetch(`${BASE}/health`);
    const txt = await res.text();
    console.log(`  HTTP ${res.status}`);
    console.log(`  body: ${shortBody(txt)}`);
  } catch (err) {
    console.log(`  ERRO: ${err.message}`);
  }

  // /webhooks/yever
  console.log(`\n[2/2] POST ${BASE}/webhooks/yever?source=probe-script`);
  const payload = {
    probe: true,
    note: 'teste manual via scripts/check-railway.js',
    ts: new Date().toISOString(),
  };
  try {
    const res = await fetch(`${BASE}/webhooks/yever?source=probe-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Probe': 'check-railway-script',
      },
      body: JSON.stringify(payload),
    });
    const txt = await res.text();
    console.log(`  HTTP ${res.status}`);
    console.log(`  body: ${shortBody(txt)}`);
    if (res.status === 200 && txt.includes('"received":true')) {
      console.log(
        '\nOK: o servidor recebeu e respondeu. Procure pelo arquivo gerado em logs/payloads/ no volume do Railway.'
      );
    }
  } catch (err) {
    console.log(`  ERRO: ${err.message}`);
  }
})();
