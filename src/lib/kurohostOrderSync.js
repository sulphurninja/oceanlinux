const IPStock = require('@/models/ipStockModel');
const Company = require('@/models/companyModel').default;
const KurohostApi = require('@/services/kurohostApi');
const { getCompanyKurohostApiConfig } = require('@/lib/companyKurohostApi');

async function resolveKurohostApiForOrder(order) {
  if (!order?.kurohostInstanceId) {
    return { api: null, config: null, error: 'No KuroHost instance ID on order' };
  }

  if (!order?.ipStockId) {
    return { api: null, config: null, error: 'Order has no linked IP stock for KuroHost config' };
  }

  const ipStock = await IPStock.findById(order.ipStockId).select('company').lean();
  if (!ipStock?.company) {
    return { api: null, config: null, error: 'KuroHost company not linked to this plan' };
  }

  const company = await Company.findById(ipStock.company).select('kurohostApi name').lean();
  const config = getCompanyKurohostApiConfig(company);
  if (!config) {
    return { api: null, config: null, error: 'KuroHost API is not configured for this company' };
  }

  return { api: new KurohostApi(config), config, companyName: company?.name || '' };
}

function applyKurohostInstanceToOrderUpdates(instance, order) {
  const dbUpdates = { lastSyncTime: new Date() };
  const changes = [];

  if (!instance) {
    return { dbUpdates, changes };
  }

  const freshIp = KurohostApi.extractInstanceIp(instance);
  if (freshIp && freshIp !== order?.ipAddress) {
    dbUpdates.ipAddress = freshIp;
    changes.push('ipAddress');
  }

  const { username, password } = KurohostApi.extractCredentials(instance);
  if (username && username !== order?.username) {
    dbUpdates.username = username;
    changes.push('username');
  }
  if (password && password !== order?.password) {
    dbUpdates.password = password;
    changes.push('password');
  }

  const status = String(instance.status || '').toUpperCase();
  if (status === 'RUNNING' && order?.provisioningStatus !== 'active') {
    dbUpdates.provisioningStatus = 'active';
    dbUpdates.status = order?.status === 'confirmed' ? 'active' : order?.status;
    changes.push('provisioningStatus');
  }

  const tplName = instance?.osTemplate?.name || instance?.osTemplateName || '';
  if (tplName && tplName !== order?.os) {
    const isWindows = !!instance?.osTemplate?.isWindows || /windows|win\s*server/i.test(tplName);
    dbUpdates.os = isWindows ? 'Windows 2022 64' : tplName;
    dbUpdates.username = isWindows ? 'Administrator' : 'root';
    changes.push('os');
  }

  return { dbUpdates, changes };
}

function resolveKurohostPowerState(instance) {
  const raw = instance?.status || '';
  return {
    powerState: KurohostApi.mapPowerState(raw),
    rawStatus: raw,
  };
}

async function syncKurohostOrderFromApi(order) {
  const { api, error } = await resolveKurohostApiForOrder(order);
  if (!api) {
    return { ok: false, error, dbUpdates: {}, changes: [], instance: null };
  }

  const res = await api.getInstance(order.kurohostInstanceId);
  const instance = KurohostApi.unwrapInstance(res);
  const { dbUpdates, changes } = applyKurohostInstanceToOrderUpdates(instance, order);

  return { ok: true, dbUpdates, changes, instance };
}

module.exports = {
  resolveKurohostApiForOrder,
  applyKurohostInstanceToOrderUpdates,
  resolveKurohostPowerState,
  syncKurohostOrderFromApi,
};
