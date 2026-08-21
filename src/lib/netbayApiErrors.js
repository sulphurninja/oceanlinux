/**
 * Turn Netbay API failures into short, customer-safe messages (no stack traces).
 */
const { customerServiceErrorMessage } = require('@/lib/customerFacingErrors');

function tryParseJson(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractNetbayApiMessage(body) {
  if (!body) return null;
  if (typeof body === 'string') {
    const parsed = tryParseJson(body);
    if (parsed) return extractNetbayApiMessage(parsed);
    if (body.includes('"stack"')) return null;
    return body.trim() || null;
  }
  if (typeof body === 'object') {
    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message.trim();
    }
    if (typeof body.error === 'string' && body.error.trim() && !body.error.trim().startsWith('{')) {
      return body.error.trim();
    }
  }
  return null;
}

function stripNetbayInternalPrefix(text) {
  return String(text || '')
    .replace(/^Netbay\s+(GET|POST|PUT|DELETE|PATCH)\s+\S+:\s*/i, '')
    .replace(/^Netbay\s+/i, '')
    .trim();
}

function formatRebuildLimitMessage(rawMessage) {
  const text = String(rawMessage || '');
  if (!/rebuild limit/i.test(text)) return null;

  const nextMatch = text.match(/Next available:\s*([0-9T:\.-]+Z?)/i);
  let message =
    'Rebuild limit reached. You can reinstall your server up to 3 times every 24 hours.';

  if (nextMatch?.[1]) {
    const dt = new Date(nextMatch[1]);
    if (!Number.isNaN(dt.getTime())) {
      message += ` You can try again after ${dt.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })}.`;
    }
  }

  return {
    message,
    code: 'NETBAY_REBUILD_LIMIT',
    status: 429,
    nextAvailableAt: nextMatch?.[1] || null,
  };
}

/**
 * @param {Error & { status?: number, body?: unknown }} err
 */
function toUserFacingNetbayError(err) {
  const status = err?.status || err?.body?.statusCode || 500;
  const fromBody = extractNetbayApiMessage(err?.body);
  let raw =
    fromBody ||
    extractNetbayApiMessage(stripNetbayInternalPrefix(err?.message)) ||
    stripNetbayInternalPrefix(err?.message) ||
    'Something went wrong. Please try again later.';

  if (raw.startsWith('{') || raw.includes('"stack"')) {
    const reparsed = extractNetbayApiMessage(raw) || extractNetbayApiMessage(err?.body);
    if (reparsed) raw = reparsed;
  }

  raw = stripNetbayInternalPrefix(raw);

  const rebuild = formatRebuildLimitMessage(raw);
  if (rebuild) return rebuild;

  if (status === 429 && !/rebuild limit/i.test(raw)) {
    return {
      message: raw || 'Too many requests. Please wait a few minutes and try again.',
      code: 'NETBAY_RATE_LIMIT',
      status: 429,
    };
  }

  return {
    message: customerServiceErrorMessage(raw, { code: 'NETBAY_API_ERROR' }),
    code: 'NETBAY_API_ERROR',
    status: typeof status === 'number' ? status : 500,
  };
}

module.exports = {
  extractNetbayApiMessage,
  toUserFacingNetbayError,
  formatRebuildLimitMessage,
};
