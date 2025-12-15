// /src/app/api/ipstock/cleanup/route.ts
// One-time cleanup to fix the mess:
// 1. Remove 🌊 emoji from IPStock names that are NOT SmartVPS
// 2. Remove 'ocean linux' tag from IPStock that are NOT SmartVPS
// 3. Only keep 🌊 and 'ocean linux' for entries with defaultConfigurations.smartvps block

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';

function toPlainMap(maybeMap: any): Record<string, any> {
  if (!maybeMap) return {};
  if (typeof maybeMap.toObject === 'function') {
    return maybeMap.toObject({ minimize: true }) as Record<string, any>;
  }
  if (maybeMap instanceof Map) {
    return Object.fromEntries(maybeMap as Map<string, any>);
  }
  return { ...maybeMap };
}

export async function POST(req: Request) {
  try {
    await connectDB();
    
    const results: any[] = [];
    let fixedEmoji = 0;
    let fixedTags = 0;
    
    // Get ALL IPStock entries
    const allIPStocks = await IPStock.find({});
    console.log(`[CLEANUP] Total IPStock entries: ${allIPStocks.length}`);
    
    for (const doc of allIPStocks) {
      const currentName = doc.name || '';
      const currentTags = doc.tags || [];
      
      // Check if this is a REAL SmartVPS entry (has smartvps config block)
      const defaultConfigs = toPlainMap(doc.defaultConfigurations);
      const hasSmartVpsConfig = defaultConfigs?.smartvps?.packagePid && defaultConfigs?.smartvps?.packageName;
      
      const updates: any = {};
      let needsUpdate = false;
      
      if (hasSmartVpsConfig) {
        // This IS a SmartVPS entry - it SHOULD have 🌊 and 'ocean linux' tag
        // Make sure name has 🌊 prefix
        const packageName = defaultConfigs.smartvps.packageName;
        const expectedName = `🌊 ${packageName}`;
        
        if (!currentName.startsWith('🌊')) {
          updates.name = expectedName;
          needsUpdate = true;
          console.log(`[CLEANUP] SmartVPS entry missing emoji: "${currentName}" → "${expectedName}"`);
        }
        
        // Make sure tags include 'ocean linux'
        if (!currentTags.includes('ocean linux')) {
          updates.tags = ['ocean linux'];
          needsUpdate = true;
          console.log(`[CLEANUP] SmartVPS entry missing tag: "${currentName}"`);
        }
        
        if (needsUpdate) {
          await IPStock.findByIdAndUpdate(doc._id, updates);
          results.push({
            action: 'fixed_smartvps_entry',
            id: doc._id.toString(),
            name: currentName,
            updates
          });
        }
      } else {
        // This is NOT a SmartVPS entry - REMOVE 🌊 and 'ocean linux' tag if present
        
        // Remove 🌊 emoji from name if present
        if (currentName.startsWith('🌊')) {
          const cleanName = currentName.replace(/^🌊\s*/, '').trim();
          updates.name = cleanName;
          needsUpdate = true;
          fixedEmoji++;
          console.log(`[CLEANUP] Removing emoji from non-SmartVPS: "${currentName}" → "${cleanName}"`);
        }
        
        // Remove 'ocean linux' tag if present
        const hasOceanLinuxTag = currentTags.some((t: string) => t.toLowerCase() === 'ocean linux');
        if (hasOceanLinuxTag) {
          const newTags = currentTags.filter((t: string) => t.toLowerCase() !== 'ocean linux');
          updates.tags = newTags.length > 0 ? newTags : ['Premium']; // Fallback to 'Premium' if no tags left
          needsUpdate = true;
          fixedTags++;
          console.log(`[CLEANUP] Removing ocean linux tag from non-SmartVPS: "${currentName}"`);
        }
        
        if (needsUpdate) {
          await IPStock.findByIdAndUpdate(doc._id, updates);
          results.push({
            action: 'fixed_non_smartvps_entry',
            id: doc._id.toString(),
            name: currentName,
            updates
          });
        }
      }
    }
    
    console.log(`[CLEANUP] Done. Fixed emoji: ${fixedEmoji}, Fixed tags: ${fixedTags}`);
    
    return NextResponse.json({
      success: true,
      summary: {
        totalProcessed: allIPStocks.length,
        fixedEmoji,
        fixedTags,
        totalFixed: results.length
      },
      results
    });
    
  } catch (error: any) {
    console.error('[CLEANUP] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  // GET just shows a preview without making changes
  try {
    await connectDB();
    
    const preview: any[] = [];
    
    const allIPStocks = await IPStock.find({});
    
    for (const doc of allIPStocks) {
      const currentName = doc.name || '';
      const currentTags = doc.tags || [];
      
      const defaultConfigs = toPlainMap(doc.defaultConfigurations);
      const hasSmartVpsConfig = defaultConfigs?.smartvps?.packagePid && defaultConfigs?.smartvps?.packageName;
      
      const hasEmoji = currentName.startsWith('🌊');
      const hasOceanLinuxTag = currentTags.some((t: string) => t.toLowerCase() === 'ocean linux');
      
      // Check for issues
      const issues: string[] = [];
      
      if (hasSmartVpsConfig) {
        if (!hasEmoji) issues.push('SmartVPS entry missing 🌊 emoji');
        if (!hasOceanLinuxTag) issues.push('SmartVPS entry missing ocean linux tag');
      } else {
        if (hasEmoji) issues.push('Non-SmartVPS entry has 🌊 emoji (will remove)');
        if (hasOceanLinuxTag) issues.push('Non-SmartVPS entry has ocean linux tag (will remove)');
      }
      
      if (issues.length > 0) {
        preview.push({
          id: doc._id.toString(),
          name: currentName,
          tags: currentTags,
          hasSmartVpsConfig,
          issues
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Preview only. POST to this endpoint to apply fixes.',
      totalIPStocks: allIPStocks.length,
      issuesFound: preview.length,
      preview
    });
    
  } catch (error: any) {
    console.error('[CLEANUP PREVIEW] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


