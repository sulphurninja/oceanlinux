import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get('company_session')?.value;

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const data = JSON.parse(session);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
}
