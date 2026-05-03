// src/jobs/recovery-job.js
// Scheduled job that runs every N minutes to find and recover abandoned checkouts

const cron = require('node-cron');
const db = require('../db');
const { sendRecoveryTemplate } = require('../services/octadesk-client');
const { normalizePhoneBR, isValidE164 } = require('../services/normalize-phone');

let job = null;

/**
 * Start the recovery job
 * Runs every 5 minutes by default (can be adjusted)
 * Looks for checkouts abandoned 60+ minutes ago
 */
function startRecoveryJob(intervalMinutes = 5) {
  if (job) {
    console.log('[recovery-job] Job já está rodando');
    return;
  }

  // Cron expression: every N minutes
  // Format: minute hour dayOfMonth month dayOfWeek
  // "*/5 * * * *" = every 5 minutes
  const cronExpression = `*/${intervalMinutes} * * * *`;

  job = cron.schedule(cronExpression, async () => {
    await runRecoveryCheck();
  });

  console.log(`[recovery-job] Job agendado para rodar a cada ${intervalMinutes} minutos`);
  console.log(`[recovery-job] Procurará checkouts abandonados há 60+ minutos`);
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
 * Main logic: find pending checkouts and send recovery messages
 */
async function runRecoveryCheck() {
  const timestamp = new Date().toISOString();
  console.log(`[recovery-job] ⏰ Iniciando verificação em ${timestamp}`);

  try {
    // Find checkouts abandoned 60+ minutes ago
    const ABANDONED_MINUTES = 60;
    const pendingCheckouts = await db.findPendingCheckoutsOlderThan(ABANDONED_MINUTES);

    if (pendingCheckouts.length === 0) {
      console.log(`[recovery-job] ✓ Nenhum checkout pendente para recuperar`);
      return;
    }

    console.log(`[recovery-job] 📦 Encontrados ${pendingCheckouts.length} checkouts para recuperar`);

    // Process each checkout
    for (const checkout of pendingCheckouts) {
      await processCheckoutForRecovery(checkout);
    }

    console.log(`[recovery-job] ✓ Verificação finalizada`);
  } catch (error) {
    console.error(`[recovery-job] ❌ Erro durante verificação:`, error.message);
  }
}

/**
 * Process a single checkout for recovery
 */
async function processCheckoutForRecovery(checkout) {
  const logPrefix = `[recovery-job:${checkout.yever_checkout_id}]`;

  try {
    // Validate prerequisites
    const validation = validateCheckoutForRecovery(checkout);
    if (!validation.valid) {
      console.log(`${logPrefix} ⏭️  Ignorado: ${validation.reason}`);
      return;
    }

    // Normalize phone to E.164
    const phoneE164 = normalizePhoneBR(checkout.customer_phone);
    if (!phoneE164 || !isValidE164(phoneE164)) {
      console.log(`${logPrefix} ⏭️  Telefone inválido: ${checkout.customer_phone}`);
      return;
    }

    // Check for more recent checkout from same email/phone
    const moreRecent = await db.findMostRecentCheckoutByEmailOrPhone(
      checkout.customer_email,
      phoneE164
    );

    if (moreRecent && moreRecent.id !== checkout.id && new Date(moreRecent.created_at) > new Date(checkout.created_at)) {
      console.log(`${logPrefix} ⏭️  Checkout mais recente existe para este email/telefone`);
      return;
    }

    // Send recovery message
    console.log(`${logPrefix} 📤 Enviando mensagem de recuperação...`);

    const dryRun = process.env.DRY_RUN === 'true';
    const response = await sendRecoveryTemplate({
      phone: phoneE164,
      checkoutUrl: checkout.recovery_url,
      customerName: checkout.customer_name,
      checkoutId: checkout.yever_checkout_id,
      dryRun
    });

    if (response.success) {
      // Mark as message sent
      await db.markMessageSent(checkout.id, response);
      console.log(`${logPrefix} ✅ Mensagem enviada com sucesso`);
    } else {
      console.error(`${logPrefix} ❌ Falha ao enviar: ${JSON.stringify(response.error)}`);
    }
  } catch (error) {
    console.error(`${logPrefix} ❌ Erro ao processar checkout:`, error.message);
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

  // Não deve ter mensagem já enviada
  if (checkout.message_sent_at) {
    return { valid: false, reason: 'Mensagem já foi enviada' };
  }

  // Não deve estar pago
  if (checkout.status === 'paid') {
    return { valid: false, reason: 'Checkout já foi pago' };
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
async function forceRecoveryCheckNow() {
  console.log('[recovery-job] 🔄 Forçando verificação agora...');
  await runRecoveryCheck();
}

module.exports = {
  startRecoveryJob,
  stopRecoveryJob,
  forceRecoveryCheckNow,
  runRecoveryCheck
};
