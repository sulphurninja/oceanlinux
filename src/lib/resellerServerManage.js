/**
 * Universal Reseller Server Management
 *
 * Resellers always use the SAME action names regardless of backend provider.
 * When you add a new provider/company, register a handler here — reseller API
 * contract stays unchanged.
 *
 * Universal actions: start | stop | restart | status | sync | reinstall | changeos
 * Aliases accepted: format → reinstall, reboot → restart
 */

import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import Company from '@/models/companyModel';
import { resolveProviderFromOrder } from '@/lib/orderAnnouncementTarget';
import { hasCompanyAnyAutomation } from '@/lib/orderPowerState';

const SmartVpsAPI = require('@/services/smartvpsApi');
const HostycareAPI = require('@/services/hostycareApi');
const AdvpsAPI = require('@/services/advpsApi');
const NetbayApi = require('@/services/netbayApi');
const {
  normalizeAdvpsPowerState,
  pickAdvpsRunningStatusRaw,
  pickAdvpsIp,
  pickAdvpsUptime,
  unwrapAdvpsEnvelope,
} = require('@/lib/advpsStatusNormalize');
const { runAdvpsPostRebuildGeneratePasswordFlow } = require('@/lib/advpsPostRebuildFlow');
const {
  ADVPS_REBUILD_LIMIT,
  getAdvpsRebuildUsage,
  getAdvpsRebuildLimitMessage,
  consumeAdvpsRebuildCredit,
} = require('@/lib/advpsRebuildLimit');
const {
  syncAdvpsOrderCredentials,
  resolveAdvpsServiceIdForPower,
  configureAdvpsServiceIp,
} = require('@/lib/advpsOrderSync');

export const UNIVERSAL_ACTIONS = ['start', 'stop', 'restart', 'status', 'sync', 'reinstall', 'changeos'];

const POWER_ACTIONS = new Set(['start', 'stop', 'restart', 'status', 'sync']);
const OS_ACTIONS = new Set(['reinstall', 'changeos']);

/** Per-provider capability matrix — extend when adding new providers. */
const PROVIDER_CAPABILITIES = {
  advps: {
    supported: [...UNIVERSAL_ACTIONS.filter((a) => a !== 'changeos'), 'changeos'],
    reinstallRequiresOs: true,
    changeosRequiresOs: true,
    osOptions: ['ubuntu', 'centos', 'windows'],
    notes: 'reinstall and changeos both rebuild the VM with a new OS template.',
  },
  smartvps: {
    supported: UNIVERSAL_ACTIONS,
    reinstallRequiresOs: false,
    changeosRequiresOs: true,
    osOptions: ['ubuntu', 'centos', '2012', '2016', '2019', '2022', '11'],
    notes: 'reinstall uses format/reset. changeos switches OS without full format flow.',
  },
  hostycare: {
    supported: ['start', 'stop', 'restart', 'status', 'sync'],
    reinstallRequiresOs: false,
    changeosRequiresOs: false,
    osOptions: [],
    notes: 'Power actions only. Reinstall/change OS not available via API for this product type.',
  },
  netbay: {
    supported: ['start', 'stop', 'restart', 'status', 'sync', 'reinstall', 'changeos'],
    reinstallRequiresOs: false,
    changeosRequiresOs: false,
    osOptions: ['ubuntu', 'centos', 'windows'],
    notes: 'reinstall/changeos trigger Netbay rebuild. osType optional.',
  },
  company: {
    supported: ['start', 'stop', 'restart', 'status', 'sync', 'reinstall'],
    reinstallRequiresOs: true,
    changeosRequiresOs: true,
    osOptions: ['ubuntu', 'centos', 'windows'],
    notes: 'Company-linked product. Managed via company automation panel.',
  },
  oceanlinux: {
    supported: [],
    reinstallRequiresOs: false,
    changeosRequiresOs: false,
    osOptions: [],
    notes: 'Manual provisioning — no automated management.',
  },
};

export function normalizeResellerAction(action) {
  const a = String(action || '').toLowerCase();
  if (a === 'format' || a === 'rebuild') return 'reinstall';
  if (a === 'reboot') return 'restart';
  return a;
}

function mapOsTypeToAdvpsTemplate(osType) {
  if (!osType) return null;
  const lower = String(osType).toLowerCase();
  if (lower.includes('ubuntu') || lower === 'ubuntu-22.04') return 'ubuntu-22.04';
  if (lower.includes('centos') || lower === 'centos-7') return 'centos-7';
  if (lower.includes('windows') || lower === 'windows-2022') return 'windows-2022';
  return osType;
}

