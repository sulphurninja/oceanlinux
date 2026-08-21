import { NextResponse } from 'next/server';
import {
  recordAnnouncementLinkClick,
  resolveAnnouncementRedirect,
} from '@/lib/announcementTracking';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const announcementId = searchParams.get('a');
  const userId = searchParams.get('u');
  const to = searchParams.get('to');

  try {
    await recordAnnouncementLinkClick(announcementId, userId);
  } catch (error) {
    console.error('[ANNOUNCEMENT-TRACK] click failed:', error.message);
  }

  const destination = resolveAnnouncementRedirect(to);
  return NextResponse.redirect(destination, 302);
}
