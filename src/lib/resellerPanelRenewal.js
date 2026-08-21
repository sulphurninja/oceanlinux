const IPStock = require('@/models/ipStockModel');
const Company = require('@/models/companyModel').default;
const ResellerApi = require('@/services/resellerApi');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const { renewResellerPanelVm } = require('@/lib/resellerApiOrderSync');
const { calculateCompanyRenewalExpiryDate } = require('@/lib/expiryHelper');

async function resolveResellerApiForOrder(order) {
  if (!order?.ipStockId) {
    return { api: null, ipStock: null, error: 'Order has no linked IP stock' };
  }

  const ipStock = await IPStock.findById(order.ipStockId).lean();
  if (!ipStock?.company) {
    return { api: null, ipStock, error: 'IP stock is not linked to a company' };
  }

  const company = await Company.findById(ipStock.company).select('resellerApi name').lean();
  const cfg = getCompanyResellerApiConfig(company);
  if (!cfg) {
    return {
      api: null,
      ipStock,
      error: `Company "${company?.name || 'unknown'}" has no enabled reseller panel API`,
    };
  }

  try {
    const api = new ResellerApi(cfg);
    return { api, ipStock, company, error: null };
  } catch (err) {
    return { api: null, ipStock, error: err.message };
  }
}

/**
 * Renew on PrimeVPS / Hostheaven panel via wallet (UserSide.pdf upgrade-renew).
 */
async function executeResellerPanelUpstreamRenewal(order, { months = 1, Order, companyId } = {}) {
  let { api, ipStock, error } = await resolveResellerApiForOrder(order);

  if (!api && companyId) {
    const company = await Company.findById(companyId).select('resellerApi name').lean();
    const cfg = getCompanyResellerApiConfig(company);
    if (cfg) {
      if (!ipStock && order?.ipStockId) {
        ipStock = await IPStock.findById(order.ipStockId).lean();
      }
      try {
        api = new ResellerApi(cfg);
        error = null;
      } catch (err) {
        error = err.message;
      }
    }
  }

  if (!api) {
    return {
      success: false,
      error,
      result: null,
      vmId: order?.resellerVmId || null,
    };
  }

  try {
    const renewed = await renewResellerPanelVm({ api, order, ipStock, Order });
    if (!renewed.success) {
      return {
        success: false,
        error: renewed.error,
        result: renewed.upstream || null,
        vmId: renewed.vmId || order.resellerVmId || null,
      };
    }

    const newExpiryDate =
      renewed.newExpiryDate ||
      calculateCompanyRenewalExpiryDate(order.expiryDate);

    return {
      success: true,
      result: renewed.upstream,
      vmId: renewed.vmId,
      newExpiryDate,
      couponUsed: renewed.couponUsed ?? null,
      panelPayableAmount: renewed.panelPayableAmount ?? null,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      result: err.body || null,
      status: err.status,
      vmId: order?.resellerVmId || null,
    };
  }
}

module.exports = {
  resolveResellerApiForOrder,
  executeResellerPanelUpstreamRenewal,
};
