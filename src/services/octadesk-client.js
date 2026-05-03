// src/services/octadesk-client.js
// Octadesk integration for sending WhatsApp recovery messages

const axios = require('axios');

/**
 * Send recovery message template via Octadesk
 *
 * @param {Object} params
 * @param {string} params.phone - Phone in E.164 format (+55DDDNNNNNNNN)
 * @param {string} params.checkoutUrl - URL to recover the checkout
 * @param {string} params.customerName - Customer name for personalization
 * @param {string} params.checkoutId - Yever checkout ID for tracking
 * @param {string} params.templateId - Octadesk template ID (optional, defaults to REC_1H)
 * @param {boolean} params.dryRun - If true, only log without sending
 */
async function sendRecoveryTemplate(params) {
  const {
    phone,
    checkoutUrl,
    customerName,
    checkoutId,
    templateId: customTemplateId,
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

  // Dry run mode
  if (dryRun) {
    console.log(`${logPrefix} DRY RUN - Would send recovery message`);
    console.log(`${logPrefix} To: ${phone}`);
    console.log(`${logPrefix} Name: ${customerName}`);
    console.log(`${logPrefix} URL: ${checkoutUrl}`);
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
              value: checkoutUrl
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