function getOrderIp(order) {
  return (
    order.ipAddress ||
    order.serverDetails?.rawDetails?.ips?.[0] ||
    order.serviceDetails?.ipAddress ||
    null
  );
}

function hasNativeServiceId(order, provider) {
  switch (provider) {
    case 'advps':
      return !!order.advpsServiceId;
    case 'smartvps':
      return !!(order.smartvpsServiceId || order.ipAddress);
    case 'hostycare':
      return !!order.hostycareServiceId;
    case 'netbay':
      return !!order.netbayServiceId;
    default:
      return false;
  }
}

/**
 * Resolve which backend route handles this order.
 * Company automation wins when IP stock is linked to a company panel and
 * the order has no native upstream service ID yet.
 */
export function resolveResellerManageProvider(order, ipStock = null) {
  const upstream = resolveProviderFromOrder(order, ipStock);

  if (hasCompanyAnyAutomation(ipStock) && !hasNativeServiceId(order, upstream)) {
    return 'company';
  }

  if (upstream === 'oceanlinux' && order.hostycareServiceId) return 'hostycare';
  if (upstream === 'oceanlinux' && (order.smartvpsServiceId || order.ipAddress)) return 'smartvps';
  if (upstream === 'oceanlinux' && order.advpsServiceId) return 'advps';
  if (upstream === 'oceanlinux' && order.netbayServiceId) return 'netbay';

  return upstream in PROVIDER_CAPABILITIES ? upstream : 'oceanlinux';
}

export function getResellerManagementCapabilities(order, ipStock = null) {
  const provider = resolveResellerManageProvider(order, ipStock);
  const caps = PROVIDER_CAPABILITIES[provider] || PROVIDER_CAPABILITIES.oceanlinux;
  const ip = getOrderIp(order);
  const provisioned =
    provider === 'advps' || provider === 'netbay'
      ? hasNativeServiceId(order, provider)
      : !!ip || hasNativeServiceId(order, provider);

  return {
    available: caps.supported.length > 0 && provisioned,
    supportedActions: caps.supported,
    reinstallRequiresOs: caps.reinstallRequiresOs,
    changeosRequiresOs: caps.changeosRequiresOs,
    osOptions: caps.osOptions,
    notes: caps.notes,
    provisioned,
    // Internal — optional for debugging; resellers can ignore
    _provider: provider,
  };
}

export async function loadOrderIpStock(order) {
  if (!order?.ipStockId) return null;
  const stock = await IPStock.findById(order.ipStockId).lean();
  if (!stock?.company) return stock;

  const company = await Company.findById(stock.company)
    .select('virtualizors virtualizor resellerApi netbayApi name')
    .lean();

  let companyAutomation = null;
  if (company) {
    const hasVirtualizor =
      (Array.isArray(company.virtualizors) && company.virtualizors.length > 0) ||
      !!company.virtualizor?.host;
    const hasResellerApi = company.resellerApi?.enabled;
    if (hasVirtualizor) {
      companyAutomation = { enabled: true, provider: 'virtualizor' };
    } else if (hasResellerApi) {
      companyAutomation = { enabled: true, provider: 'reseller-api' };
    }
  }

  return { ...stock, company, companyAutomation };
}

function actionNotSupported(action, capabilities) {
  return {
    success: false,
    message: `Action "${action}" is not supported for this product. Use one of: ${capabilities.supportedActions.join(', ')}`,
    code: 'ACTION_NOT_SUPPORTED',
    supportedActions: capabilities.supportedActions,
  };
}

function missingOsType(action, capabilities) {
  return {
    success: false,
    message: `osType is required for "${action}" on this product. Options: ${capabilities.osOptions.join(', ') || 'contact support'}`,
    code: 'OS_TYPE_REQUIRED',
    supportedActions: capabilities.supportedActions,
    osOptions: capabilities.osOptions,
  };
}

// ─── Provider executors ─────────────────────────────────────────────────────

async function resolveAdvpsServiceId(api, order, orderId) {
  const resolved = await resolveAdvpsServiceIdForPower(api, order, { Order });
  if (!resolved.serviceId) return { error: resolved.error || 'No ADVPS service ID attached' };
  if (resolved.corrected) {
    await Order.findByIdAndUpdate(orderId, {
      advpsServiceId: resolved.serviceId,
      ...(resolved.advpsOrderId && !order.advpsOrderId ? { advpsOrderId: resolved.advpsOrderId } : {}),
    });
    order.advpsServiceId = resolved.serviceId;
  }
  return { serviceId: resolved.serviceId };
}

