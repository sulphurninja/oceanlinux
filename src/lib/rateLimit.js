import { NextResponse } from 'next/server';
import { getDataFromTokenSafe } from '@/helper/getDataFromToken';

const buckets = new Map();

function clientKey(request, scope) {
  if (scope === 'user') {
    const userId = getDataFromTokenSafe(request);
    if (userId) return `user:${userId}`;
  }
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

function pruneBucket(bucket, windowMs, now) {
  while (bucket.length && now - bucket[0] > windowMs) {
    bucket.shift();
  }
}

/**
 * Lightweight in-memory rate limiter (per serverless instance).
 * Returns NextResponse 429 on exceed, otherwise null.
 */
export function enforceRateLimit(request, {
  max = 40,
  windowMs = 60_000,
  scope = 'ip',
  message = 'Too many requests. Please wait a moment and try again.',
} = {}) {
  const now = Date.now();
  const key = `${scope}:${clientKey(request, scope)}`;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = [];
    buckets.set(key, bucket);
  }
  pruneBucket(bucket, windowMs, now);
  if (bucket.length >= max) {
    return NextResponse.json(
      { success: false, message, code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(windowMs / 1000)) } }
    );
  }
  bucket.push(now);
  return null;
}

export function enforceUserActionRateLimit(request, options = {}) {
  return enforceRateLimit(request, {
    max: 25,
    windowMs: 60_000,
    scope: 'user',
    ...options,
  });
}

export function enforcePaymentRateLimit(request, options = {}) {
  return enforceRateLimit(request, {
    max: 15,
    windowMs: 60_000,
    scope: 'user',
    ...options,
  });
}
