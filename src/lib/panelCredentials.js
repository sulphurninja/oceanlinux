import crypto from 'crypto';

function randomAlphanumeric(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export function generatePanelCredentials() {
  return {
    panelUsername: `OL-${randomAlphanumeric(6)}`,
    panelPassword: randomAlphanumeric(12),
  };
}

export async function assignPanelCredentials(order) {
  if (order.panelUsername) return;
  const { panelUsername, panelPassword } = generatePanelCredentials();
  order.panelUsername = panelUsername;
  order.panelPassword = panelPassword;
}
