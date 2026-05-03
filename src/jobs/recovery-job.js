// src/jobs/recovery-job.js
// Scheduled job that runs every N minutes to find and recover abandoned checkouts
// Implements cascading template sending: 1h, 24h, 36h

const cron = require('node-cron');
const db = require('../db');
const { sendRecoveryTemplate } = require('../services/octadesk-client');
const { normalizePhoneBR, isValidE164 } = require('../services/normalize-phone');

let job = null;

/**
 * Start the recovery job
 * Runs every 5 minutes by default (can be adjusted)
 * Looks for checkouts and sends templates based on abandonment time
 */
function startRecoveryJob(intervalMinutes = 5) {
  if (job) {
    console.log('[recovery-job] Job já está rodando');
    return;
  }

  // Cron expression: every N minutes
  const cronExpression = `*/${intervalMinutes} * * * *`;

  job = cron.schedule(cronExpression, async () => {
    await runRecoveryCheck();
  });

  console.log(`[recovery-job] Job agendado para rodar a cada ${intervalMinutes} minutos`);
  console.log('[recovery-job] Envio em cascata: 1h (rec_1h) → 24h (rec_24h) → 36h (rec_36h)');
}

/**
 * Stop the recovery job
 */
function stopRecoveryJob() {
  if (job) {
    job.stop();
    console.log('[recovery-job] Job parado');
    job = null;
  }
}

/**
 * Main logic: process all recovery templates in cascade
 */
async function runRecoveryCheck() {
  const timestamp = new Date().toISOString();
  console.log(`[recovery-job] ⏰ Iniciando verificação em ${timestamp}`);

  try {
    // Process templates in cascade order
    await processRecoveryTemplate({
      minutes: 60,
      templateField: 'template_1h_sent_at',
      envKey: 'OCTADESK_TEMPLATE_REC_1H',
      label: '1h'
    });

    await processRecoveryTemplate({
      minutes: 24 * 60,
      templateField: 'template_24h_sent_at',
      envKey: 'OCTADESK_TEMPLATE_REC_24H',
      label: '24h'
    });

    await processRecoveryTemplate({
      minutes: 36 * 60,
      templateField: 'template_36h_sent_at',
      envKey: 'OCTADESK_TEMPLATE_REC_36H',
      label: '36h'
    });

    console.log(`[recovery-job] ✓ Verificação finalizada`);
  } catch (error) {
    console.error(`[recovery-job] ❌ Erro durante verificação:`, error.message);
  }
}

/**
 * Process recovery for a specific template at a specific time threshold
 */
async function processRecoveryTemplate({ minutes, templateField, envKey, label }) {
  const templateId = process.env[envKey];

  if (!templateId) {
    console.log(`[recovery-job] ⚠️  ${envKey} não configurado, pulando template ${label}`);
    return;
  }

  console.log(`[recovery-job] 🔄 Processando template ${label} (${minutes} min)...`);

  try {
    const checkouts = await db.findPendingCheckoutsOlderThanForTemplate(minutes, templateField);

    if (!checkouts || checkouts.length === 0) {
      console.log(`[recovery-job] ✓ Nenhum checkout para template ${label}`);
      return;
    }

    console.log(`[recovery-job] 📦 Encontrados ${checkouts.length} checkouts para template ${label}`);

    // Process each checkout
    for (const checkout of checkouts) {
      await processCheckoutForTemplate({
        checkout,
        templateId,
        templateField,
        label
      });
    }

    console.log(`[recovery-job] ✓ Processamento do template ${label} finalizado`);
  } catch (error) {
    console.error(`[recovery-job] ❌ Erro ao processar template ${label}:`, error.message);
  }
}

/**
 * Process a single checkout for a specific template
 */
