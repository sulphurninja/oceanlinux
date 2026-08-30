import connectDB from '@/lib/db';
import KwikRawLog from '@/models/kwikRawLogModel';

/**
 * Capture a KwikUPI payload verbatim. Never throws — diagnostics must not be able
 * to break a live payment flow.
 */
export async function logKwikRaw(entry) {
  try {
    await connectDB();

    const reportedAmount = Number(entry?.reportedAmount);
    const expectedAmount = Number(entry?.expectedAmount);
    const hasBoth = Number.isFinite(reportedAmount) && Number.isFinite(expectedAmount) && expectedAmount > 0;

    await KwikRawLog.create({
      source: entry.source,
      gateway: entry.gateway || '',
      paymentId: entry.paymentId || '',
      orderId: entry.orderId || '',
      reportedStatus: entry.reportedStatus || '',
      reportedAmount: Number.isFinite(reportedAmount) ? reportedAmount : null,
      expectedAmount: Number.isFinite(expectedAmount) ? expectedAmount : null,
      amountMatches: hasBoth ? Math.abs(reportedAmount - expectedAmount) <= 1 : null,
      signatureValid: typeof entry.signatureValid === 'boolean' ? entry.signatureValid : null,
      headers: entry.headers || null,
      raw: entry.raw ?? null,
      note: entry.note || '',
    });
  } catch (err) {
    console.error('[kwikRawLog] failed to store payload:', err?.message);
  }
}

/** Test payments created from the admin diagnostics page. */
export function isKwikTestOrderId(orderId) {
  return String(orderId || '').startsWith('KWIKTEST_');
}
