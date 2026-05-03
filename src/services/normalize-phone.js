// src/services/normalize-phone.js
// Normalizes Brazilian phone numbers to E.164 format (+55DDDNNNNNNNN)

/**
 * Normalize a Brazilian phone number to E.164 format
 * Returns null if invalid
 *
 * Accepts formats like:
 * - +5511987654321
 * - +55 11 98765-4321
 * - 11987654321
 * - (11) 98765-4321
 * - 11 9 8765-4321
 */
function normalizePhoneBR(phone) {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Remove all non-digit characters except leading +
  let cleaned = phone.trim();
  if (cleaned.startsWith('+')) {
    cleaned = '+' + cleaned.slice(1).replace(/\D/g, '');
  } else {
    cleaned = cleaned.replace(/\D/g, '');
  }

  // If it has +55 prefix, keep it
  if (cleaned.startsWith('+55')) {
    const digits = cleaned.slice(3);
    // Brazilian numbers should have 10-11 digits after country code
    if (digits.length === 10 || digits.length === 11) {
      return `+55${digits}`;
    }
  }

  // If no prefix, assume Brazil (+55)
  if (!cleaned.startsWith('+')) {
    // Remove leading 0 if present (old format)
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1);
    }

    // Should be 10 or 11 digits
    if (cleaned.length === 10 || cleaned.length === 11) {
      return `+55${cleaned}`;
    }
  }

  // Invalid format
  return null;
}

/**
 * Validates if a phone is properly formatted in E.164
 */
function isValidE164(phone) {
  if (!phone || typeof phone !== 'string') {
    return false;
  }
  // E.164 format: +55DDDNNNNNNNN or +55DDDNNNNNNNNN
  return /^\+55\d{10,11}$/.test(phone);
}

module.exports = {
  normalizePhoneBR,
  isValidE164
};
