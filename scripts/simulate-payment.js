#!/usr/bin/env node
/**
 * Simula um evento de pagamento aprovado na Yever Recovery Bridge
 * Usa o payload de carrinho abandonado como base e simula um pagamento
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const https = require('https');

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://yever-recovery-bridge-production.up.railway.app/webhooks/yever';

// Payload de carrinho abandonado real (capturado antes)
const abandonedPayload = {
  "token": "PrLyhsS7uTzYtqfLz88pGUs71foLBzavw3eN3STw49xaPZv0wOkIuVn8WMzg348B",
  "reference": "cbb32e93-e6e9-4d28-92f5-b3daad7e9d5c-PAID",
  "customer": {
    "name": "Ian Agarelli",
    "email": "ian.agarelli01@gmail.com",
    "phone": "+5511990152768",
    "birthday": null
  },
  "last_step": "confirmation",
  "order_status": "paid",
  "products": [
    {
      "product_title": "Calcinha Levanta BUMBUM - Super Confortável e linda",
      "variant_title": "Nude / P/M (Manequim 36 ao 40)",
      "quantity": 51,
      "price": 19.9,
      "image_url": "https://images.yever.com.br/product/HEHGcfgaDRvllVbWwKPFCmzQlvl82nIK-1764283038.png"
    }
  ],
  "currency": "BRL",
  "price_total": 1014.9,
  "checkout_url": "https://seguro.loveandcomfy.com.br/checkout/products?product_id[0]=0PQtmfho-a5ec551139d6857ace75b5d63b1bc304&quantity[0]=51&cart=cbb32e93-e6e9-4d28-92f5-b3daad7e9d5c",
  "created_at": "2026-05-03 18:37:18",
  "updated_at": new Date().toISOString().replace('T', ' ').slice(0, 19),
  "abandoned_at": null,
  "paid_at": new Date().toISOString().replace('T', ' ').slice(0, 19),
  "utms": {
    "source": "direct",
    "campaign": null,
    "medium": null,
    "content": "||nemu_PSH2VRsbqH",
    "term": "nemu_PSH2VRsbqH"
  }
};

const payload = JSON.stringify(abandonedPayload);

console.log(`
===========================================
📤 Simulando evento de pagamento aprovado
===========================================
URL: ${WEBHOOK_URL}
Referência (reference): ${abandonedPayload.reference}
Status: ${abandonedPayload.order_status}
Last Step: ${abandonedPayload.last_step}
Valor: ${abandonedPayload.price_total} ${abandonedPayload.currency}
Timestamp: ${new Date().toISOString()}
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
    console.log(`\n✅ Evento de pagamento simulado com sucesso!`);
    console.log(`\nPróximo passo: acesse https://yever-recovery-bridge-production.up.railway.app/payloads`);
    console.log(`e você verá 2 payloads: 1 abandonado + 1 pago\n`);
  });
});

req.on('error', (e) => {
  console.error(`❌ Erro ao enviar simulação:`);
  console.error(e.message);
  process.exit(1);
});

req.write(payload);
req.end();
