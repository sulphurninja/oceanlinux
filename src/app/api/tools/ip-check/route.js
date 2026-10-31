import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rateLimit';

const { parseCheckLine, checkDedicatedIp } = require('@/lib/dedicatedIpCheck');

export const maxDuration = 30;
export const runtime = 'nodejs';

function visitorIp(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0].trim();
  return first || request.headers.get('x-real-ip') || '';
}

export async function GET(request) {
  return NextResponse.json({ success: true, ip: visitorIp(request) });
}

export async function POST(request) {
  const rateLimited = enforceRateLimit(request, {
    max: 80,
    windowMs: 600_000,
    scope: 'ip',
    message: 'Too many IP checks. Please wait a few minutes.',
  });
  if (rateLimited) return rateLimited;

  try {
    const body = await request.json();
    const mode = body?.mode === 'host' ? 'host' : 'auth';
    const proxy = parseCheckLine(body?.proxy, mode);
    if (!proxy) {
      return NextResponse.json(
        { success: false, message: mode === 'host' ? 'Use ip:port' : 'Use ip:port:username:password' },
        { status: 400 }
      );
    }
    const result = await checkDedicatedIp(proxy);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err.message || 'IP check failed' },
      { status: 500 }
    );
  }
}
