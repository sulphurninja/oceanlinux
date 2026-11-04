/**
 * Universal Reseller Server Management
 *
 * Resellers always use the SAME action names regardless of backend provider.
 * When you add a new provider/company, register a handler here — reseller API
 * contract stays unchanged.
 *
 * Universal actions: start | stop | restart | status | sync | reinstall | changeos | resetmac
 * Aliases accepted: format → reinstall, reboot → restart, reset-mac → resetmac
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
const KurohostApi = require('@/services/kurohostApi');
const JoyApi = require('@/services/joyApi');
const ResellerApi = require('@/services/resellerApi');
const { getCompanyJoyApiConfig } = require('@/lib/companyJoyApi');
const { getCompanyKurohostApiConfig } = require('@/lib/companyKurohostApi');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const { syncResellerVmCredentials, resolveResellerVmForOrder } = require('@/lib/resellerApiOrderSync');
const { applyJoyMachineToOrderUpdates } = require('@/lib/joyOrderSync');
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
  consumeAdvpsRebuildCreditForTask,
  settlePendingAdvpsRebuild,
} = require('@/lib/advpsRebuildLimit');
const {
  syncAdvpsOrderCredentials,
  resolveAdvpsServiceIdForPower,
  configureAdvpsServiceIp,
  commitAdvpsOrderSync,
} = require('@/lib/advpsOrderSync');
const { commitPanelSyncToOrder } = require('@/lib/orderIpOwnership');
const { toUserFacingNetbayError } = require('@/lib/netbayApiErrors');
const VirtualizorAPI = require('@/services/virtualizorApi');
const { getCompanyVirtualizorAccounts, toVirtualizorApiAccounts } = require('@/lib/companyVirtualizor');
const { generateSecurePassword } = require('@/lib/securePassword');
const {
  SMARTVPS_OS_LABELS,
  fetchSmartVpsOsTemplates,
} = require('@/lib/smartvpsOsTemplates');
const { executeSmartVpsOsInstall } = require('@/lib/smartvpsOsInstall');
const { assertSmartVpsActionOk } = require('@/lib/smartvpsPowerActions');
const { resolveSmartVpsOrderIp } = require('@/lib/smartvpsOrderSync');

export const UNIVERSAL_ACTIONS = ['start', 'stop', 'restart', 'status', 'sync', 'templates', 'reinstall', 'changeos', 'resetmac'];

const POWER_ACTIONS = new Set(['start', 'stop', 'restart', 'status', 'sync']);
const OS_ACTIONS = new Set(['reinstall', 'changeos']);

/**
 * Providers whose rebuild endpoint takes an opaque upstream identifier rather
 * than a human OS name. For these, `osType` is resolved against the live
 * template list so resellers can send either the id or the name.
 */
const ID_BASED_OS_PROVIDERS = new Set(['kurohost', 'reseller-api', 'virtualizor']);

const SMARTVPS_OS_TEMPLATES = SMARTVPS_OS_LABELS;

const ADVPS_OS_TEMPLATES = {
  'ubuntu-22.04': 'Ubuntu 22.04',
  'centos-7': 'CentOS 7',
  'windows-2022': 'Windows Server 2022',
};

/** `{ id: name }` map → the `[{ id, name }]` array shape the API documents. */
function toTemplateList(map) {
  return Object.entries(map || {})
    .filter(([id]) => String(id).trim())
    .map(([id, name]) => ({ id: String(id), name: String(name || id) }));
}

/**
 * Accept either the template id or its display name, so a reseller can send
 * "Windows Server 2025" instead of hunting for the upstream numeric id.
 * Returns null when nothing matches, which callers turn into a clear error.
 */
function resolveTemplateId(templates, osType) {
  const wanted = String(osType || '').trim();
  if (!wanted) return null;
  const lower = wanted.toLowerCase();

  const byId = templates.find((t) => String(t.id).toLowerCase() === lower);
  if (byId) return byId.id;

  const byName = templates.find((t) => String(t.name).toLowerCase() === lower);
  if (byName) return byName.id;

  const partial = templates.filter((t) => String(t.name).toLowerCase().includes(lower));
  return partial.length === 1 ? partial[0].id : null;
}

function unknownTemplate(osType, templates) {
  return {
    success: false,
    code: 'OS_TEMPLATE_NOT_FOUND',
    message: `"${osType}" is not a valid OS for this server. Use an id or name from action "templates".`,
    osTemplates: templates,
  };
}

