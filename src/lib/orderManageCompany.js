const IPStock = require('@/models/ipStockModel');

function getCompanyModel() {
  const mod = require('@/models/companyModel');
  return mod.default || mod;
}

const COMPANY_SELECT =
  'virtualizors virtualizor resellerApi netbayApi kurohostApi joyApi hostdzireApi nexaApi name';

async function getManageCompanyIdForOrder(order) {
  if (!order) return null;
  if (order.trialManageCompanyId) return String(order.trialManageCompanyId);
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

async function getManageCompanyDocForOrder(order) {
  const companyId = await getManageCompanyIdForOrder(order);
  if (!companyId) return null;
  try {
    return await getCompanyModel().findById(companyId).select(COMPANY_SELECT).lean();
  } catch {
    return null;
  }
}

module.exports = {
  getManageCompanyIdForOrder,
  getManageCompanyDocForOrder,
};
