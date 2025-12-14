// /src/app/api/ipstock/delete-duplicates/route.ts
// Delete duplicate IPStock entries (keep only one per name)

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';

export async function GET(req: Request) {
  // GET = preview only
  try {
    await connectDB();
    
    const all = await IPStock.find({}).sort({ createdAt: 1 }); // oldest first
    
    const seenNames = new Map<string, any>(); // name -> first doc
    const duplicates: any[] = [];
    
    for (const doc of all) {
      const name = doc.name;
      if (seenNames.has(name)) {
        duplicates.push({
          id: doc._id.toString(),
          name: doc.name,
          keepingId: seenNames.get(name)._id.toString()
        });
      } else {
        seenNames.set(name, doc);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Preview only. POST to delete duplicates.',
      totalEntries: all.length,
      uniqueNames: seenNames.size,
      duplicatesFound: duplicates.length,
      duplicates
    });
    
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    
    console.log('[DELETE-DUPLICATES] Starting...');
    
    const all = await IPStock.find({}).sort({ createdAt: 1 }); // oldest first (keep oldest)
    
    const seenNames = new Map<string, any>(); // name -> first doc
    const toDelete: string[] = [];
    
    for (const doc of all) {
      const name = doc.name;
      if (seenNames.has(name)) {
        // Duplicate - mark for deletion
        toDelete.push(doc._id.toString());
        console.log(`[DELETE-DUPLICATES] Will delete duplicate: ${name} (${doc._id})`);
      } else {
        seenNames.set(name, doc);
      }
    }
    
    // Delete duplicates
    let deleted = 0;
    for (const id of toDelete) {
      await IPStock.findByIdAndDelete(id);
      deleted++;
    }
    
    console.log(`[DELETE-DUPLICATES] Done. Deleted ${deleted} duplicates.`);
    
    return NextResponse.json({
      success: true,
      deleted,
      remaining: seenNames.size
    });
    
  } catch (e: any) {
    console.error('[DELETE-DUPLICATES] Error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