/** Per-provider capability matrix — extend when adding new providers. */
const PROVIDER_CAPABILITIES = {
  advps: {
    supported: [...UNIVERSAL_ACTIONS.filter((a) => a !== 'changeos'), 'changeos'],
    reinstallRequiresOs: true,
    changeosRequiresOs: true,
    osOptions: ['ubuntu', 'centos', 'windows'],
    notes: 'reinstall and changeos both rebuild the VM with a new OS template. Send osType from the templates action. resetmac is limited to once per 24h without a MAC reset subscription (VPS only).',
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
    supported: ['start', 'stop', 'restart', 'status', 'sync', 'templates', 'reinstall', 'changeos'],
    reinstallRequiresOs: false,
    changeosRequiresOs: false,
    osOptions: ['ubuntu', 'centos', 'windows'],
    notes: 'reinstall/changeos trigger Netbay rebuild. osType optional — omit it to keep the current OS.',
  },
  kurohost: {
    supported: ['start', 'stop', 'restart', 'status', 'sync', 'templates', 'reinstall'],
    reinstallRequiresOs: true,
    changeosRequiresOs: false,
    osOptions: [],
    notes: 'KuroHost Cloud — osType must be a template id or name from the templates action.',
  },
  company: {
    supported: ['start', 'stop', 'restart', 'status', 'sync', 'reinstall'],
    reinstallRequiresOs: true,
    changeosRequiresOs: true,
    osOptions: ['ubuntu', 'centos', 'windows'],
    notes: 'Company-linked product. Managed via company automation panel.',
  },
  virtualizor: {
    supported: ['start', 'stop', 'restart', 'status', 'sync', 'templates', 'reinstall'],
    reinstallRequiresOs: true,
    changeosRequiresOs: false,
    osOptions: [],
    notes: 'Company Virtualizor panel — osType must be a template id or name from the templates action.',
  },
  joy: {
    supported: ['start', 'stop', 'restart', 'status', 'sync'],
    reinstallRequiresOs: false,
    changeosRequiresOs: false,
    osOptions: [],
    notes: 'Joy Services — power actions + status only. OS reinstall/change is not exposed by the Joy connect API.',
  },
  'reseller-api': {
    supported: ['start', 'stop', 'restart', 'status', 'sync', 'templates', 'reinstall', 'resetmac', 'reconfigure-network'],
    reinstallRequiresOs: true,
    changeosRequiresOs: false,
    osOptions: ['ubuntu', 'centos', 'windows'],
    notes: 'PrimeVPS / Hostheaven panel — osType must be an ISO id or name from the templates action. resetmac stops the VM, assigns a new MAC, then restarts it. reconfigure-network repairs primary NIC settings on the panel.',
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
  if (a === 'reset-mac') return 'resetmac';
  if (a === 'reconfigurenetwork' || a === 'repair-network' || a === 'repairnetwork') return 'reconfigure-network';
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
    case 'kurohost':
      return !!order.kurohostInstanceId;
    case 'reseller-api':
      return !!order.resellerVmId;
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
    if (ipStock?.companyAutomation?.provider === 'joy') return 'joy';
    if (ipStock?.companyAutomation?.provider === 'reseller-api') return 'reseller-api';
    if (ipStock?.companyAutomation?.provider === 'virtualizor') return 'virtualizor';
    return 'company';
  }

  if (upstream === 'oceanlinux' && order.hostycareServiceId) return 'hostycare';
  if (upstream === 'oceanlinux' && (order.smartvpsServiceId || order.ipAddress)) return 'smartvps';
  if (upstream === 'oceanlinux' && order.advpsServiceId) return 'advps';
  if (upstream === 'oceanlinux' && order.netbayServiceId) return 'netbay';
  if (upstream === 'oceanlinux' && order.kurohostInstanceId) return 'kurohost';

  return upstream in PROVIDER_CAPABILITIES ? upstream : 'oceanlinux';
}

export function getResellerManagementCapabilities(order, ipStock = null) {
  const provider = resolveResellerManageProvider(order, ipStock);
  const caps = PROVIDER_CAPABILITIES[provider] || PROVIDER_CAPABILITIES.oceanlinux;
  const ip = getOrderIp(order);
  const provisioned =
    provider === 'advps' || provider === 'netbay' || provider === 'kurohost'
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
  const { getManageCompanyDocForOrder } = require('@/lib/orderManageCompany');
  const { buildCompanyAutomationMetaForOrder } = require('@/lib/companyAutomationMeta');
  const company = await getManageCompanyDocForOrder(order);
  const companyAutomation = company
    ? buildCompanyAutomationMetaForOrder(company, order)
    : null;
  return { ...stock, company, companyAutomation };
}

