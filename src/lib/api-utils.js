import connectDB from './db';
import APIKey from '@/models/apiKeyModel';
import User from '@/models/userModel';

export async function validateAPIKey(request) {
    try {
        await connectDB();

        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { success: false, message: 'Missing or invalid authorization header' };
        }

        const apiKey = authHeader.split(' ')[1];
        if (!apiKey) {
            return { success: false, message: 'Missing API key' };
        }

        // Find API key in database
        const keyDoc = await APIKey.findOne({ key: apiKey, isActive: true });
        if (!keyDoc) {
            return { success: false, message: 'Invalid or inactive API key' };
        }

        // Check if key is expired
        if (keyDoc.expiresAt && new Date() > keyDoc.expiresAt) {
            return { success: false, message: 'API key has expired' };
        }

        // Get user details
        const user = await User.findById(keyDoc.userId);
        if (!user) {
            return { success: false, message: 'User not found' };
        }

        // Update usage count and last used
        keyDoc.usageCount += 1;
        keyDoc.lastUsed = new Date();
        await keyDoc.save();

        // Check API rate limits
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        if (user.apiSettings.lastResetDate < monthStart) {
            // Reset monthly usage
            user.apiSettings.currentMonthUsage = 0;
            user.apiSettings.lastResetDate = now;
            await user.save();
        }

        if (user.apiSettings.currentMonthUsage >= user.apiSettings.monthlyLimit) {
            return { success: false, message: 'Monthly API limit exceeded' };
        }

        return {
            success: true,
            user,
            apiKey: keyDoc,
            permissions: keyDoc.permissions
        };

    } catch (error) {
        console.error('API key validation error:', error);
        return { success: false, message: 'Internal server error' };
    }
}
