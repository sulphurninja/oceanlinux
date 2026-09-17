import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { sanitizeTrialVpsPackage } from '@/lib/apiSecurity';
const TrialVpsPackage = require('@/models/trialVpsPackageModel');
const IPStock = require('@/models/ipStockModel');
const Company = require('@/models/companyModel').default || require('@/models/companyModel');
const { companyHasPanelManageApi } = require('@/lib/companyAutomationMeta');
const { parseTrialVpsBulkLines } = require('@/lib/trialVpsBulkParse');
const {
  normalizeTrialVpsPlanCategory,
  normalizeTrialVpsMemoryGb,
} = require('@/lib/trialVpsCatalog');

export async function POST(request) {
  await connectDB();

  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      name,
      description,
      price,
      trialDays,
      memoryGb,
      planCategory: planCategoryRaw,
      available,
      bulkVps,
      promoCodes,
      manageIpStockId,
      manageCompanyId,
    } = body;
    const planCategory = planCategoryRaw ?? body.type ?? body.packageType;

    if (!name || price === undefined || !bulkVps) {
      return NextResponse.json(
        { error: 'Name, price, trial days, and bulk VPS lines are required' },
        { status: 400 }
      );
    }

    const days = Math.max(1, Math.floor(Number(trialDays) || 7));
    const category = normalizeTrialVpsPlanCategory(planCategory);
    const memoryForPackage =
      category === 'premium_proxy' ? 0 : normalizeTrialVpsMemoryGb(memoryGb, category);
    const { slots, errors } = parseTrialVpsBulkLines(bulkVps, { planCategory: category });

    if (slots.length === 0) {
      return NextResponse.json(
        { error: 'No valid VPS rows. Use ip:username:password or ip,username,password' },
        { status: 400 }
      );
    }

    let manageStockRef = null;
    let manageCompanyRef = null;
    if (category === 'premium_proxy' && (manageIpStockId || manageCompanyId)) {
      return NextResponse.json(
        { error: 'Premium IP Proxy trials cannot use panel manage' },
        { status: 400 }
      );
    }
    if (manageCompanyId) {
      const company = await Company.findById(manageCompanyId).lean();
      if (!company) {
        return NextResponse.json({ error: 'Selected company not found' }, { status: 400 });
      }
      if (!companyHasPanelManageApi(company)) {
        return NextResponse.json(
          { error: 'Company has no panel API configured (Virtualizor, Prime, Netbay, etc.)' },
          { status: 400 }
        );
      }
      manageCompanyRef = company._id;
    }
    if (manageIpStockId) {
      const stock = await IPStock.findById(manageIpStockId).select('_id').lean();
      if (!stock) {
        return NextResponse.json({ error: 'Linked IP stock not found' }, { status: 400 });
      }
      manageStockRef = stock._id;
    }

    const newPackage = new TrialVpsPackage({
      name,
      description: description || '',
      trialDays: days,
      memoryGb: memoryForPackage,
      planCategory: category,
      price: Math.max(0, Number(price) || 0),
      available: available !== false,
      manageCompanyId: manageCompanyRef,
      manageIpStockId: manageStockRef,
      slots,
      promoCodes: promoCodes || [],
    });

    await newPackage.save();

    const verified = await TrialVpsPackage.findById(newPackage._id)
      .select('planCategory manageCompanyId manageIpStockId')
      .lean();
    const schemaPatch = {};
    if (!verified?.planCategory || verified.planCategory !== category) {
      schemaPatch.planCategory = category;
      newPackage.planCategory = category;
    }
    if (manageCompanyRef && String(verified?.manageCompanyId || '') !== String(manageCompanyRef)) {
      schemaPatch.manageCompanyId = manageCompanyRef;
      newPackage.manageCompanyId = manageCompanyRef;
    }
    if (manageStockRef && String(verified?.manageIpStockId || '') !== String(manageStockRef)) {
      schemaPatch.manageIpStockId = manageStockRef;
      newPackage.manageIpStockId = manageStockRef;
    }
    if (Object.keys(schemaPatch).length) {
      await TrialVpsPackage.collection.updateOne({ _id: newPackage._id }, { $set: schemaPatch });
    }

    return NextResponse.json(
      {
        success: true,
        package: newPackage,
        parsed: slots.length,
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[TRIAL-VPS] Create error:', error);
    return NextResponse.json(
      { error: 'Failed to create trial package', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  await connectDB();

  try {
    const admin = await requireAdmin(request);
    const packages = await TrialVpsPackage.find({}).lean();

    let result = packages.map((pkg) =>
      sanitizeTrialVpsPackage(pkg, { includeSlots: !!admin })
    );

    if (!admin) {
      const { getResellerFromRequest, applyResellerPricingToSlot } = await import(
        '@/lib/resellerStorePricing'
      );
      const reseller = await getResellerFromRequest(request);
      if (reseller) {
        result = result.map((pkg) => applyResellerPricingToSlot(pkg, reseller));
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[TRIAL-VPS] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
