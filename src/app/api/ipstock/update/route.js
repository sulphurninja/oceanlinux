// src/app/api/ipstock/update.js
import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import IPStock from '../../../../models/ipStockModel';

const {
  toPlainConfigurations,
  mergeDefaultConfigurationsPlain,
  isAdvpsIpStockName,
  fetchAdvpsStockMap,
  applyStockMapToAdvpsBlock,
  cloneAdvpsForMutation,
} = require('@/lib/advpsLiveStock');

export async function PUT(req, res) {
  const reqBody = await req.json();
  const { _id, name, available, serverType, tags, memoryOptions, promoCodes, defaultConfigurations, company } = reqBody;

  await connectDB();

  try {
    const existing = await IPStock.findById(_id).lean();
    if (!existing) {
      return NextResponse.json({ message: 'IP Stock not found' });
    }

    const mergedName = name !== undefined ? name : existing.name;
    const plainExisting = toPlainConfigurations(existing.defaultConfigurations);
    const plainIncoming = defaultConfigurations !== undefined ? toPlainConfigurations(defaultConfigurations) : {};
    const mergedDefaults = mergeDefaultConfigurationsPlain(plainExisting, plainIncoming);
    const advps = mergedDefaults.advps;

    let finalAvailable = available;
    let finalDefaults = mergedDefaults;

    if (isAdvpsIpStockName(String(mergedName)) && advps && typeof advps === 'object') {
      try {
        console.log('[IPSTOCK-UPDATE][ADVPS] resolving availability from API', {
          _id,
          name: mergedName,
          clientSentAvailable: available,
        });
        const advpsLive = cloneAdvpsForMutation(advps);
        if (advpsLive) {
          const stockMap = await fetchAdvpsStockMap(advpsLive, { verbose: false });
          finalAvailable = applyStockMapToAdvpsBlock(advpsLive, stockMap, {
            verbose: true,
            label: mergedName,
            ipStockId: _id,
          });
          finalDefaults = { ...mergedDefaults, advps: advpsLive };
          console.log('[IPSTOCK-UPDATE][ADVPS] resolved', {
            _id,
            name: mergedName,
            finalAvailable,
            clientSentAvailable: available,
          });
        } else {
          console.warn('[IPSTOCK-UPDATE][ADVPS] cloneAdvpsForMutation returned null', { _id, name: mergedName });
        }
      } catch (e) {
        console.error('[IPSTOCK-UPDATE][ADVPS] availability fetch failed:', e.message, e.stack);
        finalAvailable = available;
        finalDefaults = mergedDefaults;
      }
    }

    const updatedStock = await IPStock.findByIdAndUpdate(
      _id,
      {
        name: mergedName,
        available: finalAvailable,
        serverType,
        tags,
        memoryOptions,
        promoCodes,
        defaultConfigurations: finalDefaults,
        company: company && company !== 'none' ? company : null,
      },
      { new: true }
    );

    if (!updatedStock) {
      return NextResponse.json({ message: 'IP Stock not found' });
    }
    return new Response(JSON.stringify(updatedStock), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to update IP Stock', error: error.message });
  }
}

export async function DELETE(req, res) {
  const reqBody = await req.json();
  const { _id } = reqBody;

  await connectDB();

  try {
    const deletedStock = await IPStock.findByIdAndDelete(_id);
    if (!deletedStock) {
      return NextResponse.json({ message: 'IP Stock not found' });
    }
    return NextResponse.json({ message: 'IP Stock deleted successfully' });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete IP Stock', error: error.message });
  }
}
