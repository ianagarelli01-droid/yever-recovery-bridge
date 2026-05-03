#!/usr/bin/env node
/**
 * Verifica se as variáveis de ambiente necessárias estão configuradas
 * Execute: node scripts/check-env.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const variables = [
  { name: 'PORT', required: false, default: '3000' },
  { name: 'DATABASE_URL', required: true, sensitive: true },
  { name: 'YEVER_API_TOKEN', required: false, sensitive: true },
  { name: 'YEVER_WEBHOOK_SECRET', required: false, sensitive: true },
  { name: 'OCTADESK_API_KEY', required: true, sensitive: true },
  { name: 'OCTADESK_BASE_URL', required: true, sensitive: false },
  { name: 'OCTADESK_ORIGIN_PHONE', required: true, sensitive: false },
  { name: 'OCTADESK_TEMPLATE_REC_1H', required: true, sensitive: false },
  { name: 'DRY_RUN', required: false, default: 'false', sensitive: false },
  { name: 'JOB_INTERVAL_MINUTES', required: false, default: '5', sensitive: false }
];

console.log('\n===========================================');
console.log('🔍 Verificação de Variáveis de Ambiente');
console.log('===========================================\n');

let allOk = true;

variables.forEach((varInfo) => {
  const value = process.env[varInfo.name];
  const hasValue = !!value;
  const status = hasValue ? '✅' : '❌';
  const display = value ? (varInfo.sensitive ? `***${value.slice(-5)}` : value) : '(não definido)';
  const required = varInfo.required ? '[OBRIGATÓRIO]' : '[opcional]';

  console.log(`${status} ${varInfo.name.padEnd(30)} ${display.padEnd(40)} ${required}`);

  if (varInfo.required && !hasValue) {
    allOk = false;
  }
});

console.log('\n===========================================');

if (!allOk) {
  console.log('❌ ERRO: Variáveis obrigatórias faltando!');
  console.log('\nConfigure em .env ou Railway variables:');
  variables
    .filter((v) => v.required && !process.env[v.name])
    .forEach((v) => console.log(`  - ${v.name}`));
  process.exit(1);
} else {
  console.log('✅ Todas as variáveis obrigatórias estão configuradas!');
}

// Validações adicionais
console.log('\n===========================================');
console.log('🔧 Validações Adicionais');
console.log('===========================================\n');

const octadeskOrigin = process.env.OCTADESK_ORIGIN_PHONE;
if (octadeskOrigin && !octadeskOrigin.startsWith('+55')) {
  console.log('⚠️  AVISO: OCTADESK_ORIGIN_PHONE deveria começar com +55');
}

const dryRun = process.env.DRY_RUN;
if (dryRun === 'true') {
  console.log('⚠️  AVISO: DRY_RUN=true — mensagens NÃO serão enviadas!');
}

const templateId = process.env.OCTADESK_TEMPLATE_REC_1H;
if (templateId && templateId.length < 20) {
  console.log('⚠️  AVISO: OCTADESK_TEMPLATE_REC_1H parece muito curto (verifique o ID)');
}

console.log('\n');
