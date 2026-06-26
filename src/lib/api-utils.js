import crypto from 'crypto';
import { NextResponse } from 'next/server';
import connectDB from './db';
import APIKey from '@/models/apiKeyModel';
import User from '@/models/userModel';

export function generateAPIKey() {
  return `ol_${crypto.randomBytes(32).toString('hex')}`;
}

export function hasApiPermission(permissions, required) {
  if (!Array.isArray(permissions)) return false;
  if (permissions.includes(required)) return true;
  // Aliases used across docs / dashboard
  if (required === 'wallet:read') {
    return permissions.some((p) => ['billing:read', 'orders:read', 'servers:write'].includes(p));
  }
  if (required === 'servers:read') {
    return permissions.includes('orders:read') || permissions.includes('servers:write');
  }
  return false;
}

export function apiAuthFailure(authResult) {
  const message = authResult.message || 'Unauthorized';
  const status =
    message.includes('permission') || message.includes('Insufficient')
      ? 403
      : message.includes('limit')
        ? 429
        : 401;
  return NextResponse.json({ error: message, message }, { status });
}

export async function validateAPIKey(request, { requiredPermission } = {}) {
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

    const keyDoc = await APIKey.findOne({ key: apiKey, isActive: true });
    if (!keyDoc) {
      return { success: false, message: 'Invalid or inactive API key' };
    }

    if (keyDoc.expiresAt && new Date() > keyDoc.expiresAt) {
      return { success: false, message: 'API key has expired' };
    }

    const user = await User.findById(keyDoc.userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    if (requiredPermission && !hasApiPermission(keyDoc.permissions, requiredPermission)) {
      return { success: false, message: `Insufficient permissions (${requiredPermission} required)` };
    }

    keyDoc.usageCount += 1;
    keyDoc.lastUsed = new Date();
    await keyDoc.save();

    const settings = user.apiSettings || {
      monthlyLimit: 1000,
      currentMonthUsage: 0,
      lastResetDate: new Date(),
    };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastReset = settings.lastResetDate ? new Date(settings.lastResetDate) : new Date(0);

    if (lastReset < monthStart) {
      user.apiSettings = {
        ...settings,
        currentMonthUsage: 0,
        lastResetDate: now,
      };
      await user.save();
    } else if (!user.apiSettings) {
      user.apiSettings = settings;
      await user.save();
    }

    const usage = user.apiSettings?.currentMonthUsage ?? settings.currentMonthUsage ?? 0;
    const limit = user.apiSettings?.monthlyLimit ?? settings.monthlyLimit ?? 1000;

    if (usage >= limit) {
      return { success: false, message: 'Monthly API limit exceeded' };
    }

    return {
      success: true,
      user,
      apiKey: keyDoc,
      permissions: keyDoc.permissions,
    };
  } catch (error) {
    console.error('API key validation error:', error);
    return { success: false, message: 'Internal server error' };
  }
}

export async function incrementApiUsage(userId) {
  await User.findByIdAndUpdate(userId, { $inc: { 'apiSettings.currentMonthUsage': 1 } });
}
