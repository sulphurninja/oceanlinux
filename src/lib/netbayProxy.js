function isNetbayProxyStock(stockCfg, ipStock, order) {
  if (String(ipStock?.serverType || '').toLowerCase() === 'proxy') return true;
  const type = String(stockCfg?.productType || stockCfg?.appType || '').toLowerCase();
  if (type === 'proxy' || type === 'application' || type === 'applications') return true;
  if (order?.netbayAppType === 'proxy' || order?.netbayProxyId) return true;
  if (type === 'vm' || type === 'vps') return false;
  const name = `${ipStock?.name || ''} ${order?.productName || ''}`.toLowerCase();
  return /\bproxy\b/.test(name);
}

function isNetbayProxyOrder(order) {
  return order?.netbayAppType === 'proxy' || !!order?.netbayProxyId;
}

function resolveNetbayProxyTemplate(stockCfg) {
  return (
    String(stockCfg?.proxyTemplate || stockCfg?.defaultOs?.Proxy || stockCfg?.defaultOs?.Applications || '').trim() ||
    'PROXY'
  );
}

function generateNetbayProxyUser(order) {
  const raw = String(order?._id || Date.now())
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const tail = (raw.slice(-8) || 'ocean1').replace(/^[^a-z]+/, '') || 'ocean1';
  return `u${tail}`.slice(0, 12);
}

function generateNetbayProxyPass(length = 12) {
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const allowed = letters + numbers + '@';
  let out = letters[Math.floor(Math.random() * letters.length)];
  out += numbers[Math.floor(Math.random() * numbers.length)];
  out += '@';
  while (out.length < length) {
    out += allowed[Math.floor(Math.random() * allowed.length)];
  }
  return out
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

function proxyDisplayIp(creds) {
  if (!creds?.host) return '';
  return creds.port ? `${creds.host}:${creds.port}` : creds.host;
}

function applyNetbayProxyToOrderUpdates(proxy, order) {
  const NetbayApi = require('@/services/netbayApi');
  const { pickNetbayExpiryDate } = require('@/lib/netbayOrderSync');
  const creds = NetbayApi.extractProxyCredentials(proxy);
  const dbUpdates = { lastSyncTime: new Date(), netbayAppType: 'proxy' };
  const changes = [];
  if (creds) {
    const ip = proxyDisplayIp(creds);
    if (creds.user && creds.user !== order.username) {
      dbUpdates.username = creds.user;
      changes.push('username');
    }
    if (creds.pass && creds.pass !== order.password) {
      dbUpdates.password = creds.pass;
      changes.push('password');
    }
    if (ip && ip !== order.ipAddress) {
      dbUpdates.ipAddress = ip;
      changes.push('ipAddress');
    }
    dbUpdates.serverDetails = {
      lastUpdated: new Date(),
      rawDetails: {
        ...(order.serverDetails?.rawDetails || {}),
        netbayProxy: true,
        formattedCreds: creds.formattedCreds || '',
        httpUrl: creds.httpUrl || '',
        proxyPort: creds.port || 3128,
      },
    };
  }
  const expiry = pickNetbayExpiryDate(proxy);
  if (expiry) {
    dbUpdates.expiryDate = expiry;
    changes.push('expiryDate');
  }
  return { dbUpdates, changes, creds };
}

module.exports = {
  isNetbayProxyStock,
  isNetbayProxyOrder,
  resolveNetbayProxyTemplate,
  generateNetbayProxyUser,
  generateNetbayProxyPass,
  proxyDisplayIp,
  applyNetbayProxyToOrderUpdates,
};
