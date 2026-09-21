import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceAdmin } from '@/lib/apiSecurity';
import { getDataFromTokenSafe } from '@/helper/getDataFromToken';
import { isAdminUser } from '@/lib/adminAuth';
import User from '@/models/userModel';
const IPStock = require('@/models/ipStockModel');
import Company from '@/models/companyModel';
const {
  toPlainConfigurations,
  mergeDefaultConfigurationsPlain,
} = require('@/lib/advpsLiveStock');
const { applySmartVpsAdminLockedPricesOnSave } = require('@/lib/smartvpsPackageRam');
const { getCompanyVirtualizorAccounts } = require('@/lib/companyVirtualizor');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const { getCompanyNetbayApiConfig } = require('@/lib/companyNetbayApi');
const { getCompanyKurohostApiConfig } = require('@/lib/companyKurohostApi');
const { getCompanyJoyApiConfig } = require('@/lib/companyJoyApi');

function stripSensitiveIpStockFields(doc, { isAdmin = false } = {}) {
  if (!doc || isAdmin) return doc;
  const safe = { ...doc };
  delete safe.inventoryItems;
  delete safe.panelPassword;
  delete safe.panelUsername;
  if (safe.configurations && typeof safe.configurations === 'object') {
    const configs = { ...safe.configurations };
    for (const key of Object.keys(configs)) {
      if (configs[key] && typeof configs[key] === 'object') {
        const c = { ...configs[key] };
        delete c.apiKey;
        delete c.apiSecret;
        delete c.password;
        delete c.token;
        configs[key] = c;
      }
    }
    safe.configurations = configs;
  }
  return safe;
}

export async function GET(request, { params }) {
    console.log('[IPSTOCK-ID][GET] === REQUEST START ===');
    console.log('[IPSTOCK-ID][GET] Params:', params);

    try {
        await connectDB();
        console.log('[IPSTOCK-ID][GET] Database connected successfully');

        const ipStockId = params.id;
        console.log('[IPSTOCK-ID][GET] Fetching IPStock for ID:', ipStockId);

        if (!ipStockId) {
            console.log('[IPSTOCK-ID][GET] No IPStock ID provided');
            return NextResponse.json({ message: 'IPStock ID is required' }, { status: 400 });
        }

        const ipStock = await IPStock.findById(ipStockId).lean();
        console.log('[IPSTOCK-ID][GET] IPStock found:', ipStock ? {
            _id: ipStock._id,
            name: ipStock.name,
            tags: ipStock.tags,
            serverType: ipStock.serverType,
            available: ipStock.available
        } : 'null');

        if (!ipStock) {
            console.log('[IPSTOCK-ID][GET] IPStock not found');
            return NextResponse.json({ message: 'IP Stock not found' }, { status: 404 });
        }

        // Surface (without secrets) whether the linked company has any kind of
        // automation enabled — the order page uses this to decide whether to
        // show direct controls or the manual admin-approval UI.
        //
        // Two automation providers are supported, with priority:
        //   1. Virtualizor multi-panel  (legacy/preferred path)
        //   2. Reseller HTTP API        (Hostheaven / SomaniOne)
        //   3. Netbay reseller API      (auto-provision + power/rebuild)
        // We never leak credentials/hosts here — only enough metadata for the
        // UI to render the right controls.
        let companyAutomation = null;
        if (ipStock.company) {
            try {
                const company = await Company.findById(ipStock.company)
                    .select('virtualizors virtualizor resellerApi netbayApi kurohostApi joyApi name')
                    .lean();
                const accounts = getCompanyVirtualizorAccounts(company);
                if (accounts.length > 0) {
                    companyAutomation = {
                        provider: 'virtualizor',
                        enabled: true,
                        panelCount: accounts.length,
                        companyName: company?.name,
                    };
                } else {
                    const reseller = getCompanyResellerApiConfig(company);
                    if (reseller) {
                        companyAutomation = {
                            provider: 'reseller-api',
                            enabled: true,
                            companyName: company?.name,
                            label: reseller.label || null,
                        };
                    } else {
                        const netbay = getCompanyNetbayApiConfig(company);
                        if (netbay) {
                            companyAutomation = {
                                provider: 'netbay',
                                enabled: true,
                                companyName: company?.name,
                                label: netbay.label || null,
                            };
                        } else {
                            const kurohost = getCompanyKurohostApiConfig(company);
                            if (kurohost) {
                                companyAutomation = {
                                    provider: 'kurohost',
                                    enabled: true,
                                    companyName: company?.name,
                                    label: kurohost.label || null,
                                };
                            } else {
                                // Joy Services — manage-only (power actions + status).
                                const joy = getCompanyJoyApiConfig(company);
                                if (joy) {
                                    companyAutomation = {
                                        provider: 'joy',
                                        enabled: true,
                                        companyName: company?.name,
                                        label: joy.label || null,
                                    };
                                }
                            }
                        }
                    }
                }
            } catch (lookupErr) {
                console.warn('[IPSTOCK-ID][GET] Company automation lookup failed:', lookupErr.message);
            }
        }

        console.log('[IPSTOCK-ID][GET] Returning IPStock data', {
            companyAutomation: companyAutomation ? companyAutomation.provider : 'none',
        });

        let isAdmin = false;
        const userId = getDataFromTokenSafe(request);
        if (userId) {
            const user = await User.findById(userId).select('userType isAdmin role').lean();
            isAdmin = isAdminUser(user);
        }

        const payload = stripSensitiveIpStockFields({ ...ipStock, companyAutomation }, { isAdmin });
        return NextResponse.json(payload);
    } catch (error) {
        console.error('[IPSTOCK-ID][GET] === ERROR ===');
        console.error('[IPSTOCK-ID][GET] Error type:', error.constructor.name);
        console.error('[IPSTOCK-ID][GET] Error message:', error.message);
        console.error('[IPSTOCK-ID][GET] Error stack:', error.stack);
        return NextResponse.json(
            { message: 'Failed to fetch IP Stock', error: error.message },
            { status: 500 }
        );
    }
}

