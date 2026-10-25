/**
 * Rackato reseller API config stored on a Company.
 * OceanLinux calls www.rackato.com with the partner key (40% discount is applied by Rackato).
 */

const { DEFAULT_BASE_URL } = require('@/services/rackatoApi');

function getCompanyRackatoApiConfig(company) {
  if (!company?.rackatoApi?.enabled) return null;
  const cfg = company.rackatoApi;
  const baseUrl = String(cfg.baseUrl || '').trim() || DEFAULT_BASE_URL;
  const keyId = String(cfg.keyId || '').trim();
  const keySecret = String(cfg.keySecret || '').trim();
  if (!keyId || !keySecret) return null;
  const mode = cfg.mode === 'production' ? 'production' : 'sandbox';
  return {
    enabled: true,
    label: cfg.label || 'Rackato',
    baseUrl,
    keyId,
    keySecret,
    mode,
    discountPercent: Number(cfg.discountPercent) || 40,
  };
}

function hasCompanyRackatoApi(company) {
  return !!getCompanyRackatoApiConfig(company);
}

async function resolveRackatoApiForOrder(order, { Company, IPStock } = {}) {
  if (!order) return { config: null, companyName: null, matchedBy: null };

  async function fromCompanyId(id, matchedBy) {
    if (!id || !Company) return null;
    const company = await Company.findById(id).select('rackatoApi name').lean();
    const config = getCompanyRackatoApiConfig(company);
    if (!config) return null;
    return { config, companyName: company?.name || null, matchedBy };
  }

  if (order.trialManageCompanyId) {
    const hit = await fromCompanyId(order.trialManageCompanyId, 'trialCompany');
    if (hit) return hit;
  }

  if (order.ipStockId && IPStock) {
    const stock = await IPStock.findById(order.ipStockId).select('company').lean();
    const hit = await fromCompanyId(stock?.company, 'ipStock');
    if (hit) return hit;
  }

  return { config: null, companyName: null, matchedBy: null };
}

module.exports = {
  DEFAULT_BASE_URL,
  getCompanyRackatoApiConfig,
  hasCompanyRackatoApi,
  resolveRackatoApiForOrder,
};
