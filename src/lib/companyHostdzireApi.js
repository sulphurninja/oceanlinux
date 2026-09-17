/**
 * HostDzire WHMCS VPS API config (https://hostdzire.com/api/vps/).
 * IP-based manage actions + optional place_order auto-provision via inventory_key.
 */

const HOSTDZIRE_API_DEFAULTS = Object.freeze({
  baseUrl: 'https://hostdzire.com/api/vps/',
});

function getCompanyHostdzireApiConfig(company) {
  if (!company) return null;
  const cfg = company.hostdzireApi;
  if (!cfg?.enabled) return null;

  let baseUrl = (cfg.baseUrl || '').trim() || HOSTDZIRE_API_DEFAULTS.baseUrl;
  if (!baseUrl.endsWith('/')) baseUrl += '/';
  const apiKey = (cfg.apiKey || '').trim();
  const email = (cfg.email || '').trim();
  const couponCode = String(cfg.couponCode || '').trim();

  if (!baseUrl || !apiKey) return null;

  return {
    enabled: true,
    label: cfg.label || 'HostDzire',
    baseUrl,
    apiKey,
    email,
    couponCode,
    useLiveStockApi: cfg.useLiveStockApi === true,
  };
}

function hasCompanyHostdzireApi(company) {
  return !!getCompanyHostdzireApiConfig(company);
}

function companyUsesHostdzireLiveStock(company) {
  const cfg = getCompanyHostdzireApiConfig(company);
  return cfg?.useLiveStockApi === true;
}

function getOrderIp(order) {
  return (
    order?.ipAddress ||
    order?.serverDetails?.rawDetails?.ips?.[0] ||
    order?.serviceDetails?.ipAddress ||
    ''
  ).trim();
}

/**
 * Resolve HostDzire config for an order.
 * 1) ipStock → company (preferred)
 * 2) order IP returns details on a HostDzire-enabled account
 */
async function resolveHostdzireApiForOrder(order, { Company, IPStock } = {}) {
  if (!order) return { config: null, companyName: null, matchedBy: null };

  if (order.trialManageCompanyId && Company) {
    try {
      const company = await Company.findById(order.trialManageCompanyId).select('hostdzireApi name').lean();
      const config = getCompanyHostdzireApiConfig(company);
      if (config) {
        return { config, companyName: company?.name || null, matchedBy: 'trialCompany' };
      }
    } catch (err) {
      console.warn('[companyHostdzireApi] trial company lookup failed:', err.message);
    }
  }

  if (order.ipStockId && IPStock && Company) {
    try {
      const ipStock = await IPStock.findById(order.ipStockId).select('company').lean();
      if (ipStock?.company) {
        const company = await Company.findById(ipStock.company).select('hostdzireApi name').lean();
        const config = getCompanyHostdzireApiConfig(company);
        if (config) {
          return { config, companyName: company?.name || null, matchedBy: 'ipStock' };
        }
      }
    } catch (err) {
      console.warn('[companyHostdzireApi] ipStock lookup failed:', err.message);
    }
  }

  const ip = getOrderIp(order);
  if (!ip || !Company) return { config: null, companyName: null, matchedBy: null };

  try {
    const companies = await Company.find({ 'hostdzireApi.enabled': true }).select('hostdzireApi name').lean();
    const HostdzireApi = require('@/services/hostdzireApi');
    for (const company of companies) {
      const config = getCompanyHostdzireApiConfig(company);
      if (!config) continue;
      try {
        const api = new HostdzireApi(config);
        const details = await api.getDetails(ip);
        if (details?.status === 'success' || details?.data) {
          return { config, companyName: company.name || null, matchedBy: 'ip' };
        }
      } catch (err) {
        if (!String(err.message || '').includes('No matching server')) {
          console.warn(`[companyHostdzireApi] details probe failed for ${company.name}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.warn('[companyHostdzireApi] company scan failed:', err.message);
  }

  return { config: null, companyName: null, matchedBy: null };
}

module.exports = {
  HOSTDZIRE_API_DEFAULTS,
  getCompanyHostdzireApiConfig,
  hasCompanyHostdzireApi,
  companyUsesHostdzireLiveStock,
  resolveHostdzireApiForOrder,
  getOrderIp,
};
