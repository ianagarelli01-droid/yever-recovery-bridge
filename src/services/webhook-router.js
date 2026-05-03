// src/services/webhook-router.js
// Routes webhook events from Yever and classifies them

/**
 * Determines the event type and extracts relevant data
 *
 * @param {Object} webhookBody - The parsed webhook body from Yever
 * @returns {Object} Classified event with type and extracted data
 */
function classifyYeverEvent(webhookBody) {
  // Base validation
  if (!webhookBody || typeof webhookBody !== 'object') {
    return {
      type: 'unknown',
      valid: false,
      error: 'Invalid webhook body'
    };
  }

  // Extract common fields
  const {
    reference,
    customer,
    last_step,
    order_status,
    abandoned_at,
    paid_at,
    created_at,
    updated_at,
    products,
    price_total,
    currency,
    checkout_url
  } = webhookBody;

  // Basic validation
  if (!reference || !customer) {
    return {
      type: 'unknown',
      valid: false,
      error: 'Missing reference or customer'
    };
  }

  // **RULE 1: If order_status is "paid", it's a PAID event**
  if (order_status === 'paid') {
    return {
      type: 'payment_approved',
      valid: true,
      reference,
      customer,
      last_step,
      order_status,
      paid_at,
      created_at,
      updated_at,
      products,
      price_total,
      currency,
      checkout_url,
      raw: webhookBody
    };
  }

  // **RULE 2: If order_status is null and abandoned_at exists, it's ABANDONED**
  if (order_status === null && abandoned_at) {
    return {
      type: 'checkout_abandoned',
      valid: true,
      reference,
      customer,
      last_step,
      order_status,
      abandoned_at,
      created_at,
      updated_at,
      products,
      price_total,
      currency,
      checkout_url,
      raw: webhookBody
    };
  }

  // **RULE 3: If last_step is "payment" but order_status is null, treat as ABANDONED**
  if (last_step === 'payment' && order_status === null) {
    return {
      type: 'checkout_abandoned',
      valid: true,
      reference,
      customer,
      last_step,
      order_status,
      abandoned_at: abandoned_at || updated_at,
      created_at,
      updated_at,
      products,
      price_total,
      currency,
      checkout_url,
      raw: webhookBody
    };
  }

  // Unknown type
  return {
    type: 'unknown',
    valid: false,
    error: `Could not classify: last_step=${last_step}, order_status=${order_status}`,
    raw: webhookBody
  };
}

/**
 * Converts classified event to checkout database record format
 *
 * @param {Object} classifiedEvent - Event from classifyYeverEvent()
 * @returns {Object} Database record format
 */
function eventToCheckoutRecord(classifiedEvent) {
  if (!classifiedEvent.valid) {
    return null;
  }

  const {
    type,
    reference,
    customer,
    products,
    price_total,
    currency,
    checkout_url,
    created_at,
    abandoned_at,
    paid_at,
    raw
  } = classifiedEvent;

  // Determine status based on event type
  let status = 'pending';
  if (type === 'payment_approved') {
    status = 'paid';
  }

  return {
    yever_checkout_id: reference, // Same as reference
    yever_reference: reference,
    customer_name: customer.name || null,
    customer_email: customer.email || null,
    customer_phone: customer.phone || null,
    value_total: price_total || null,
    currency: currency || 'BRL',
    products: products || [],
    recovery_url: checkout_url || null,
    last_step: classifiedEvent.last_step || null,
    order_status: classifiedEvent.order_status || null,
    status: status,
    created_at: created_at || new Date().toISOString(),
    abandoned_at: abandoned_at || null,
    paid_at: paid_at || null,
    raw_payload: raw
  };
}

module.exports = {
  classifyYeverEvent,
  eventToCheckoutRecord
};