export async function PUT(request, { params }) {
    console.log('[IPSTOCK-ID][PUT] === REQUEST START ===');
    console.log('[IPSTOCK-ID][PUT] Params:', params);

    const denied = await enforceAdmin(request);
    if (denied) return denied;

    try {
        await connectDB();
        console.log('[IPSTOCK-ID][PUT] Database connected successfully');

        const ipStockId = params.id;
        console.log('[IPSTOCK-ID][PUT] Updating IPStock for ID:', ipStockId);

        if (!ipStockId) {
            console.log('[IPSTOCK-ID][PUT] No IPStock ID provided');
            return NextResponse.json({ message: 'IPStock ID is required' }, { status: 400 });
        }

        const updateData = await request.json();
        console.log('[IPSTOCK-ID][PUT] Update data received:', {
            name: updateData.name,
            available: updateData.available,
            serverType: updateData.serverType,
            tags: updateData.tags,
            hasMemoryOptions: !!updateData.memoryOptions,
            hasPromoCodes: !!updateData.promoCodes,
            hasDefaultConfigurations: !!updateData.defaultConfigurations
        });

        const existing = await IPStock.findById(ipStockId).lean();
        if (!existing) {
            console.log('[IPSTOCK-ID][PUT] IPStock not found for update');
            return NextResponse.json({ message: 'IP Stock not found' }, { status: 404 });
        }

        const mergedName = updateData.name !== undefined ? updateData.name : existing.name;
        const plainExisting = toPlainConfigurations(existing.defaultConfigurations);
        const plainIncoming = updateData.defaultConfigurations !== undefined
          ? toPlainConfigurations(updateData.defaultConfigurations)
          : {};
        let mergedDefaults = mergeDefaultConfigurationsPlain(plainExisting, plainIncoming);
        mergedDefaults = applySmartVpsAdminLockedPricesOnSave(
          mergedDefaults,
          updateData.memoryOptions,
          existing.memoryOptions
        );

        const mergedUpdate = {
          ...updateData,
          name: mergedName,
          defaultConfigurations: mergedDefaults,
        };

        const updatedIPStock = await IPStock.findByIdAndUpdate(
            ipStockId,
            mergedUpdate,
            { new: true, runValidators: true }
        ).lean();

        console.log('[IPSTOCK-ID][PUT] IPStock updated:', updatedIPStock ? {
            _id: updatedIPStock._id,
            name: updatedIPStock.name,
            tags: updatedIPStock.tags,
            serverType: updatedIPStock.serverType,
            available: updatedIPStock.available
        } : 'null');

        if (!updatedIPStock) {
            console.log('[IPSTOCK-ID][PUT] IPStock not found for update');
            return NextResponse.json({ message: 'IP Stock not found' }, { status: 404 });
        }

        console.log('[IPSTOCK-ID][PUT] Returning updated IPStock data');
        return NextResponse.json(updatedIPStock);
    } catch (error) {
        console.error('[IPSTOCK-ID][PUT] === ERROR ===');
        console.error('[IPSTOCK-ID][PUT] Error type:', error.constructor.name);
        console.error('[IPSTOCK-ID][PUT] Error message:', error.message);
        console.error('[IPSTOCK-ID][PUT] Error stack:', error.stack);
        return NextResponse.json(
            { message: 'Failed to update IP Stock', error: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(request, { params }) {
    console.log('[IPSTOCK-ID][DELETE] === REQUEST START ===');
    console.log('[IPSTOCK-ID][DELETE] Params:', params);

    const denied = await enforceAdmin(request);
    if (denied) return denied;

    try {
        await connectDB();
        console.log('[IPSTOCK-ID][DELETE] Database connected successfully');

        const ipStockId = params.id;
        console.log('[IPSTOCK-ID][DELETE] Deleting IPStock for ID:', ipStockId);

        if (!ipStockId) {
            console.log('[IPSTOCK-ID][DELETE] No IPStock ID provided');
            return NextResponse.json({ message: 'IPStock ID is required' }, { status: 400 });
        }

        const deletedIPStock = await IPStock.findByIdAndDelete(ipStockId).lean();
        console.log('[IPSTOCK-ID][DELETE] IPStock deleted:', deletedIPStock ? {
            _id: deletedIPStock._id,
            name: deletedIPStock.name
        } : 'null');

        if (!deletedIPStock) {
            console.log('[IPSTOCK-ID][DELETE] IPStock not found for deletion');
            return NextResponse.json({ message: 'IP Stock not found' }, { status: 404 });
        }

        console.log('[IPSTOCK-ID][DELETE] IPStock successfully deleted');
        return NextResponse.json({
            message: 'IP Stock deleted successfully',
            deletedIPStock: {
                _id: deletedIPStock._id,
                name: deletedIPStock.name
            }
        });
    } catch (error) {
        console.error('[IPSTOCK-ID][DELETE] === ERROR ===');
        console.error('[IPSTOCK-ID][DELETE] Error type:', error.constructor.name);
        console.error('[IPSTOCK-ID][DELETE] Error message:', error.message);
        console.error('[IPSTOCK-ID][DELETE] Error stack:', error.stack);
        return NextResponse.json(
            { message: 'Failed to delete IP Stock', error: error.message },
            { status: 500 }
        );
    }
}
