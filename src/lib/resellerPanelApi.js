/**
 * XiteNodes-style /api/v1/reseller panel API helpers.
 * Maps existing orders/products to vms/plans naming for reseller integrations.
 */

export const RESELLER_PANEL_ENDPOINTS = [
  { method: 'GET', path: '/', description: 'API index — lists every endpoint' },
  { method: 'GET', path: '/wallet', description: 'Wallet balance, minimum balance, credit limit, overview' },
  { method: 'GET', path: '/transactions', description: 'Wallet ledger (recharges, deductions, refunds)' },
  { method: 'GET', path: '/plans', description: 'Active reseller plans (catalogue with your prices)' },
  { method: 'GET', path: '/vms', description: 'List your VMs / services' },
  { method: 'POST', path: '/vms', description: 'Deploy a VM — wallet charged, auto-provisioned' },
  { method: 'PATCH', path: '/vms/{id}', description: 'Update VM settings (e.g. autoRenew toggle)' },
  { method: 'POST', path: '/vms/{id}/renew', description: 'Renew VM for a term from reseller wallet' },
  { method: 'GET', path: '/vms/{id}/plan', description: 'Same-series upgrade/downgrade options + prorated cost quote' },
  { method: 'POST', path: '/vms/{id}/plan', description: 'Upgrade or downgrade VM plan (same series)' },
  { method: 'POST', path: '/vms/{id}/assign', description: 'Assign or unassign VM to a white-label customer' },
  { method: 'GET', path: '/customers', description: 'List white-label customers' },
  { method: 'POST', path: '/customers', description: 'Create white-label customer (invite email if no password)' },
  { method: 'GET', path: '/customers/{id}', description: 'Get one customer' },
  { method: 'PATCH', path: '/customers/{id}', description: 'Update customer display name' },
  { method: 'DELETE', path: '/customers/{id}', description: 'Remove customer (VMs unassigned, not deleted)' },
  { method: 'GET', path: '/import', description: 'List importable non-reseller VMs with mapping + cost' },
  { method: 'POST', path: '/import', description: 'Import VM into reseller program' },
  { method: 'GET', path: '/addons', description: 'IP-rotation quota + buyable packs' },
  { method: 'POST', path: '/addons', description: 'Buy a rotation pack from reseller wallet' },
];

export function orderToVm(order) {
  if (!order) return null;
  const o = order.toObject ? order.toObject() : order;
  const meta = o.apiMetadata || {};
  return {
    id: String(o._id),
    planId: o.ipStockId ? String(o.ipStockId) : o.slotIpPackageId ? String(o.slotIpPackageId) : null,
    name: o.productName,
    memory: o.memory,
    price: o.price,
    status: o.status,
    provisioningStatus: o.provisioningStatus || 'pending',
    ipAddress: o.ipAddress || null,
    username: o.username || null,
    password: o.password || null,
    os: o.os || null,
    expiryDate: o.expiryDate || null,
    autoRenew: meta.autoRenew === true,
    customerId: meta.panelCustomerId ? String(meta.panelCustomerId) : null,
    customerEmail: meta.endUserEmail || o.customerEmail || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export function productToPlan(product) {
  if (!product) return null;
  return {
    id: product._id,
    name: product.name,
    description: product.description,
    serverType: product.serverType,
    productType: product.productType || 'vps',
    available: product.inStock !== false && product.available !== false,
    memoryOptions: product.memoryOptions,
    tags: product.tags,
  };
}

export function normalizeVmCreateBody(body = {}) {
  return {
    ...body,
    productId: body.productId || body.planId || body.plan_id || body.serverId,
    memoryOption: body.memoryOption || body.memory || body.ram || body.groupTag,
    userEmail: body.userEmail || body.customerEmail || body.customer?.email,
    os: body.os || body.specifications?.os,
  };
}

export function sanitizePanelCustomer(c, resellerId) {
  if (!c) return null;
  const row = c.toObject ? c.toObject() : c;
  return {
    id: String(row._id),
    resellerId: String(resellerId),
    displayName: row.displayName || row.email,
    email: row.email,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
