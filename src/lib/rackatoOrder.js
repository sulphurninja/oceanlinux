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
  const data = asObject(root.data) || root;
  return asObject(data.order) || data;
}

function pushNodeRows(rows, list) {
  const items = Array.isArray(list) ? list : [];
  const single = !items.length ? asObject(list) : null;
  for (const item of single ? [single] : items) {
    const row = asObject(item);
    if (!row) continue;
    rows.push(row);
    const nested = asObject(row.node);
    if (!nested) continue;
    rows.push({
      ...row,
      ...nested,
      uid: nested.uid || row.node_uid || row.uid,
      ipv4: nested.ipv4 || row.node_ipv4 || row.ipv4,
      status: nested.status || row.node_status || row.status,
      expiration: nested.expiration || row.expiration,
    });
  }
}

function nodeListFrom(payload) {
  const root = asObject(payload) || {};
  const data = asObject(root.data) || root;
  const order = asObject(data.order) || {};
  const rows = [];
  for (const list of [
    data.nodes,
    order.nodes,
    data.node,
    order.node,
    data.items,
    order.items,
    data.line_items,
    order.line_items,
    root.nodes,
  ]) {
    pushNodeRows(rows, list);
  }
  return rows;
}

function parseRackatoNode(node) {
  const root = asObject(node) || {};
  const data = asObject(root.data) || root;
  const row = asObject(data.node) || data;
  const ips = Array.isArray(row.ipv4) ? row.ipv4 : Array.isArray(row.ips) ? row.ips : [];
  const secondary = Array.isArray(row.secondary_ipv4) ? row.secondary_ipv4 : [];
  return {
    uid: firstString(row.uid, row.node_uid, row.id),
    ip: firstString(
      row.primary_ipv4,
      row.node_ipv4,
      typeof row.ipv4 === 'string' ? row.ipv4 : '',
      row.ip,
      row.ip_address,
      ips[0]?.address,
      ips[0],
      secondary[0]
    ),
    status: firstString(row.status, row.node_status, row.power_status, row.state),
    username: firstString(row.username, row.ssh_user, row.user, row.proxy_user),
    password: firstString(row.password, row.pass, row.ssh_root_pass, row.admin_pass, row.proxy_pass),
    os: firstString(row.os, row.os_name, row.template, row.app_name),
    expiresAt: firstString(row.expires_at, row.expiration, row.expiry_date, row.expiry, row.expired_at),
  };
}

function parseRackatoOrder(payload) {
  const root = unwrap(payload);
  const nodes = nodeListFrom(payload).map(parseRackatoNode);
  const node = nodes.find((item) => item.ip) || nodes.find((item) => item.uid) || nodes[0] || parseRackatoNode(null);
  const withLogin = nodes.find((item) => item.username || item.password) || node;
  return {
    orderId: firstString(root.order_id, root.id, payload?.order_id, payload?.id, payload?.data?.order?.order_id),
    status: firstString(root.status, root.order_status, node.status),
    uid: node.uid || withLogin.uid,
    ip: node.ip,
    username: node.username || withLogin.username,
    password: node.password || withLogin.password,
    os: node.os || withLogin.os,
    expiresAt: node.expiresAt || withLogin.expiresAt,
    nodes,
  };
}

function mergeRackatoDelivery(primary, extra) {
  const left = primary || parseRackatoOrder(null);
  const right = extra || parseRackatoOrder(null);
  return {
    orderId: left.orderId || right.orderId,
    status: left.status || right.status,
    uid: left.uid || right.uid,
    ip: left.ip || right.ip,
    username: left.username || right.username,
    password: left.password || right.password,
    os: left.os || right.os,
    expiresAt: left.expiresAt || right.expiresAt,
    nodes: [...(left.nodes || []), ...(right.nodes || [])],
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
