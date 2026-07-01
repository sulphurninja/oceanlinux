import { NextResponse } from 'next/server';
import {
  ADMIN_GATE_COOKIE,
  ADMIN_GATE_MAX_AGE,
  createAdminGateCookieValue,
  getAdminPanelPassword,
  verifyAdminGateCookie,
  verifyAdminGatePassword,
} from '@/lib/adminGate';

function gateCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_GATE_MAX_AGE,
  };
}

export async function GET(request) {
  if (!getAdminPanelPassword()) {
    return NextResponse.json(
      { authenticated: false, configured: false },
      { status: 503 }
    );
  }

  const token = request.cookies.get(ADMIN_GATE_COOKIE)?.value;
  const authenticated = await verifyAdminGateCookie(token);
  return NextResponse.json({ authenticated, configured: true });
}

export async function POST(request) {
  if (!getAdminPanelPassword()) {
    return NextResponse.json(
      { success: false, message: 'Admin panel password is not configured on the server.' },
      { status: 503 }
    );
  }

  let password = '';
  try {
    const body = await request.json();
    password = String(body?.password || '');
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid request' },
      { status: 400 }
    );
  }

  const ok = await verifyAdminGatePassword(password);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: 'Incorrect password' },
      { status: 401 }
    );
  }

  const token = await createAdminGateCookieValue();
  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Could not create session' },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_GATE_COOKIE, token, gateCookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_GATE_COOKIE, '', {
    ...gateCookieOptions(),
    maxAge: 0,
  });
  return response;
}
