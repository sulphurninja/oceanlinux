import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import { enforceAdmin } from '@/lib/apiSecurity';

const { toPlainConfigurations } = require('@/lib/advpsLiveStock');

function cloneMemoryOptions(src) {
  if (!src) return {};
  if (src instanceof Map) return Object.fromEntries(src);
  if (typeof src === 'object') return JSON.parse(JSON.stringify(src));
  return {};
}

function sanitizeDefaultConfigurations(configs) {
  const plain = toPlainConfigurations(configs);
  if (plain.netbay && typeof plain.netbay === 'object') {
    const { lastStockSync, variantStock, ...netbay } = plain.netbay;
    plain.netbay = netbay;
  }
  return plain;
}

/**
 * POST /api/ipstock/clone
 * Body: { sourceId: string, name?: string }
 */
export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();

  try {
    const { sourceId, name: requestedName } = await request.json();
    if (!sourceId) {
      return Response.json({ message: 'sourceId is required' }, { status: 400 });
    }

    const source = await IPStock.findById(sourceId).lean();
    if (!source) {
      return Response.json({ message: 'Source IP Stock not found' }, { status: 404 });
    }

    const cloneName = String(requestedName || `${source.name} (Copy)`).trim();
    if (!cloneName) {
      return Response.json({ message: 'Name is required' }, { status: 400 });
    }

    const linkedCompany = source.company || null;
    const count = linkedCompany ? Math.max(0, Number(source.stockCount) || 0) : 0;

    const clone = new IPStock({
      name: cloneName,
      description: source.description || '',
      available: linkedCompany ? count > 0 : !!source.available,
      hiddenFromStore: !!source.hiddenFromStore,
      stockCount: linkedCompany ? count : 0,
      company: linkedCompany,
      inventoryItems: [],
      serverType: source.serverType,
      tags: [...(source.tags || [])],
      memoryOptions: cloneMemoryOptions(source.memoryOptions),
      promoCodes: JSON.parse(JSON.stringify(source.promoCodes || [])),
      defaultConfigurations: sanitizeDefaultConfigurations(source.defaultConfigurations),
    });

    if (source.availabilityManual !== undefined) {
      clone.availabilityManual = !!source.availabilityManual;
    }

    await clone.save();

    return Response.json(clone, { status: 201 });
  } catch (error) {
    console.error('[IPSTOCK-CLONE] error:', error);
    return Response.json(
      { message: 'Failed to clone IP Stock', error: error.message },
      { status: 500 }
    );
  }
}
