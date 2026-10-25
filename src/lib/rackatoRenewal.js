const RackatoApi = require('@/services/rackatoApi');
const { resolveRackatoApiForOrder } = require('@/lib/companyRackatoApi');
const { parseRackatoNode, parseRackatoExpiry } = require('@/lib/rackatoOrder');

async function executeRackatoUpstreamRenewal(order) {
  const Company = require('@/models/companyModel').default;
  const IPStock = require('@/models/ipStockModel');
  const { config } = await resolveRackatoApiForOrder(order, { Company, IPStock });
  if (!config) {
    return { success: false, error: 'Rackato API is not configured for this company' };
  }
  const uid = String(order?.rackatoNodeUid || '').trim();
  if (!uid) {
    return { success: false, error: 'Rackato node is not ready yet' };
  }

  const api = new RackatoApi(config);
  const result = await api.nodeAction(uid, 'renew');
  let newExpiryDate = null;
  try {
    const node = parseRackatoNode(await api.getNode(uid));
    newExpiryDate = parseRackatoExpiry(node.expiresAt);
  } catch {
    newExpiryDate = null;
  }
  return { success: true, result, newExpiryDate, uid };
}

module.exports = { executeRackatoUpstreamRenewal };