/**
 * Callers pass either the resolved capabilities object (`supportedActions`) or
 * a raw PROVIDER_CAPABILITIES entry (`supported`). Read both so an unsupported
 * action returns a clean message instead of throwing on undefined.join().
 */
function supportedList(capabilities) {
  return capabilities?.supportedActions || capabilities?.supported || [];
}

function actionNotSupported(action, capabilities) {
  const supported = supportedList(capabilities);
  return {
    success: false,
    message: `Action "${action}" is not supported for this product. Use one of: ${supported.join(', ') || 'none'}`,
    code: 'ACTION_NOT_SUPPORTED',
    supportedActions: supported,
  };
}

function missingOsType(action, capabilities) {
  const osOptions = capabilities?.osOptions || [];
  return {
    success: false,
    message: `osType is required for "${action}" on this product. Call action "templates" for the live list${osOptions.length ? `, or use one of: ${osOptions.join(', ')}` : ''}.`,
    code: 'OS_TYPE_REQUIRED',
    supportedActions: supportedList(capabilities),
    osOptions,
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
      await settlePendingAdvpsRebuild(api, Order, order);
      const d = unwrapAdvpsEnvelope(statusRes) || {};
      const powerState = normalizeAdvpsPowerState(d);
      const sync = await syncAdvpsOrderCredentials(api, order, { statusPayload: statusRes, Order });
      await commitAdvpsOrderSync(order, sync.credentialsUpdated ? sync : { dbUpdates: { lastSyncTime: sync.dbUpdates.lastSyncTime } });
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
      await settlePendingAdvpsRebuild(api, Order, order);
      const sync = await syncAdvpsOrderCredentials(api, order, { statusPayload: statusRes, Order, tryGeneratePasswordFallback: true });
      await commitAdvpsOrderSync(order, sync);
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
      await Order.findByIdAndUpdate(orderId, {
        provisioningStatus: 'provisioning',
        lastAction: 'reinstall',
        lastActionTime: new Date(),
        ...(taskId ? { advpsRebuildTaskId: String(taskId) } : {}),
      });
      if (taskId) {
        const rebuildOrderId = orderId;
        const rebuildServiceId = serviceId;
        (async () => {
          const pollDelays = [10000, 15000, 20000, 30000, 60000, 60000, 60000, 60000];
          for (const delay of pollDelays) {
            await new Promise((r) => setTimeout(r, delay));
            try {
              const taskRes = await api.taskStatus(taskId);
              const taskStatus = String((taskRes?.data || taskRes)?.status || '').toUpperCase();
              if (['COMPLETED', 'SUCCESS', 'DONE', 'COMPLETE', 'FINISHED'].includes(taskStatus)) {
                await consumeAdvpsRebuildCreditForTask(Order, rebuildOrderId, taskId);
                await runAdvpsPostRebuildGeneratePasswordFlow({ api, Order, rebuildOrderId, rebuildServiceId, logPrefix: '[RESELLER-MANAGE]' });
                return;
              }
              if (['FAILED', 'ERROR', 'CANCELLED', 'CANCELED'].includes(taskStatus)) {
                await Order.updateOne(
                  { _id: rebuildOrderId, advpsRebuildTaskId: String(taskId) },
                  { $unset: { advpsRebuildTaskId: 1 }, $set: { provisioningStatus: 'failed', provisioningError: 'Rebuild failed' } }
                );
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
    case 'resetmac': {
      try {
        const macRes = await api.resetMac(serviceId);
        const d = macRes?.data || macRes;
        const newMacAddress = d?.newMac || d?.macAddress || d?.mac || null;
        await Order.findByIdAndUpdate(orderId, {
          lastAction: 'resetmac',
          lastActionTime: new Date(),
        });
        return {
          success: true,
          message: 'MAC address reset successfully',
          data: { newMacAddress, serviceId, raw: d },
        };
      } catch (macErr) {
        const status = macErr?.status;
        if (status === 429) {
          return {
            success: false,
            message: 'MAC reset is only allowed once every 24 hours without an active MAC reset subscription.',
            code: 'MAC_RESET_RATE_LIMIT',
          };
        }
        if (status === 404) {
          return {
            success: false,
            message: 'Service not found or MAC reset is not supported for this assignment (VPS only).',
            code: 'MAC_RESET_NOT_APPLICABLE',
          };
        }
        throw macErr;
      }
    }
    default:
      return actionNotSupported(action, PROVIDER_CAPABILITIES.advps);
  }
}

async function runSmartvps(order, orderId, action, osType) {
  const ip = resolveSmartVpsOrderIp(order) || getOrderIp(order);
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
      if (osType) {
        await executeSmartVpsOsInstall(api, ip, osType, {
          assertActionOk: assertSmartVpsActionOk,
        });
      } else {
        await api.format(ip);
      }
      return {
        success: true,
        message: osType
          ? `Reinstall to ${osType} started (changeos). Server is resetting.`
          : 'Reinstall/format command sent. Server is resetting.',
        data: { osType: osType || undefined },
      };
    case 'changeos': {
      if (!osType) return missingOsType(action, PROVIDER_CAPABILITIES.smartvps);
      await executeSmartVpsOsInstall(api, ip, osType, {
        assertActionOk: assertSmartVpsActionOk,
      });
      return { success: true, message: `OS change to ${osType} initiated (changeos)`, data: { osType } };
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
  if (!order.netbayServiceId) return { success: false, message: 'Server is not provisioned yet. Please try again shortly.' };
  const cfg = ipStock?.company?.netbayApi;
  if (!cfg?.baseUrl || !cfg?.apiKey) {
    return { success: false, message: 'Server management is not available for this product.' };
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
        svc = NetbayApi.unwrapServiceResponse(detailRes);
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
      const taskId = apiRes?.data?.taskId || null;
      await Order.findByIdAndUpdate(orderId, {
        lastAction: 'reinstall',
        lastActionTime: new Date(),
        provisioningStatus: 'provisioning',
        ...(taskId ? { netbayTaskId: taskId } : {}),
      });

      if (taskId) {
        const { runNetbayPostRebuildFlow } = require('@/lib/netbayPostRebuildFlow');
        void runNetbayPostRebuildFlow({
          api,
          Order,
          orderId,
          serviceId: sid,
          taskId,
          logPrefix: '[RESELLER-MANAGE-NETBAY]',
        }).catch((err) => {
          console.error('[RESELLER-MANAGE-NETBAY] Post-rebuild sync failed:', err.message);
        });
      }

      return {
        success: true,
        message: 'Reinstall submitted — new password will sync automatically',
        data: { taskId, os: osPayload },
      };
    }
    default:
      return actionNotSupported(action, PROVIDER_CAPABILITIES.netbay);
  }
}

async function runKurohost(order, orderId, action, _osType, ipStock) {
  if (!order.kurohostInstanceId) {
    return { success: false, message: 'Server is not provisioned yet. Please try again shortly.' };
  }
  const cfg = getCompanyKurohostApiConfig(ipStock?.company);
  if (!cfg) {
    return { success: false, message: 'Server management is not available for this product.' };
  }

  const api = new KurohostApi(cfg);
  const iid = order.kurohostInstanceId;

  switch (action) {
    case 'start':
      await api.startInstance(iid);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'start', lastActionTime: new Date() });
      return { success: true, message: 'Start command sent', data: { powerState: 'starting' } };
    case 'stop':
      await api.stopInstance(iid);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'stop', lastActionTime: new Date() });
      return { success: true, message: 'Stop command sent', data: { powerState: 'stopped' } };
    case 'restart':
      await api.rebootInstance(iid);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'restart', lastActionTime: new Date() });
      return { success: true, message: 'Restart command sent', data: {} };
    case 'status':
    case 'sync': {
      const detailRes = await api.getInstance(iid);
      const inst = KurohostApi.unwrapInstance(detailRes);
      const powerState = KurohostApi.mapPowerState(inst?.status);
      await Order.findByIdAndUpdate(orderId, { lastSyncTime: new Date() });
      return { success: true, message: 'Status retrieved', data: { powerState, instance: inst } };
    }
    case 'reinstall': {
      const osTemplateId = String(_osType || '').trim();
      if (!osTemplateId) {
        return missingOsType(action, PROVIDER_CAPABILITIES.kurohost);
      }
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#&$';
      let newPassword = '';
      for (let i = 0; i < 20; i++) {
        newPassword += chars[Math.floor(Math.random() * chars.length)];
      }
      const apiRes = await api.reinstallInstance(iid, { osTemplateId, password: newPassword });
      const jobId = apiRes?.job?.id || null;
      await Order.findByIdAndUpdate(orderId, {
        lastAction: 'reinstall',
        lastActionTime: new Date(),
        provisioningStatus: 'provisioning',
        provisioningError: 'Reinstall in progress — fetching new password…',
        password: newPassword,
        username: 'root',
        ...(jobId ? { kurohostJobId: jobId } : {}),
      });
      void runKurohostPostReinstallFlow({
        api,
        Order,
        orderId,
        instanceId: iid,
        jobId,
        generatedPassword: newPassword,
      }).catch((err) => {
        console.error('[RESELLER-MANAGE-KUROHOST] Post-reinstall sync failed:', err.message);
      });
      return {
        success: true,
        message: 'Reinstall submitted — new password will sync automatically',
        data: { instanceId: iid, jobId, osTemplateId },
      };
    }
    default:
      return actionNotSupported(action, PROVIDER_CAPABILITIES.kurohost);
  }
}

