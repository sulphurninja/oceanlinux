import Reseller from '@/models/resellerModel';
import crypto from 'crypto';

/**
 * Per-reseller sliding window (in-memory, per serverless instance) so the
 * `rateLimit` value stored on the reseller is actually enforced.
 */
const resellerBuckets = new Map();

function consumeResellerRequest(resellerId, maxPerMinute) {
    const now = Date.now();
    const windowMs = 60_000;
    let bucket = resellerBuckets.get(resellerId);
    if (!bucket) {
        bucket = [];
        resellerBuckets.set(resellerId, bucket);
    }
    while (bucket.length && now - bucket[0] > windowMs) {
        bucket.shift();
    }
    if (bucket.length >= maxPerMinute) return false;
    bucket.push(now);
    return true;
}

/** Constant-time secret comparison so a wrong secret leaks no timing signal. */
function secretsMatch(stored, provided) {
    if (!stored || !provided) return false;
    const a = Buffer.from(String(stored));
    const b = Buffer.from(String(provided));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/**
 * Authenticates a reseller API request
 * @param {Request} request 
 * @returns {Promise<{success: boolean, reseller?: Object, message?: string, status?: number}>}
 */
export async function authenticateReseller(request) {
    try {
        const apiKey =
            request.headers.get('x-api-key') ||
            request.headers.get('x-reseller-api-key');
        const apiSecret =
            request.headers.get('x-api-secret') ||
            request.headers.get('x-reseller-api-secret');

        if (!apiKey || !apiSecret) {
            return { success: false, message: 'Missing API credentials', status: 401 };
        }

        // Find reseller by API Key
        const reseller = await Reseller.findOne({ apiKey }).select('+apiSecret');

        if (!reseller) {
            return { success: false, message: 'Invalid API Key', status: 401 };
        }

        if (!secretsMatch(reseller.apiSecret, apiSecret)) {
            return { success: false, message: 'Invalid API Secret', status: 401 };
        }

        if (reseller.status !== 'active') {
            return { success: false, message: 'Reseller account is not active', status: 403 };
        }

        // The schema advertises a per-minute rateLimit; without this it was never
        // actually applied, so a key could hammer the API without limit.
        const perMinute = Number(reseller.rateLimit) > 0 ? Number(reseller.rateLimit) : 100;
        if (!consumeResellerRequest(String(reseller._id), perMinute)) {
            return {
                success: false,
                message: `Rate limit exceeded (${perMinute} requests/minute)`,
                status: 429,
            };
        }

        // Update usage stats (fire and forget)
        await Reseller.findByIdAndUpdate(reseller._id, {
            $inc: { 'apiUsage.requestCount': 1 },
            $set: { 'apiUsage.lastRequest': new Date() }
        });

        return { success: true, reseller };

    } catch (error) {
        console.error('Reseller Auth Error:', error);
        return { success: false, message: 'Authentication failed', status: 500 };
    }
}