async function runAdvps(order, orderId, action, osType) {
  const api = new AdvpsAPI();
  const resolved = await resolveAdvpsServiceId(api, order, orderId);
  if (resolved.error) return { success: false, message: resolved.error };

  const serviceId = resolved.serviceId;

  switch (action) {
    case 'start': {
      const startRes = await api.start(serviceId);
      const ipConfig = await configureAdvpsServiceIp(api, serviceId, { logPrefix: '[RESELLER-MANAGE]' });
      const dbUpdate = { provisioningStatus: 'active', lastAction: 'start', lastActionTime: new Date() };
      if (ipConfig.ip && ipConfig.ip !== order.ipAddress) dbUpdate.ipAddress = ipConfig.ip;
      await Order.findByIdAndUpdate(orderId, dbUpdate);
      return { success: true, message: 'Start command sent', data: { powerState: 'starting', start: startRes, ipConfig } };
    }
    case 'stop': {
      await api.stop(serviceId);
      await Order.findByIdAndUpdate(orderId, { provisioningStatus: 'suspended', lastAction: 'stop', lastActionTime: new Date() });
      return { success: true, message: 'Stop command sent', data: { powerState: 'stopped' } };
    }
    case 'restart': {
      await api.reboot(serviceId);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'reboot', lastActionTime: new Date() });
      return { success: true, message: 'Restart command sent', data: {} };
    }
    case 'status': {
      const statusRes = await api.status(serviceId);
      const d = unwrapAdvpsEnvelope(statusRes) || {};
      const powerState = normalizeAdvpsPowerState(d);
      const sync = await syncAdvpsOrderCredentials(api, order, { statusPayload: statusRes, Order });
      await Order.findByIdAndUpdate(orderId, sync.credentialsUpdated ? sync.dbUpdates : { lastSyncTime: sync.dbUpdates.lastSyncTime });
      return {
        success: true,
        message: 'Status retrieved',
        data: {
          powerState,
          ip: sync.freshIp || pickAdvpsIp(d, order.ipAddress),
          runningStatus: pickAdvpsRunningStatusRaw(d) || null,
          uptime: pickAdvpsUptime(d),
        },
      };
    }
    case 'sync': {
      const statusRes = await api.status(serviceId);
      const sync = await syncAdvpsOrderCredentials(api, order, { statusPayload: statusRes, Order, tryGeneratePasswordFallback: true });
      await Order.findByIdAndUpdate(orderId, sync.dbUpdates);
      return { success: true, message: sync.credentialsUpdated ? `Synced — ${sync.changes.join(', ')}` : 'Status synced', data: { credentialsUpdated: sync.credentialsUpdated } };
    }
    case 'reinstall':
    case 'changeos': {
      const os = mapOsTypeToAdvpsTemplate(osType);
      if (!os) return missingOsType(action, PROVIDER_CAPABILITIES.advps);
      const { count } = getAdvpsRebuildUsage(order);
      if (count >= ADVPS_REBUILD_LIMIT) {
        return { success: false, message: getAdvpsRebuildLimitMessage(), code: 'REBUILD_LIMIT_REACHED' };
      }
      const rebuildRes = await api.rebuild(serviceId, os);
      const taskId = rebuildRes?.data?.taskId;
      await Order.findByIdAndUpdate(orderId, { provisioningStatus: 'provisioning', lastAction: 'reinstall', lastActionTime: new Date() });
      if (taskId) {
        const rebuildOrderId = orderId;
        const rebuildServiceId = serviceId;
        (async () => {
          const pollDelays = [10000, 15000, 20000, 30000, 60000, 60000];
          for (const delay of pollDelays) {
            await new Promise((r) => setTimeout(r, delay));
            try {
              const taskRes = await api.taskStatus(taskId);
              const taskStatus = String((taskRes?.data || taskRes)?.status || '').toUpperCase();
              if (['COMPLETED', 'SUCCESS', 'DONE'].includes(taskStatus)) {
                await consumeAdvpsRebuildCredit(Order, rebuildOrderId);
                await runAdvpsPostRebuildGeneratePasswordFlow({ api, Order, rebuildOrderId, rebuildServiceId, logPrefix: '[RESELLER-MANAGE]' });
                return;
              }
              if (['FAILED', 'ERROR'].includes(taskStatus)) {
                await Order.findByIdAndUpdate(rebuildOrderId, { provisioningStatus: 'failed', provisioningError: 'Rebuild failed' });
                return;
              }
            } catch (_) { /* poll */ }
          }
        })();
      } else {
        await consumeAdvpsRebuildCredit(Order, orderId);
      }
      return {
        success: true,
        message: `Reinstall started (${os}). Poll GET /orders/{orderId} or action=sync for new password.`,
        data: { os, taskId: taskId || null },
      };
    }
    default:
      return actionNotSupported(action, PROVIDER_CAPABILITIES.advps);
  }
}