async function runJoy(order, orderId, action, _osType, ipStock) {
  const cfg = getCompanyJoyApiConfig(ipStock?.company);
  if (!cfg) {
    return { success: false, message: 'Server management is not available for this product.' };
  }
  const ip = getOrderIp(order);
  if (!ip) return { success: false, message: 'No IP address on order yet' };

  const api = new JoyApi(cfg);
  const machine = await api.findMachineByIp(ip);
  if (!machine?.ihash) {
    return { success: false, message: `No machine found for IP ${ip} on the Joy panel.` };
  }
  const ihash = machine.ihash;

  switch (action) {
    case 'start': {
      const res = await api.changeMachineState(ihash, 'start');
      await Order.findByIdAndUpdate(orderId, { lastAction: 'start', lastActionTime: new Date() });
      return { success: true, message: 'Start command sent', data: { powerState: 'running', raw: res } };
    }
    case 'stop': {
      const res = await api.changeMachineState(ihash, 'shutdown');
      await Order.findByIdAndUpdate(orderId, { lastAction: 'stop', lastActionTime: new Date() });
      return { success: true, message: 'Stop command sent', data: { powerState: 'stopped', raw: res } };
    }
    case 'restart': {
      const res = await api.changeMachineState(ihash, 'reboot');
      await Order.findByIdAndUpdate(orderId, { lastAction: 'restart', lastActionTime: new Date() });
      return { success: true, message: 'Restart command sent', data: { raw: res } };
    }
    case 'status':
    case 'sync': {
      let powerState = 'unknown';
      let info = null;
      try {
        info = await api.machineInfo(ihash);
        const raw = String(info?.Current?.status || info?.status || '').toLowerCase();
        if (['running', 'on', 'active', 'started', 'online'].includes(raw)) powerState = 'running';
        else if (['stopped', 'off', 'shutdown', 'offline'].includes(raw)) powerState = 'stopped';
        else if (['paused', 'suspended', 'hibernated'].includes(raw)) powerState = 'suspended';
      } catch (_) { /* best effort */ }
      const applied = applyJoyMachineToOrderUpdates(machine, info, order);
      await commitPanelSyncToOrder(order, applied.dbUpdates);
      return {
        success: true,
        message: applied.changes.includes('expiryDate')
          ? 'Status synced — expiry updated from Joy'
          : 'Status retrieved',
        data: {
          powerState,
          machine: info,
          expiryDate: applied.expiryDate || order.expiryDate || null,
          expiryUpdated: applied.changes.includes('expiryDate'),
          changes: applied.changes,
        },
      };
    }
    default:
      return actionNotSupported(action, PROVIDER_CAPABILITIES.joy);
  }
}