async function processCheckoutForTemplate({ checkout, templateId, templateField, label }) {
  const logPrefix = `[recovery-job:${label}:${checkout.yever_checkout_id}]`;

  try {
    // Validate prerequisites
    const validation = validateCheckoutForRecovery(checkout);
    if (!validation.valid) {
      console.log(`${logPrefix} ⏭️  Ignorado: ${validation.reason}`);
      return;
    }

    console.log(`${logPrefix} ✓ Validação passou`);

    // Normalize phone to E.164
    const phoneE164 = normalizePhoneBR(checkout.customer_phone);
    console.log(`${logPrefix} Telefone normalizado: ${checkout.customer_phone} -> ${phoneE164}`);

    if (!phoneE164 || !isValidE164(phoneE164)) {
      console.log(`${logPrefix} ⏭️  Telefone inválido após normalização`);
      return;
    }

    console.log(`${logPrefix} ✓ Telefone válido`);

    // Check if customer has any paid checkout
    const hasPaidCheckout = await db.hasAnyPaidCheckoutForCustomer(
      checkout.customer_email,
      phoneE164
    );

    if (hasPaidCheckout) {
      console.log(`${logPrefix} ⏭️  Cliente já pagou um carrinho, não enviar recuperação`);
      return;
    }

    console.log(`${logPrefix} ✓ Cliente ainda não pagou nada`);

    // Check if there's a more recent checkout
    const moreRecent = await db.findMostRecentCheckoutByEmailOrPhone(
      checkout.customer_email,
      phoneE164
    );

    if (moreRecent && moreRecent.id !== checkout.id && new Date(moreRecent.created_at) > new Date(checkout.created_at)) {
      console.log(`${logPrefix} ⏭️  Checkout mais recente existe, não enviar para este`);
      return;
    }

    console.log(`${logPrefix} ✓ Este é o checkout mais recente do cliente`);

    // Send recovery message with appropriate template
    console.log(`${logPrefix} 📤 Enviando mensagem com template ${label}...`);
    console.log(`${logPrefix} Parâmetros: phone=${phoneE164}, name=${checkout.customer_name}, url=${checkout.recovery_url}`);

    const dryRun = process.env.DRY_RUN === 'true';
    console.log(`${logPrefix} DRY_RUN=${dryRun}`);

    let response;
    try {
      response = await sendRecoveryTemplate({
        phone: phoneE164,
        checkoutUrl: checkout.recovery_url,
        customerName: checkout.customer_name,
        checkoutId: checkout.yever_checkout_id,
        templateId: templateId,
        dryRun
      });
    } catch (sendError) {
      console.error(`${logPrefix} ❌ Exceção ao chamar sendRecoveryTemplate:`, sendError.message);
      console.error(`${logPrefix} Stack:`, sendError.stack);
      return;
    }

    console.log(`${logPrefix} Resposta da função: ${JSON.stringify(response)}`);

    if (response.success) {
      // Mark template as sent
      await db.markTemplateSent(checkout.id, templateField, response);
      console.log(`${logPrefix} ✅ Mensagem com template ${label} enviada com sucesso`);
    } else {
      console.error(`${logPrefix} ❌ Falha ao enviar: ${JSON.stringify(response.error)}`);
    }
  } catch (error) {
    console.error(`${logPrefix} ❌ Erro ao processar checkout:`, error.message);
    console.error(`${logPrefix} Stack:`, error.stack);
  }
}

/**
 * Validate if a checkout is eligible for recovery message
 */
function validateCheckoutForRecovery(checkout) {
  // Status deve ser 'pending'
  if (checkout.status !== 'pending') {
    return { valid: false, reason: `Status é ${checkout.status}, não pending` };
  }

  // Telefone deve existir
  if (!checkout.customer_phone) {
    return { valid: false, reason: 'Telefone vazio' };
  }

  // Email deve existir
  if (!checkout.customer_email) {
    return { valid: false, reason: 'Email vazio' };
  }

  // Recovery URL deve existir
  if (!checkout.recovery_url) {
    return { valid: false, reason: 'URL de recuperação vazia' };
  }

  return { valid: true };
}

/**
 * Force a recovery check (for testing)
 */
function forceRecoveryCheckNow() {
  console.log('[recovery-job] 🔄 Forçando verificação agora...');
  runRecoveryCheck().catch((err) => {
    console.error('[recovery-job] Erro ao forçar verificação:', err.message);
  });
}

module.exports = {
  startRecoveryJob,
  stopRecoveryJob,
  forceRecoveryCheckNow,
  runRecoveryCheck
};
