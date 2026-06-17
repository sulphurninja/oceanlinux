// src/app/api/ipstock/update.js
import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import IPStock from '../../../../models/ipStockModel';
import { enforceAdmin } from '@/lib/apiSecurity';

const {
  toPlainConfigurations,
  mergeDefaultConfigurationsPlain,
} = require('@/lib/advpsLiveStock');

export async function PUT(req, res) {
  const denied = await enforceAdmin(req);
  if (denied) return denied;

  const reqBody = await req.json();
  const { _id, name, available, serverType, tags, memoryOptions, promoCodes, defaultConfigurations, company, stockCount } = reqBody;

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

    const resolvedCompany = company !== undefined
      ? (company && company !== 'none' ? company : null)
      : existing.company;

    const updatePayload = {
      name: mergedName,
      serverType,
      tags,
      memoryOptions,
      promoCodes,
      defaultConfigurations: mergedDefaults,
      company: resolvedCompany,
    };

    if (resolvedCompany) {
      const count = stockCount !== undefined
        ? Math.max(0, Math.floor(Number(stockCount) || 0))
        : Math.max(0, Number(existing.stockCount) || 0);
      updatePayload.stockCount = count;
      updatePayload.available = count > 0;
    } else if (available !== undefined) {
      updatePayload.available = available;
    } else {
      updatePayload.available = existing.available;
    }

    const updatedStock = await IPStock.findByIdAndUpdate(
      _id,
      updatePayload,
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
  const denied = await enforceAdmin(req);
  if (denied) return denied;

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