async function runResellerApi(order, orderId, action, osType, ipStock) {
  const cfg = getCompanyResellerApiConfig(ipStock?.company);
  if (!cfg) {
    return { success: false, message: 'Reseller panel API is not configured for this company.' };
  }
  const ip = getOrderIp(order);
  if (!ip && !order.resellerVmId) {
    return { success: false, message: 'No IP address or VM id on order yet' };
  }

  const api = new ResellerApi(cfg);
  const findVm = async () => resolveResellerVmForOrder(api, order);

  switch (action) {
    case 'start': {
      const { vmId } = await findVm();
      await api.start(vmId);
      api.invalidateVmIpCache(ip);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'start', lastActionTime: new Date() });
      return { success: true, message: 'Start command sent', data: { powerState: 'starting', vmId } };
    }
    case 'stop': {
      const { vmId } = await findVm();
      await api.stop(vmId);
      api.invalidateVmIpCache(ip);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'stop', lastActionTime: new Date() });
      return { success: true, message: 'Stop command sent', data: { powerState: 'stopped', vmId } };
    }
    case 'restart': {
      const { vmId } = await findVm();
      await api.restart(vmId);
      api.invalidateVmIpCache(ip);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'restart', lastActionTime: new Date() });
      return { success: true, message: 'Restart command sent', data: { vmId } };
    }
    case 'status':
    case 'sync': {
      const found = await findVm();
      const { powerState, rawStatus, source } = await api.resolveVmPowerState(found.vmId, {
        overviewRaw: found.raw,
      });
      const synced = await syncResellerVmCredentials(api, order, found.vmId);
      await Order.findByIdAndUpdate(orderId, {
        ...synced.updates,
        resellerVmId: found.vmId,
        lastSyncTime: new Date(),
      });
      return {
        success: true,
        message: synced.changes.length ? `Synced — ${synced.changes.join(', ')}` : 'Status retrieved',
        data: {
          powerState,
          rawStatus,
          source,
          credentialsUpdated: synced.changes.includes('password'),
          changes: synced.changes,
        },
      };
    }
    case 'reinstall': {
      const isoId = osType;
      if (!isoId) {
        return missingOsType(action, PROVIDER_CAPABILITIES['reseller-api']);
      }
      const { vmId } = await findVm();
      await api.rebuild(vmId, isoId);
      await Order.findByIdAndUpdate(orderId, {
        lastAction: 'reinstall',
        lastActionTime: new Date(),
        provisioningStatus: 'provisioning',
      });
      return {
        success: true,
        message: 'Reinstall submitted — sync after a few minutes for new password',
        data: { vmId, isoId },
      };
    }
    case 'resetmac': {
      const { vmId } = await findVm();
      const apiRes = await api.regenerateMac(vmId);
      const newMacAddress = apiRes?.newMac || apiRes?.mac || apiRes?.data?.mac || null;
      await Order.findByIdAndUpdate(orderId, {
        lastAction: 'resetmac',
        lastActionTime: new Date(),
      });
      return {
        success: true,
        message: apiRes?.message || 'MAC address regenerated successfully',
        data: {
          newMacAddress,
          vmId,
          apiResponse: apiRes,
        },
      };
    }
    case 'reconfigure-network': {
      const { vmId } = await findVm();
      const apiRes = await api.reconfigureNetwork(vmId);
      await Order.findByIdAndUpdate(orderId, {
        lastAction: 'reconfigure-network',
        lastActionTime: new Date(),
      });
      return {
        success: true,
        message: apiRes?.message || 'Network reconfiguration initiated',
        data: {
          vmId,
          apiResponse: apiRes,
        },
      };
    }
    default:
      return actionNotSupported(action, PROVIDER_CAPABILITIES['reseller-api']);
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

