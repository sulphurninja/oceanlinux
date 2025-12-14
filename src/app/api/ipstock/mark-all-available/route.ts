// /src/app/api/ipstock/mark-all-available/route.ts
// One-time endpoint to mark ALL IPStock entries as available
// User will manually mark unavailable the ones they don't want
// SmartVPS sync will handle availability for SmartVPS entries automatically

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';

export async function POST(req: Request) {
  try {
    await connectDB();
    
    // Mark all IPStock entries as available
    const result = await IPStock.updateMany(
      {}, // all documents
      { $set: { available: true } }
    );
    
    console.log(`[MARK-ALL-AVAILABLE] Updated ${result.modifiedCount} IPStock entries to available`);
    
    return NextResponse.json({
      success: true,
      message: `Marked ${result.modifiedCount} IPStock entries as available`,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });
    
  } catch (error: any) {
    console.error('[MARK-ALL-AVAILABLE] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    await connectDB();
    
    const unavailableCount = await IPStock.countDocuments({ available: false });
    const availableCount = await IPStock.countDocuments({ available: true });
    const totalCount = await IPStock.countDocuments({});
    
    return NextResponse.json({
      success: true,
      message: 'POST to this endpoint to mark all IPStock as available',
      stats: {
        total: totalCount,
        currentlyAvailable: availableCount,
        currentlyUnavailable: unavailableCount
      }
    });
    
  } catch (error: any) {
    console.error('[MARK-ALL-AVAILABLE] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

