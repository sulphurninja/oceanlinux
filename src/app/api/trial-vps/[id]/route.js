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

export async function GET(request, { params }) {
  await connectDB();
  try {
    const admin = await requireAdmin(request);
    const { id } = await params;
    const pkg = await TrialVpsPackage.findById(id).lean();
    if (!pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }
    return NextResponse.json(sanitizeTrialVpsPackage(pkg, { includeSlots: !!admin }));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  await connectDB();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const pkg = await TrialVpsPackage.findById(id);
    if (!pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    let addedSlots = 0;
    let addVpsErrors;
    if (body.addVps) {
      const categoryForParse =
        body.planCategory !== undefined
          ? normalizeTrialVpsPlanCategory(body.planCategory)
          : pkg.planCategory;
      const { slots, errors } = parseTrialVpsBulkLines(body.addVps, {
        planCategory: categoryForParse,
      });
      if (!slots.length) {
        return NextResponse.json({ error: 'No valid VPS lines to add' }, { status: 400 });
      }
      pkg.slots.push(...slots);
      addedSlots = slots.length;
      addVpsErrors = errors.length ? errors : undefined;
    }

    if (body.removeSlotIds && Array.isArray(body.removeSlotIds)) {
      const ids = new Set(body.removeSlotIds.map(String));
      const blocked = pkg.slots.filter((s) => ids.has(s._id.toString()) && s.allocated);
      if (blocked.length) {
        return NextResponse.json(
          { error: `Cannot remove ${blocked.length} allocated slot(s)` },
          { status: 400 }
        );
      }
      const before = pkg.slots.length;
      pkg.slots = pkg.slots.filter((s) => !ids.has(s._id.toString()));
      await pkg.save();
      const saved = await TrialVpsPackage.findById(pkg._id).lean();
      return NextResponse.json({
        success: true,
        removed: before - (saved?.slots?.length ?? 0),
        package: sanitizeTrialVpsPackage(saved, { includeSlots: true }),
      });
    }

    if (body.name !== undefined) pkg.name = body.name;
    if (body.description !== undefined) pkg.description = body.description;
    if (body.price !== undefined) pkg.price = Math.max(0, Number(body.price) || 0);
    if (body.trialDays !== undefined) {
      pkg.trialDays = Math.max(1, Math.floor(Number(body.trialDays) || 7));
    }
    if (body.planCategory !== undefined) {
      pkg.planCategory = normalizeTrialVpsPlanCategory(body.planCategory);
    }
    if (body.memoryGb !== undefined) {
      pkg.memoryGb = normalizeTrialVpsMemoryGb(body.memoryGb, pkg.planCategory);
    } else if (body.planCategory !== undefined && pkg.planCategory === 'premium_proxy') {
      pkg.memoryGb = 0;
    }
    if (body.available !== undefined) pkg.available = !!body.available;
    if (body.promoCodes !== undefined) pkg.promoCodes = body.promoCodes;

    if (body.manageCompanyId !== undefined) {
      const raw = body.manageCompanyId;
      if (!raw) {
        pkg.manageCompanyId = null;
      } else {
        if ((pkg.planCategory || 'linux') === 'premium_proxy') {
          return NextResponse.json({ error: 'Premium IP Proxy trials cannot use company manage' }, { status: 400 });
        }
        const company = await Company.findById(raw).lean();
        if (!company) {
          return NextResponse.json({ error: 'Selected company not found' }, { status: 400 });
        }
        if (!companyHasPanelManageApi(company)) {
          return NextResponse.json({ error: 'Company has no panel API configured' }, { status: 400 });
        }
        pkg.manageCompanyId = company._id;
      }
    }

    if (body.manageIpStockId !== undefined) {
      const raw = body.manageIpStockId;
      if (!raw) {
        pkg.manageIpStockId = null;
      } else {
        const cat = pkg.planCategory || 'linux';
        if (cat === 'premium_proxy') {
          return NextResponse.json(
            { error: 'Premium IP Proxy trials cannot use linked manage stock' },
            { status: 400 }
          );
        }
        const stock = await IPStock.findById(raw).select('_id').lean();
        if (!stock) {
          return NextResponse.json({ error: 'Linked IP stock not found' }, { status: 400 });
        }
        pkg.manageIpStockId = stock._id;
      }
    }

    await pkg.save();

    const managePatch = {};
    if (body.manageCompanyId !== undefined) {
      managePatch.manageCompanyId = pkg.manageCompanyId ?? null;
    }
    if (body.manageIpStockId !== undefined) {
      managePatch.manageIpStockId = pkg.manageIpStockId ?? null;
    }
    if (Object.keys(managePatch).length) {
      await TrialVpsPackage.collection.updateOne({ _id: pkg._id }, { $set: managePatch });
      Object.assign(pkg, managePatch);
    }

    const saved = await TrialVpsPackage.findById(pkg._id).lean();
    return NextResponse.json({
      success: true,
      ...(addedSlots ? { added: addedSlots, errors: addVpsErrors } : {}),
      package: saved || pkg,
    });
  } catch (error) {
    console.error('[TRIAL-VPS] PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  await connectDB();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const pkg = await TrialVpsPackage.findById(id);
    if (!pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }
    const allocated = (pkg.slots || []).filter((s) => s.allocated).length;
    if (allocated > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${allocated} slot(s) still allocated to orders` },
        { status: 400 }
      );
    }
    await pkg.deleteOne();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
