'use strict';

const MAX_PRODUCT_PRICE = 9999999999.99;
const PRODUCT_PRICE_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function normalizeOptionalText(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  return value.trim() || null;
}

function parseProductPrice(value) {
  const priceText = typeof value === 'string' ? value.trim() : value;
  if ((typeof priceText !== 'number' && typeof priceText !== 'string') ||
      (typeof priceText === 'string' && !PRODUCT_PRICE_PATTERN.test(priceText))) {
    return null;
  }

  const price = Number(priceText);
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRODUCT_PRICE) return null;
  return price;
}

module.exports = { normalizeOptionalText, parseProductPrice };
