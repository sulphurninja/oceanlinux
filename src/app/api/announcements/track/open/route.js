import { NextResponse } from 'next/server';
import {
  recordAnnouncementEmailOpen,
  TRANSPARENT_GIF,
} from '@/lib/announcementTracking';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const announcementId = searchParams.get('a');
  const userId = searchParams.get('u');

  try {
    await recordAnnouncementEmailOpen(announcementId, userId);
  } catch (error) {
    console.error('[ANNOUNCEMENT-TRACK] open failed:', error.message);
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  });
}