function guessHostnameFromOrder(order) {
  return order?.serverDetails?.rawDetails?.hostname || order?.hostname || undefined;
}

/** Same flattening logic as the dashboard service-action Virtualizor branch. */
function flattenVirtualizorOslist(oslist, virtFilter) {
  const out = {};
  if (!oslist || typeof oslist !== 'object') return out;

  const flattenDistros = (distroMap) => {
    if (!distroMap || typeof distroMap !== 'object') return;
    for (const distro of Object.values(distroMap)) {
      if (!distro || typeof distro !== 'object') continue;
      for (const [id, tpl] of Object.entries(distro)) {
        if (!id || !tpl || typeof tpl !== 'object') continue;
        const name = tpl.name || tpl.filename || tpl.desc || String(id);
        out[String(id)] = String(name);
      }
    }
  };

  if (virtFilter) {
    const key = String(virtFilter).toLowerCase();
    const match = Object.entries(oslist).find(([k]) => k.toLowerCase() === key);
    if (match) {
      flattenDistros(match[1]);
      return out;
    }
  }

  for (const virt of Object.values(oslist)) {
    flattenDistros(virt);
  }
  return out;
}

function buildVirtualizorApi(ipStock) {
  const accounts = getCompanyVirtualizorAccounts(ipStock?.company);
  if (!accounts.length) return null;
  return new VirtualizorAPI({ accounts: toVirtualizorApiAccounts(accounts) });
}

async function findVirtualizorVps(api, order) {
  const ip = getOrderIp(order);
  if (!ip) throw new Error('No IP address on order yet');
  const hostname = guessHostnameFromOrder(order);
  const found = await api.findVpsId({ ip, hostname });
  if (!found) {
    throw new Error(`No VPS visible for IP ${ip} on the company's Virtualizor panel`);
  }
  return typeof found === 'object' ? found : { vpsid: String(found), virt: null };
}

