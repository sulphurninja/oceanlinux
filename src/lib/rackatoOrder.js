function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function firstString(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function unwrap(payload) {
  const root = asObject(payload) || {};
  return asObject(root.data) || asObject(root.order) || root;
}

function nodeListFrom(payload) {
  const root = unwrap(payload);
  const lists = [root.nodes, root.node, root.line_items, root.items, payload?.nodes];
  for (const list of lists) {
    if (Array.isArray(list) && list.length) return list.map(asObject).filter(Boolean);
    const one = asObject(list);
    if (one) return [one];
  }
  return [];
}

function parseRackatoNode(node) {
  const row = asObject(node) || {};
  const ips = Array.isArray(row.ipv4) ? row.ipv4 : Array.isArray(row.ips) ? row.ips : [];
  return {
    uid: firstString(row.uid, row.node_uid, row.id),
    ip: firstString(row.primary_ipv4, row.ipv4, row.ip, row.ip_address, ips[0]?.address, ips[0]),
    status: firstString(row.status, row.power_status, row.state),
    username: firstString(row.username, row.ssh_user, row.user),
    password: firstString(row.password, row.ssh_root_pass, row.admin_pass),
    os: firstString(row.os, row.template, row.app_name),
    expiresAt: firstString(row.expires_at, row.expiration, row.expiry_date, row.expiry, row.expired_at),
  };
}

function parseRackatoOrder(payload) {
  const root = unwrap(payload);
  const nodes = nodeListFrom(payload).map(parseRackatoNode);
  const node = nodes.find((item) => item.uid || item.ip) || nodes[0] || parseRackatoNode(null);
  return {
    orderId: firstString(root.order_id, root.id, payload?.order_id, payload?.id),
    status: firstString(root.status, root.order_status),
    uid: node.uid,
    ip: node.ip,
    username: node.username,
    password: node.password,
    os: node.os,
    expiresAt: node.expiresAt,
    nodes,
  };
}

function parseRackatoExpiry(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

module.exports = {
  parseRackatoOrder,
  parseRackatoNode,
  parseRackatoExpiry,
};
