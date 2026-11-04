const IPStock = require('@/models/ipStockModel');

function getCompanyModel() {
  const mod = require('@/models/companyModel');
  return mod.default || mod;
}

const COMPANY_SELECT =
  'virtualizors virtualizor resellerApi netbayApi kurohostApi joyApi hostdzireApi nexaApi rackatoApi name';

/**
 * Admin "Manage panel (company)" on an order (`trialManageCompanyId`).
 * Empty / default → IP stock owner company.
 */
async function getManageCompanyIdForOrder(order) {
  if (!order) return null;
  const override = String(order.trialManageCompanyId || '').trim();
  if (override) return override;
  if (order.ipStockId) {
    try {
      const ipStock = await IPStock.findById(order.ipStockId).select('company').lean();
      if (ipStock?.company) return String(ipStock.company);
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function getManageCompanyDocForOrder(order, select = COMPANY_SELECT) {
  const companyId = await getManageCompanyIdForOrder(order);
  if (!companyId) return null;
  try {
    return await getCompanyModel().findById(companyId).select(select).lean();
  } catch {
    return null;
  }
}

/** Reseller panel (Hostheaven / PrimeVPS / Hotstar) for manage, sync, renew, expiry. */
async function resolveResellerCompanyForOrder(order, companyDoc = null) {
  const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
  if (companyDoc && getCompanyResellerApiConfig(companyDoc)) return companyDoc;
  const managed = await getManageCompanyDocForOrder(order);
  if (managed && getCompanyResellerApiConfig(managed)) return managed;
  return null;
}

/** Order GET payload: automation meta from manage company (override or stock default). */
async function attachManageCompanyAutomation(order) {
  if (!order) return order;
  try {
    const { buildCompanyAutomationMetaForOrder } = require('@/lib/companyAutomationMeta');
    const company = await getManageCompanyDocForOrder(order);
    if (!company) return order;
    const meta = buildCompanyAutomationMetaForOrder(company, order);
    if (!meta?.enabled) return order;
    return { ...order, companyAutomation: meta };
  } catch {
    return order;
  }
}

module.exports = {
  getManageCompanyIdForOrder,
  getManageCompanyDocForOrder,
  resolveResellerCompanyForOrder,
  attachManageCompanyAutomation,
};