async function listVirtualizorOsTemplates(order, ipStock) {
  const api = buildVirtualizorApi(ipStock);
  if (!api) return [];
  const { vpsid, virt } = await findVirtualizorVps(api, order);
  const tplRaw = await api.getTemplates(vpsid);
  const vpsVirt = virt || tplRaw?.virt || tplRaw?.info?.virt || tplRaw?.vs?.virt || null;
  const oslistData = tplRaw?.oslist || tplRaw?.os || tplRaw;
  return toTemplateList(flattenVirtualizorOslist(oslistData, vpsVirt));
}

async function runVirtualizor(order, orderId, action, osType, ipStock) {
  const api = buildVirtualizorApi(ipStock);
  if (!api) {
    return { success: false, message: 'Virtualizor panel is not configured for this company.' };
  }

  switch (action) {
    case 'start': {
      const { vpsid } = await findVirtualizorVps(api, order);
      await api.start(vpsid);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'start', lastActionTime: new Date() });
      return { success: true, message: 'Start command sent', data: { powerState: 'starting', vpsId: vpsid } };
    }
    case 'stop': {
      const { vpsid } = await findVirtualizorVps(api, order);
      await api.stop(vpsid);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'stop', lastActionTime: new Date() });
      return { success: true, message: 'Stop command sent', data: { powerState: 'stopped', vpsId: vpsid } };
    }
    case 'restart': {
      const { vpsid } = await findVirtualizorVps(api, order);
      await api.restart(vpsid);
      await Order.findByIdAndUpdate(orderId, { lastAction: 'restart', lastActionTime: new Date() });
      return { success: true, message: 'Restart command sent', data: { vpsId: vpsid } };
    }
    case 'status':
    case 'sync': {
      const found = await findVirtualizorVps(api, order);
      const { powerState, rawStatus, source } = await api.resolveVpsPowerState(found.vpsid, found.powerRaw);
      await Order.findByIdAndUpdate(orderId, { lastSyncTime: new Date() });
      return {
        success: true,
        message: 'Status retrieved',
        data: { powerState, rawStatus, source, vpsId: found.vpsid },
      };
    }
    case 'reinstall': {
      const templateId = osType;
      if (!templateId) return missingOsType(action, PROVIDER_CAPABILITIES.virtualizor);
      const { vpsid } = await findVirtualizorVps(api, order);
      const pwd = generateSecurePassword();
      await api.reinstall(vpsid, templateId, pwd);
      await Order.findByIdAndUpdate(orderId, {
        password: pwd,
        lastAction: 'reinstall',
        lastActionTime: new Date(),
        provisioningStatus: 'provisioning',
      });
      return {
        success: true,
        message: 'Reinstall submitted — new password is ready on this order',
        data: { vpsId: vpsid, templateId, password: pwd },
      };
    }
    default:
      return actionNotSupported(action, PROVIDER_CAPABILITIES.virtualizor);
  }
}

const PROVIDER_RUNNERS = {
  advps: (order, orderId, action, osType) => runAdvps(order, orderId, action, osType),
  smartvps: (order, orderId, action, osType) => runSmartvps(order, orderId, action, osType),
  hostycare: (order, orderId, action) => runHostycare(order, orderId, action),
  netbay: (order, orderId, action, osType, ipStock) => runNetbay(order, orderId, action, osType, ipStock),
  kurohost: (order, orderId, action, osType, ipStock) => runKurohost(order, orderId, action, osType, ipStock),
  joy: (order, orderId, action, osType, ipStock) => runJoy(order, orderId, action, osType, ipStock),
  'reseller-api': (order, orderId, action, osType, ipStock) => runResellerApi(order, orderId, action, osType, ipStock),
  virtualizor: (order, orderId, action, osType, ipStock) => runVirtualizor(order, orderId, action, osType, ipStock),
  company: (order, orderId, action) => runCompanyAutomation(order, orderId, action),
  oceanlinux: () => ({
    success: false,
    message: 'This order is manually provisioned — no automated management available.',
    code: 'MANUAL_ORDER',
    supportedActions: [],
  }),
};

/**
 * Live OS list for one order, in the `[{ id, name }]` shape the reseller API
 * documents. `id` is always what the provider's rebuild call expects, so a
 * reseller can round-trip it straight into `osType`.
 *
 * Returns [] when the provider exposes no catalogue — callers should treat an
 * empty list as "this product cannot be reinstalled through the API".
 */
