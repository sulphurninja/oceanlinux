const { getCompanyVirtualizorAccounts } = require('@/lib/companyVirtualizor');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const { getCompanyNetbayApiConfig } = require('@/lib/companyNetbayApi');
const { getCompanyKurohostApiConfig } = require('@/lib/companyKurohostApi');
const { getCompanyJoyApiConfig } = require('@/lib/companyJoyApi');
const { getCompanyHostdzireApiConfig } = require('@/lib/companyHostdzireApi');
const { getCompanyRackatoApiConfig } = require('@/lib/companyRackatoApi');
const { getCompanyNexaApiConfig } = require('@/lib/companyNexaApi');

function providerUsableForOrder(provider, order) {
  if (!order) return true;
  if (provider === 'netbay') return !!order.netbayServiceId;
  if (provider === 'kurohost') return !!order.kurohostInstanceId;
  return true;
}

function collectCompanyAutomationCandidates(company) {
  if (!company) return [];

  const out = [];

  const accounts = getCompanyVirtualizorAccounts(company);
  if (accounts.length > 0) {
    out.push({
      provider: 'virtualizor',
      enabled: true,
      panelCount: accounts.length,
      companyName: company.name,
    });
  }

  const reseller = getCompanyResellerApiConfig(company);
  if (reseller) {
    out.push({
      provider: 'reseller-api',
      enabled: true,
      companyName: company.name,
      label: reseller.label || null,
    });
  }

  const netbay = getCompanyNetbayApiConfig(company);
  if (netbay) {
    out.push({
      provider: 'netbay',
      enabled: true,
      companyName: company.name,
      label: netbay.label || null,
    });
  }

  const kurohost = getCompanyKurohostApiConfig(company);
  if (kurohost) {
    out.push({
      provider: 'kurohost',
      enabled: true,
      companyName: company.name,
      label: kurohost.label || null,
    });
  }

  const joy = getCompanyJoyApiConfig(company);
  if (joy) {
    out.push({
      provider: 'joy',
      enabled: true,
      companyName: company.name,
      label: joy.label || null,
    });
  }

  const rackato = getCompanyRackatoApiConfig(company);
  if (rackato) {
    out.push({
      provider: 'rackato',
      enabled: true,
      companyName: company.name,
      label: rackato.label || null,
    });
  }

  const hostdzire = getCompanyHostdzireApiConfig(company);
  if (hostdzire) {
    out.push({
      provider: 'hostdzire',
      enabled: true,
      companyName: company.name,
      label: hostdzire.label || null,
    });
  }

  const nexa = getCompanyNexaApiConfig(company);
  if (nexa) {
    out.push({
      provider: 'nexa',
      enabled: true,
      companyName: company.name,
      label: nexa.label || null,
    });
  }

  return out;
}

/** UI metadata — first configured provider on the company (ignores order service ids). */
function buildCompanyAutomationMeta(company) {
  const candidates = collectCompanyAutomationCandidates(company);
  return candidates[0] || null;
}

/**
 * Same priority as buildCompanyAutomationMeta, but skips Netbay/KuroHost when the
 * order has no service/instance id (trial bulk VPS, oceanlinux IP-manage orders).
 */
function buildCompanyAutomationMetaForOrder(company, order) {
  for (const meta of collectCompanyAutomationCandidates(company)) {
    if (providerUsableForOrder(meta.provider, order)) return meta;
  }
  return null;
}

function companyHasPanelManageApi(company) {
  return !!buildCompanyAutomationMeta(company);
}

/** Provider used to route service-action for this order. */
async function getPrimaryCompanyAutomationProviderForOrder(order) {
  if (!order) return null;
  try {
    const { getManageCompanyDocForOrder } = require('@/lib/orderManageCompany');
    const company = await getManageCompanyDocForOrder(order);
    const meta = buildCompanyAutomationMetaForOrder(company, order);
    return meta?.provider ?? null;
  } catch {
    return null;
  }
}

module.exports = {
  buildCompanyAutomationMeta,
  buildCompanyAutomationMetaForOrder,
  companyHasPanelManageApi,
  getPrimaryCompanyAutomationProviderForOrder,
};
