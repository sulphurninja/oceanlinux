/**
 * OS / login defaults from product name (orders default to Ubuntu 22 in schema).
 */

function isWindowsProductName(name) {
  const t = String(name || '').toLowerCase();
  return (
    t.includes('windows') ||
    t.includes('win server') ||
    t.includes('window20') ||
    t.includes('rdp') ||
    /\bwin-?\d{2}\b/.test(t) ||
    /\bwin-\d/.test(t)
  );
}

function isLinuxProductName(name) {
  const t = String(name || '').toLowerCase();
  if (isWindowsProductName(name)) return false;
  return t.includes('ubuntu') || t.includes('centos') || t.includes('linux');
}

function defaultOsForProduct(productName) {
  return isWindowsProductName(productName) ? 'Windows 2022 64' : 'Ubuntu 22';
}

function defaultUsernameForProduct(productName) {
  return isWindowsProductName(productName) ? 'Administrator' : 'root';
}

/** Login username for a given OS — Linux family uses root, Windows uses Administrator. */
function usernameForOs(os) {
  const t = String(os || '').toLowerCase();
  if (/ubuntu|centos|debian|almalinux|rocky|linux/.test(t)) return 'root';
  if (/windows|\bwin[-_ ]?\d/.test(t)) return 'Administrator';
  return '';
}

/**
 * Prefer product name over order.os — schema defaults os to Ubuntu 22 before provision.
 */
function isWindowsOrder(order, ipStock) {
  const productName = order?.productName || '';
  if (isWindowsProductName(productName)) return true;
  if (isLinuxProductName(productName)) return false;

  const os = String(order?.os || '').toLowerCase();
  if (os.includes('windows') || /\bwin-?\d/.test(os)) return true;
  if (os.includes('ubuntu') || os.includes('centos')) return false;

  const serverType = String(ipStock?.serverType || '').toUpperCase();
  if (serverType === 'LINUX') return false;

  return false;
}

function normalizePanelOsForOrder(panelOs, productName, currentOs) {
  const panel = String(panelOs || '').trim();
  // Panel is the source of truth — after a reinstall the VM really runs what
  // the panel reports, even if the product name says otherwise (e.g. a
  // Windows product reinstalled to Ubuntu).
  if (panel) return panel;
  if (isWindowsProductName(productName)) {
    if (currentOs && !/ubuntu|centos/i.test(String(currentOs))) {
      return currentOs;
    }
    return defaultOsForProduct(productName);
  }
  return currentOs || defaultOsForProduct(productName);
}

function normalizePanelUsernameForOrder(panelUsername, productName, currentUsername, panelOs) {
  const user = String(panelUsername || '').trim();
  // Trust the panel's username (root after a Linux reinstall, Administrator
  // for Windows) instead of forcing a product-name default.
  if (user) return user;
  // Panel didn't expose a username — derive it from the panel-reported OS.
  const fromOs = usernameForOs(panelOs);
  if (fromOs) return fromOs;
  if (isWindowsProductName(productName)) {
    if (currentUsername && currentUsername.toLowerCase() !== 'root') return currentUsername;
    return 'Administrator';
  }
  return currentUsername || 'root';
}

module.exports = {
  isWindowsProductName,
  isLinuxProductName,
  defaultOsForProduct,
  defaultUsernameForProduct,
  usernameForOs,
  isWindowsOrder,
  normalizePanelOsForOrder,
  normalizePanelUsernameForOrder,
};