export async function listResellerOsTemplates(order, ipStock = null) {
  const provider = resolveResellerManageProvider(order, ipStock);

  switch (provider) {
    case 'advps':
      return toTemplateList(ADVPS_OS_TEMPLATES);

    case 'smartvps': {
      const ip = resolveSmartVpsOrderIp(order) || getOrderIp(order);
      if (!ip) return toTemplateList(SMARTVPS_OS_TEMPLATES);
      try {
        const api = new SmartVpsAPI();
        const map = await fetchSmartVpsOsTemplates(api, ip, { currentOs: order.os });
        return toTemplateList(map);
      } catch (err) {
        console.warn('[RESELLER] SmartVPS live template fetch failed:', err.message);
        return toTemplateList(SMARTVPS_OS_TEMPLATES);
      }
    }

    case 'netbay': {
      const cfg = ipStock?.company?.netbayApi;
      if (!cfg?.baseUrl || !cfg?.apiKey) return [];
      const res = await new NetbayApi(cfg).listOs({});
      const list = res?.data?.os || res?.data || [];
      // Netbay's rebuild takes the template *name*, so the name is the id.
      return (Array.isArray(list) ? list : [])
        .map((os) => String(os?.name || '').trim())
        .filter(Boolean)
        .map((name) => ({ id: name, name }));
    }

    case 'kurohost': {
      const cfg = getCompanyKurohostApiConfig(ipStock?.company);
      if (!cfg) return [];
      const zoneId = order.kurohostZoneId || undefined;
      const res = await new KurohostApi(cfg).listOsTemplates(zoneId ? { cloudZoneId: zoneId } : undefined);
      return (res?.items || [])
        .filter((t) => t?.id != null)
        .map((t) => ({ id: String(t.id), name: String(t.name || t.id) }));
    }

    case 'reseller-api': {
      const cfg = getCompanyResellerApiConfig(ipStock?.company);
      if (!cfg) return [];
      const api = new ResellerApi(cfg);
      const { vmId } = await resolveResellerVmForOrder(api, order);
      const { isos } = await api.getVmIsos(vmId);
      return (Array.isArray(isos) ? isos : [])
        .map((iso) => {
          const id = iso?.id ?? iso?.isoId ?? iso?.templateId;
          if (id == null) return null;
          return { id: String(id), name: String(iso.isoName || iso.name || iso.label || `ISO ${id}`) };
        })
        .filter(Boolean);
    }

    case 'virtualizor':
      return listVirtualizorOsTemplates(order, ipStock);

    default:
      return [];
  }
}

/**
 * Execute a universal manage action for a reseller order.
 */
export async function executeResellerServerAction({ order, orderId, action, osType, ipStock = null }) {
  const normalized = normalizeResellerAction(action);

  if (!UNIVERSAL_ACTIONS.includes(normalized)) {
    return {
      success: false,
      message: `Invalid action. Use: ${UNIVERSAL_ACTIONS.join(', ')} (aliases: format, reboot, reset-mac)`,
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

  const provider = resolveResellerManageProvider(order, ipStock);

  if (normalized === 'templates') {
    const osTemplates = await listResellerOsTemplates(order, ipStock);
    return {
      success: true,
      action: normalized,
      message: osTemplates.length
        ? 'OS templates retrieved'
        : 'This product has no OS catalogue available through the API',
      data: { osTemplates },
      osTemplates,
      supportedActions: capabilities.supportedActions,
    };
  }

  let resolvedOsType = osType;

  if (OS_ACTIONS.has(normalized)) {
    const needsOs =
      (normalized === 'reinstall' && capabilities.reinstallRequiresOs) ||
      (normalized === 'changeos' && capabilities.changeosRequiresOs);
    if (needsOs && !osType) return missingOsType(normalized, capabilities);

    // These providers rebuild by upstream id, so map whatever the reseller
    // sent (id or friendly name) onto a real id before calling them.
    if (osType && ID_BASED_OS_PROVIDERS.has(provider)) {
      const osTemplates = await listResellerOsTemplates(order, ipStock);
      const match = resolveTemplateId(osTemplates, osType);
      if (!match) return unknownTemplate(osType, osTemplates);
      resolvedOsType = match;
    }
  }

  const runner = PROVIDER_RUNNERS[provider] || PROVIDER_RUNNERS.oceanlinux;

  try {
    const result = await runner(order, orderId, normalized, resolvedOsType, ipStock);
    return {
      ...result,
      action: normalized,
      supportedActions: capabilities.supportedActions,
    };
  } catch (err) {
    if (provider === 'netbay') {
      const facing = toUserFacingNetbayError(err);
      return {
        success: false,
        message: facing.message,
        code: facing.code,
        nextAvailableAt: facing.nextAvailableAt || undefined,
        action: normalized,
        supportedActions: capabilities.supportedActions,
      };
    }
    throw err;
  }
}
