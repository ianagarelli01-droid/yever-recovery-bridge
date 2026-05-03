// src/services/octadesk-client.js
// Octadesk integration for sending WhatsApp recovery messages

const axios = require('axios');

/**
 * Build checkout URL with UTM parameters for analytics tracking
 * @param {string} baseUrl - Base checkout URL
 * @param {string} templateLabel - Template label (1h, 24h, 36h)
 * @returns {string} URL with UTM parameters
 */
function buildUrlWithUtm(baseUrl, templateLabel = '1h') {
  try {
    const url = new URL(baseUrl);

    // Add UTM parameters
    url.searchParams.set('utm_source', 'whatsapp');
    url.searchParams.set('utm_medium', 'octadesk');
    url.searchParams.set('utm_campaign', `cart_recovery_${templateLabel}`);
    url.searchParams.set('utm_content', `rec_${templateLabel}`);

    return url.toString();
  } catch (error) {
    // If URL parsing fails, return original URL
    console.warn('[octadesk] Erro ao parsear URL para UTM:', error.message);
    return baseUrl;
  }
}

/**
 * Send recovery message template via Octadesk
 *
 * @param {Object} params
 * @param {string} params.phone - Phone in E.164 format (+55DDDNNNNNNNN)
 * @param {string} params.checkoutUrl - URL to recover the checkout
 * @param {string} params.customerName - Customer name for personalization
 * @param {string} params.checkoutId - Yever checkout ID for tracking
 * @param {string} params.templateId - Octadesk template ID (optional, defaults to REC_1H)
 * @param {string} params.templateLabel - Template label for UTM (1h, 24h, 36h) - optional
 * @param {boolean} params.dryRun - If true, only log without sending
 */
async function sendRecoveryTemplate(params) {
  const {
    phone,
    checkoutUrl,
    customerName,
    checkoutId,
    templateId: customTemplateId,
    templateLabel = '1h',
    dryRun = false
  } = params;

  const apiKey = process.env.OCTADESK_API_KEY;
  const baseUrl = process.env.OCTADESK_BASE_URL;
  const originPhone = process.env.OCTADESK_ORIGIN_PHONE;
  const templateId = customTemplateId || process.env.OCTADESK_TEMPLATE_REC_1H;

  // Validation
  if (!apiKey || !baseUrl || !originPhone || !templateId) {
    throw new Error('[octadesk] Missing required environment variables');
  }

  if (!phone || !checkoutUrl || !customerName) {
    throw new Error('[octadesk] Missing required parameters: phone, checkoutUrl, customerName');
  }

  const logPrefix = `[octadesk:${checkoutId}]`;

  // Build URL with UTM parameters
  const checkoutUrlWithUtm = buildUrlWithUtm(checkoutUrl, templateLabel);

  // Dry run mode
  if (dryRun) {
    console.log(`${logPrefix} DRY RUN - Would send recovery message`);
    console.log(`${logPrefix} To: ${phone}`);
    console.log(`${logPrefix} Name: ${customerName}`);
    console.log(`${logPrefix} URL: ${checkoutUrlWithUtm}`);
    return {
      dryRun: true,
      success: true,
      message: 'Dry run completed'
    };
  }

  try {
    console.log(`${logPrefix} Enviando template de recuperação...`);

    // Payload conforme documentação oficial Octadesk
    const payload = {
      origin: {
        contact: {
          channel: 'whatsapp',
          code: originPhone
        }
      },
      target: {
        contact: {
          channel: 'whatsapp',
          code: phone,
          name: customerName
        }
      },
      content: {
        templateMessage: {
          id: templateId,
          variables: [
            {
              key: 'nome_do_cliente',
              value: customerName
            },
            {
              key: 'var-1',
              value: checkoutUrlWithUtm
            }
          ]
        }
      },
      options: {
        automaticAssign: false
      }
    };

    console.log(`${logPrefix} Payload: ${JSON.stringify(payload)}`);

    const response = await axios.post(
      `${baseUrl}/chat/send-template`,
      payload,
      {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log(`${logPrefix} Resposta Octadesk: ${response.status} - ${JSON.stringify(response.data)}`);

    return {
      success: true,
      statusCode: response.status,
      data: response.data,
      sentAt: new Date().toISOString()
    };
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    console.error(`${logPrefix} Erro ao enviar: ${JSON.stringify(errorMsg)}`);

    return {
      success: false,
      statusCode: error.response?.status || 500,
      error: errorMsg,
      sentAt: new Date().toISOString()
    };
  }
}

module.exports = {
  sendRecoveryTemplate
};
