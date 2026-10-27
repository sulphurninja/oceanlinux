/**
 * Nexa Dedicated IP API config stored on a company (`company.nexaApi`).
 * https://nexahostvps.com/api/v1/dedicated-ips
 */

const NEXA_API_DEFAULTS = Object.freeze({
  baseUrl: 'https://nexahostvps.com/api/v1/dedicated-ips',
});

function getCompanyNexaApiConfig(company) {
  if (!company) return null;
  const cfg = company.nexaApi;
  if (!cfg?.enabled) return null;

  const baseUrl = (cfg.baseUrl || '').trim() || NEXA_API_DEFAULTS.baseUrl;
  const apiKey = (cfg.apiKey || '').trim();
  if (!baseUrl || !apiKey) return null;

  return {
    enabled: true,
    label: cfg.label || 'Nexa',
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
  };
}

function hasCompanyNexaApi(company) {
  return !!getCompanyNexaApiConfig(company);
}

async function resolveNexaApiForOrder(order, { Company, IPStock } = {}) {
  if (!order) return { config: null, companyName: null, matchedBy: null };

  async function fromCompanyId(companyId, matchedBy) {
    if (!companyId || !Company) return null;
    const company = await Company.findById(companyId).select('nexaApi name').lean();
    const config = getCompanyNexaApiConfig(company);
    if (!config) return null;
    return { config, companyName: company?.name || null, matchedBy };
  }

  if (order.trialManageCompanyId) {
    const hit = await fromCompanyId(order.trialManageCompanyId, 'trialCompany');
    if (hit) return hit;
  }

  if (order.ipStockId && IPStock) {
    const stock = await IPStock.findById(order.ipStockId).select('company').lean();
    if (stock?.company) {
      const hit = await fromCompanyId(stock.company, 'ipStock');
      if (hit) return hit;
    }
  }

  return { config: null, companyName: null, matchedBy: null };
}

module.exports = {
  NEXA_API_DEFAULTS,
  getCompanyNexaApiConfig,
  hasCompanyNexaApi,
  resolveNexaApiForOrder,
};
