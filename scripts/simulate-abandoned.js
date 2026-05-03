#!/usr/bin/env node
/**
 * Simula um evento de checkout abandonado na Yever Recovery Bridge
 * Usa o primeiro payload de carrinho abandonado como referência
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const https = require('https');

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://yever-recovery-bridge-production.up.railway.app/webhooks/yever';

// Payload de carrinho abandonado (criado há pouco tempo, para testar job 1h)
const abandonedPayload = {
  "token": "PrLyhsS7uTzYtqfLz88pGUs71foLBzavw3eN3STw49xaPZv0wOkIuVn8WMzg348B",
  "reference": "test-abandoned-" + Date.now(),
  "customer": {
    "name": "Teste Abandonado",
    "email": "teste.abandonado@example.com",
    "phone": "11987654321",
    "birthday": null
  },
  "last_step": "payment",
  "order_status": null,
  "products": [
    {
      "product_title": "Produto de Teste",
      "variant_title": "Tamanho M",
      "quantity": 1,
      "price": 99.99,
      "image_url": "https://example.com/image.jpg"
    }
  ],
  "currency": "BRL",
  "price_total": 99.99,
  "checkout_url": "https://seguro.loveandcomfy.com.br/checkout/test?cart=" + Date.now(),
  "created_at": new Date().toISOString().replace('T', ' ').slice(0, 19),
  "updated_at": new Date().toISOString().replace('T', ' ').slice(0, 19),
  "abandoned_at": new Date(Date.now() - 65 * 60000).toISOString().replace('T', ' ').slice(0, 19), // 65 minutos atrás
  "utms": {
    "source": "direct",
    "campaign": null,
    "medium": null,
    "content": "test",
    "term": "test"
  }
};

const payload = JSON.stringify(abandonedPayload);

console.log(`
===========================================
📤 Simulando evento de carrinho abandonado
===========================================
URL: ${WEBHOOK_URL}
Referência (reference): ${abandonedPayload.reference}
Status: ${abandonedPayload.order_status}
Last Step: ${abandonedPayload.last_step}
Abandoned At: ${abandonedPayload.abandoned_at} (65 min atrás)
Email: ${abandonedPayload.customer.email}
Telefone: ${abandonedPayload.customer.phone}
===========================================
`);

const urlObj = new URL(WEBHOOK_URL);
const isHttps = urlObj.protocol === 'https:';
const client = isHttps ? https : http;

const options = {
  hostname: urlObj.hostname,
  port: urlObj.port || (isHttps ? 443 : 80),
  path: urlObj.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'User-Agent': 'GuzzleHttp/7'
  }
};

const req = client.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`✅ Resposta HTTP ${res.statusCode}:`);
    console.log(data);
    console.log(`
✅ Evento de carrinho abandonado simulado com sucesso!

Próximos passos:
1. Aguarde 5 minutos para o job de recuperação rodar
2. OU force agora com: POST https://yever-recovery-bridge-production.up.railway.app/debug/force-recovery-check
3. Depois acesse: https://yever-recovery-bridge-production.up.railway.app/debug/checkouts
4. Verifique se o status mudou para 'recovered_message_sent'
    `);
  });
});

req.on('error', (e) => {
  console.error(`❌ Erro ao enviar simulação:`);
  console.error(e.message);
  process.exit(1);
});

req.write(payload);
req.end();
