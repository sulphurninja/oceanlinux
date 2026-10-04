/**
 * Customer-typed name / ticket text. HTML tags must not be stored.
 * Admin pages render this as text, but email and future screens should not
 * receive an <img onerror> payload in the first place.
 */
const MARKUP = /<|>|javascript\s*:|onerror\s*=|onload\s*=/i;

export function assertPlainText(value, label = 'Text') {
  const text = String(value ?? '').replace(/\0/g, '').trim();
  if (!text || MARKUP.test(text)) {
    const error = new Error(
      text
        ? `${label} cannot include HTML. Write a normal message.`
        : `${label} is required`
    );
    error.status = 400;
    return { ok: false, error, text: '' };
  }
  return { ok: true, text, error: null };
}

/** Drop tags so a poisoned display name is not copied onto a new ticket. */
export function plainDisplayName(value) {
  const cleaned = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'Customer';
}
