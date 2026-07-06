// src/app/api/ipstock/update.js
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import Company from '@/models/companyModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { usesNetbayLiveStock, usesResellerLiveStock } from '@/lib/ipStockAvailability';

const {
  toPlainConfigurations,
  mergeDefaultConfigurationsPlain,
} = require('@/lib/advpsLiveStock');
const { syncResellerIpStockRow } = require('@/lib/resellerLiveStock');

export async function PUT(req, res) {
  const denied = await enforceAdmin(req);
  if (denied) return denied;

  const reqBody = await req.json();
  const { _id, name, available, serverType, tags, memoryOptions, promoCodes, defaultConfigurations, company, stockCount, hiddenFromStore } = reqBody;

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

    if ('hiddenFromStore' in reqBody) {
      updatePayload.hiddenFromStore = reqBody.hiddenFromStore === true;
    }

    const plainMerged = toPlainConfigurations(mergedDefaults);
    const resolvedTags = tags !== undefined ? tags : (existing.tags || []);
    const hasNetbayPlans = !!(
      plainMerged?.netbay?.planByMemory &&
      Object.values(plainMerged.netbay.planByMemory).some(Boolean)
    );
    const hasResellerPlans = !!(
      plainMerged?.resellerApi ||
      (resolvedTags || []).map((t) => String(t).toLowerCase()).some((t) =>
        t === 'reseller-api' || t === 'primevps' || t === 'primevm'
      )
    );

    let companyDoc = null;
    if (resolvedCompany) {
      companyDoc = await Company.findById(resolvedCompany).select('netbayApi resellerApi').lean();
    }

    const netbayLiveStock =
      hasNetbayPlans &&
      usesNetbayLiveStock(
        { company: resolvedCompany, defaultConfigurations: { netbay: plainMerged?.netbay } },
        companyDoc
      );

    const resellerLiveStock =
      hasResellerPlans &&
      usesResellerLiveStock(
        { company: resolvedCompany, tags: resolvedTags, defaultConfigurations: { resellerApi: plainMerged?.resellerApi } },
        companyDoc
      );

    if (resolvedCompany && !netbayLiveStock && !resellerLiveStock) {
      const count = stockCount !== undefined
        ? Math.max(0, Math.floor(Number(stockCount) || 0))
        : Math.max(0, Number(existing.stockCount) || 0);
      updatePayload.stockCount = count;
      updatePayload.available = count > 0;
    } else if (netbayLiveStock || resellerLiveStock) {
      // Live stock: availability comes from panel sync — do not zero stockCount on save.
      if (existing.availabilityManual && available !== undefined) {
        updatePayload.available = available;
      }
    } else if (available !== undefined) {
      updatePayload.available = available;
    } else {
      updatePayload.available = existing.available;
    }

    if ('hiddenFromStore' in reqBody) {
      await IPStock.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(String(_id)) },
        { $set: { hiddenFromStore: reqBody.hiddenFromStore === true } }
      );
    }

    const updatedStock = await IPStock.findByIdAndUpdate(
      _id,
      updatePayload,
      { new: true }
    );

    if (!updatedStock) {
      return NextResponse.json({ message: 'IP Stock not found' });
    }

    if ('hiddenFromStore' in reqBody) {
      updatedStock.hiddenFromStore = reqBody.hiddenFromStore === true;
    }

    let finalStock = updatedStock;
    if (resellerLiveStock && hasResellerPlans) {
      try {
        finalStock = await syncResellerIpStockRow(updatedStock, { force: true }) || updatedStock;
      } catch (syncErr) {
        console.warn('[IPSTOCK-UPDATE] reseller live sync failed:', syncErr.message);
      }
    }

    const responseDoc = finalStock.toObject ? finalStock.toObject() : finalStock;
    if ('hiddenFromStore' in reqBody) {
      responseDoc.hiddenFromStore = reqBody.hiddenFromStore === true;
    }
    return new Response(JSON.stringify(responseDoc), {
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
