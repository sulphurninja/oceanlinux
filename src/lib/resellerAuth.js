import Reseller from '@/models/resellerModel';
import crypto from 'crypto';

/**
 * Authenticates a reseller API request
 * @param {Request} request 
 * @returns {Promise<{success: boolean, reseller?: Object, message?: string, status?: number}>}
 */
export async function authenticateReseller(request) {
    try {
        const apiKey = request.headers.get('x-api-key');
        const apiSecret = request.headers.get('x-api-secret');

        if (!apiKey || !apiSecret) {
            return { success: false, message: 'Missing API credentials', status: 401 };
        }

        // Find reseller by API Key
        const reseller = await Reseller.findOne({ apiKey }).select('+apiSecret');

        if (!reseller) {
            return { success: false, message: 'Invalid API Key', status: 401 };
        }

        // Verify Secret (Direct comparison for now as per model, in future should be hashed)
        // Note: In a real prod env, we'd hash the input secret and compare.
        // Assuming current implementation stores it plainly or we need to match it.
        // Based on create logic: `apiSecret` was stored directly.
        if (reseller.apiSecret !== apiSecret) {
            return { success: false, message: 'Invalid API Secret', status: 401 };
        }

        if (reseller.status !== 'active') {
            return { success: false, message: 'Reseller account is not active', status: 403 };
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