async function runSmartvps(order, orderId, action, osType) {
  const ip = getOrderIp(order);
  if (!ip) return { success: false, message: 'No IP address on order yet' };
  const api = new SmartVpsAPI();

  switch (action) {
    case 'start':
      await api.start(ip);
      return { success: true, message: 'Start command sent', data: { powerState: 'starting' } };
    case 'stop':
      await api.stop(ip);
      return { success: true, message: 'Stop command sent', data: { powerState: 'stopped' } };
    case 'restart':
      await api.stop(ip);
      await new Promise((r) => setTimeout(r, 2000));
      await api.start(ip);
      return { success: true, message: 'Restart command sent', data: {} };
    case 'status':
    case 'sync': {
      const res = await api.status(ip);
      let powerState = 'unknown';
      if (res) {
        const s = String(res.status || res.state || res.power || res).toLowerCase();
        if (['online', 'running', 'active', 'started', 'on', '1'].includes(s)) powerState = 'running';
        else if (['offline', 'stopped', 'inactive', 'off', '0', 'shutdown'].includes(s)) powerState = 'stopped';
        else powerState = s;
      }
      return { success: true, message: 'Status retrieved', data: { powerState, raw: res } };
    }
    case 'reinstall':
      await api.format(ip);
      return { success: true, message: 'Reinstall/format command sent. Server is resetting.', data: {} };
    case 'changeos': {
      if (!osType) return missingOsType(action, PROVIDER_CAPABILITIES.smartvps);
      await api.changeOS(ip, osType);
      return { success: true, message: `OS change to ${osType} initiated`, data: { osType } };
    }
    default:
      return actionNotSupported(action, PROVIDER_CAPABILITIES.smartvps);
  }
}

async function runHostycare(order, orderId, action) {
  if (!order.hostycareServiceId) {
    return { success: false, message: 'No service ID for this order' };
  }
  const api = new HostycareAPI();
  const sid = order.hostycareServiceId;

  switch (action) {
    case 'start':
      await api.startService(sid);
      return { success: true, message: 'Start command sent', data: { powerState: 'starting' } };
    case 'stop':
      await api.stopService(sid);
      return { success: true, message: 'Stop command sent', data: { powerState: 'stopped' } };
    case 'restart':
      await api.rebootService(sid);
      return { success: true, message: 'Restart command sent', data: {} };
    case 'status':
    case 'sync': {
      const info = await api.getServiceInfo(sid);
      let powerState = 'unknown';
      if (info) {
        const s = String(info.status || info.state || info.power_status || info.vps_status || '').toLowerCase();
        if (['online', 'running', 'active', 'started', 'on', '1', 'true'].includes(s)) powerState = 'running';
        else if (['offline', 'stopped', 'inactive', 'off', '0', 'false', 'shutdown'].includes(s)) powerState = 'stopped';
      }
      return { success: true, message: 'Status retrieved', data: { powerState, serviceInfo: info } };
    }
    default:
      return actionNotSupported(action, PROVIDER_CAPABILITIES.hostycare);
  }
}

