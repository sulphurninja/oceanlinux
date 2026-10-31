import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rateLimit';

const { parseProxyLine } = require('@/lib/parseProxyLine');
const { getProxyCheckTarget, listProxyCheckTargets } = require('@/lib/proxyCheckTargets');
const { checkProxyOnTarget, deriveHealthFromResults } = require('@/lib/proxyCheck');

export const maxDuration = 60;
export const runtime = 'nodejs';

const MAX_TARGETS_PER_REQUEST = 8;

export async function GET() {
  return NextResponse.json({
    success: true,
    targets: listProxyCheckTargets(),
    format: 'ip:port:username:password',
  });
}

export async function POST(request) {
  const rateLimited = enforceRateLimit(request, {
    max: 15,
    windowMs: 600_000,
    scope: 'ip',
    message: 'Too many proxy checks. Please wait a few minutes.',
  });
  if (rateLimited) return rateLimited;

  try {
    const body = await request.json();
    const proxyLine = String(body?.proxy || body?.proxyLine || '').trim();
    const targetIds = Array.isArray(body?.targets) ? body.targets.map(String) : [];
    const proxy = parseProxyLine(proxyLine);
    if (!proxy) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid proxy format. Use ip:port:username:password',
        },
        { status: 400 }
      );
    }

    if (!targetIds.length) {
      return NextResponse.json(
        { success: false, message: 'Select at least one website to check' },
        { status: 400 }
      );
    }

    if (targetIds.length > MAX_TARGETS_PER_REQUEST) {
      return NextResponse.json(
        {
          success: false,
          message: `Maximum ${MAX_TARGETS_PER_REQUEST} websites per check`,
        },
        { status: 400 }
      );
    }

    const targets = [];
    for (const id of targetIds) {
      const t = getProxyCheckTarget(id);
      if (!t) {
        return NextResponse.json(
          { success: false, message: `Unknown website: ${id}` },
          { status: 400 }
        );
      }
      targets.push(t);
    }

    const results = await Promise.all(
      targets.map((target) => checkProxyOnTarget(proxy, target, { timeoutMs: 12000 }))
    );

    const health = deriveHealthFromResults(results);
    const workingCount = results.filter((r) => r.working).length;

    return NextResponse.json({
      success: true,
      proxy: { ip: proxy.ip, port: proxy.port, username: proxy.username },
      health,
      summary: {
        total: results.length,
        working: workingCount,
        failed: results.length - workingCount,
      },
      results,
    });
  } catch (err) {
    console.error('[proxy-check]', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Proxy check failed' },
      { status: 500 }
    );
  }
}