async function runNetbay(order, orderId, action, osType, ipStock) {
  if (!order.netbayServiceId) return { success: false, message: 'No Netbay service ID on order' };
  const cfg = ipStock?.company?.netbayApi;
  if (!cfg?.baseUrl || !cfg?.apiKey) {
    return { success: false, message: 'Netbay API not configured for this product company' };
  }

  const api = new NetbayApi(cfg);
  const sid = order.netbayServiceId;

  switch (action) {
    case 'start':
      await api.start(sid);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'start', lastActionTime: new Date() });
      return { success: true, message: 'Start command sent', data: { powerState: 'starting' } };
    case 'stop':
      await api.stop(sid);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'stop', lastActionTime: new Date() });
      return { success: true, message: 'Stop command sent', data: { powerState: 'stopped' } };
    case 'restart':
      await api.reboot(sid);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'restart', lastActionTime: new Date() });
      return { success: true, message: 'Restart command sent', data: {} };
    case 'status':
    case 'sync': {
      let powerState = 'unknown';
      let svc = null;
      try {
        const detailRes = await api.getService(sid);
        svc = detailRes?.data || detailRes || {};
        const raw = String(svc?.status || svc?.state || svc?.powerState || '').toLowerCase();
        if (['running', 'on', 'active', 'started', 'online'].includes(raw)) powerState = 'running';
        else if (['stopped', 'off', 'shutdown', 'offline'].includes(raw)) powerState = 'stopped';
      } catch (_) { /* best effort */ }
      await Order.findByIdAndUpdate(orderId, { lastSyncTime: new Date() });
      return { success: true, message: 'Status retrieved', data: { powerState, service: svc } };
    }
    case 'reinstall':
    case 'changeos': {
      const osPayload = osType ? String(osType) : null;
      const apiRes = await api.rebuild(sid, osPayload ? { os: osPayload } : {});
      await Order.findByIdAndUpdate(orderId, { lastAction: 'reinstall', lastActionTime: new Date() });
      return {
        success: true,
        message: 'Reinstall submitted',
        data: { taskId: apiRes?.data?.taskId || null, os: osPayload },
      };
    }
    default:
      return actionNotSupported(action, PROVIDER_CAPABILITIES.netbay);
  }
}

async function runCompanyAutomation(order, orderId, action) {
  // Placeholder — wire to service-action internals when company panel is added.
  // Capabilities are exposed so resellers see what's coming; execution routes here.
  return {
    success: false,
    code: 'COMPANY_AUTOMATION_INTERNAL',
    message: `This product uses company-level automation. Action "${action}" is registered but routed internally — contact OceanLinux admin if this persists.`,
    supportedActions: PROVIDER_CAPABILITIES.company.supported,
  };
}

const PROVIDER_RUNNERS = {
  advps: (order, orderId, action, osType) => runAdvps(order, orderId, action, osType),
  smartvps: (order, orderId, action, osType) => runSmartvps(order, orderId, action, osType),
  hostycare: (order, orderId, action) => runHostycare(order, orderId, action),
  netbay: (order, orderId, action, osType, ipStock) => runNetbay(order, orderId, action, osType, ipStock),
  company: (order, orderId, action) => runCompanyAutomation(order, orderId, action),
  oceanlinux: () => ({
    success: false,
    message: 'This order is manually provisioned — no automated management available.',
    code: 'MANUAL_ORDER',
    supportedActions: [],
  }),
};

/**
 * Execute a universal manage action for a reseller order.
 */
export async function executeResellerServerAction({ order, orderId, action, osType, ipStock = null }) {
  const normalized = normalizeResellerAction(action);

  if (!UNIVERSAL_ACTIONS.includes(normalized)) {
    return {
      success: false,
      message: `Invalid action. Use: ${UNIVERSAL_ACTIONS.join(', ')} (aliases: format, reboot)`,
      code: 'INVALID_ACTION',
    };
  }

  const capabilities = getResellerManagementCapabilities(order, ipStock);

  if (!capabilities.available && !capabilities.provisioned) {
    return {
      success: false,
      message: 'Server is not provisioned yet. Wait and retry GET /orders/{orderId}.',
      code: 'NOT_PROVISIONED',
      supportedActions: capabilities.supportedActions,
    };
  }

  if (!capabilities.supportedActions.includes(normalized)) {
    return actionNotSupported(normalized, capabilities);
  }

  if (OS_ACTIONS.has(normalized)) {
    const needsOs =
      (normalized === 'reinstall' && capabilities.reinstallRequiresOs) ||
      (normalized === 'changeos' && capabilities.changeosRequiresOs);
    if (needsOs && !osType) return missingOsType(normalized, capabilities);
  }

  const provider = resolveResellerManageProvider(order, ipStock);
  const runner = PROVIDER_RUNNERS[provider] || PROVIDER_RUNNERS.oceanlinux;
  const result = await runner(order, orderId, normalized, osType, ipStock);

  return {
    ...result,
    action: normalized,
    supportedActions: capabilities.supportedActions,
  };
}
