import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import Company from '@/models/companyModel';
import User from '@/models/userModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import { enforceUserActionRateLimit } from '@/lib/rateLimit';
import { isAdminUser } from '@/lib/adminAuth';
import { internalKeyMatches } from '@/lib/internalApiKey';
import { execFileSync } from 'child_process';

/** Hostycare reinstall probes multiple Virtualizor panels + may POST reinstall. */
export const maxDuration = 120;

const HostycareAPI = require('@/services/hostycareApi');
const SmartVpsAPI = require('@/services/smartvpsApi');
// at top of /api/orders/service-action/route.js
import { VirtualizorAPI } from '@/services/virtualizorApi';   // you exported the class by name
// or: import VirtualizorAPI from '@/services/virtualizorApi'; // you also export default
const {
  getCompanyVirtualizorAccounts,
  toVirtualizorApiAccounts,
} = require('@/lib/companyVirtualizor');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const ResellerApi = require('@/services/resellerApi');
const { getCompanyNetbayApiConfig } = require('@/lib/companyNetbayApi');
const { getCompanyKurohostApiConfig } = require('@/lib/companyKurohostApi');
const NetbayApi = require('@/services/netbayApi');
const KurohostApi = require('@/services/kurohostApi');
const { getCompanyJoyApiConfig, resolveJoyApiForOrder } = require('@/lib/companyJoyApi');
const JoyApi = require('@/services/joyApi');
const { applyJoyMachineToOrderUpdates } = require('@/lib/joyOrderSync');
const { runNetbayPostRebuildFlow } = require('@/lib/netbayPostRebuildFlow');
const { applyNetbayServiceToOrderUpdates, resolveNetbayPowerState, syncNetbayOrderFromApi } = require('@/lib/netbayOrderSync');
const {
  syncResellerVmCredentials,
  resolveResellerVmForOrder,
} = require('@/lib/resellerApiOrderSync');
const {
  applyKurohostInstanceToOrderUpdates,
  resolveKurohostPowerState,
  syncKurohostOrderFromApi,
} = require('@/lib/kurohostOrderSync');
const { mapKurohostOsLabel, runKurohostPostReinstallFlow } = require('@/lib/kurohostPostReinstallFlow');
const { toUserFacingNetbayError } = require('@/lib/netbayApiErrors');
const { sanitizeCustomerApiPayload, customerServiceErrorMessage } = require('@/lib/customerFacingErrors');
const { assertOrderNotAdminSuspended } = require('@/lib/orderAdminSuspend');

function actionJson(body, status = 200, action = null) {
  return NextResponse.json(sanitizeCustomerApiPayload(body, { action }), { status });
}

async function resolveOrderForAction(request, orderId) {
  // /api/internal/service-action forwards requests with the internal key in
  // this header. The comparison is constant-time and fails closed when
  // INTERNAL_API_KEY is unset, so it is no weaker than the outer gate.
  if (internalKeyMatches(request.headers.get('x-internal-bypass'))) {
    const order = await Order.findById(orderId);
    if (!order) {
      return { error: NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 }) };
    }
    return { order, userId: order.user ? String(order.user) : null };
  }

  let userId;
  try {
    userId = await getDataFromToken(request);
  } catch {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const user = await User.findById(userId).lean();
  if (!user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const order = isAdminUser(user)
    ? await Order.findById(orderId)
    : await Order.findOne({ _id: orderId, user: userId });

  if (!order) {
    return { error: NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 }) };
  }

  const suspended = assertOrderNotAdminSuspended(order, { isAdmin: isAdminUser(user) });
  if (suspended) {
    return { error: NextResponse.json(suspended, { status: 403 }) };
  }

  return { order, userId };
}

/**
 * Resolve every per-company Virtualizor panel configured against the order's
 * IP stock, in priority order. Returns an empty array when the order isn't
 * linked to a company that has Virtualizor automation enabled — callers
 * should fall back to the regular provider/manual flow in that case.
 */
async function resolveCompanyVirtualizorAccounts(order) {
  if (!order?.ipStockId) return { accounts: [], companyName: null };
  try {
    const ipStock = await IPStock.findById(order.ipStockId).select('company').lean();
    if (!ipStock?.company) return { accounts: [], companyName: null };
    const company = await Company.findById(ipStock.company).select('virtualizors virtualizor name').lean();
    if (!company) return { accounts: [], companyName: null };
    const accounts = getCompanyVirtualizorAccounts(company);
    return { accounts, companyName: company.name };
  } catch (err) {
    console.error('[SERVICE-ACTION] Company-Virtualizor lookup failed:', err.message);
    return { accounts: [], companyName: null };
  }
}

/**
 * Resolve the company-level reseller-API config (Hostheaven / SomaniOne)
 * for an order. Returns { config: null } when nothing is configured (or the
 * company has Virtualizor automation, which takes priority and should be
 * handled by the caller before this is consulted).
 */
async function resolveCompanyResellerApi(order) {
  if (!order?.ipStockId) return { config: null, companyName: null };
  try {
    const ipStock = await IPStock.findById(order.ipStockId).select('company').lean();
    if (!ipStock?.company) return { config: null, companyName: null };
    const company = await Company.findById(ipStock.company)
      .select('resellerApi name')
      .lean();
    if (!company) return { config: null, companyName: null };
    const config = getCompanyResellerApiConfig(company);
    return { config, companyName: company.name };
  } catch (err) {
    console.error('[SERVICE-ACTION] Company-Reseller-API lookup failed:', err.message);
    return { config: null, companyName: null };
  }
}

/**
 * Resolve the company-level Netbay API config (https://api.netbayhosts.in)
 * for an order. Same return-null semantics as the helpers above. Netbay is
 * keyed by the order having a `netbayServiceId` (set during auto provision)
 * — without one we can't address the upstream service, so action handlers
 * should still bail with a useful error message even if the company config
 * exists.
 */
async function resolveCompanyNetbayApi(order) {
  if (!order?.ipStockId) return { config: null, companyName: null };
  try {
    const ipStock = await IPStock.findById(order.ipStockId).select('company').lean();
    if (!ipStock?.company) return { config: null, companyName: null };
    const company = await Company.findById(ipStock.company)
      .select('netbayApi name')
      .lean();
    if (!company) return { config: null, companyName: null };
    const config = getCompanyNetbayApiConfig(company);
    return { config, companyName: company.name };
  } catch (err) {
    console.error('[SERVICE-ACTION] Company-Netbay-API lookup failed:', err.message);
    return { config: null, companyName: null };
  }
}

async function resolveCompanyKurohostApi(order) {
  if (!order?.ipStockId) return { config: null, companyName: null };
  try {
    const ipStock = await IPStock.findById(order.ipStockId).select('company').lean();
    if (!ipStock?.company) return { config: null, companyName: null };
    const company = await Company.findById(ipStock.company)
      .select('kurohostApi name')
      .lean();
    if (!company) return { config: null, companyName: null };
    const config = getCompanyKurohostApiConfig(company);
    return { config, companyName: company.name };
  } catch (err) {
    console.error('[SERVICE-ACTION] Company-KuroHost-API lookup failed:', err.message);
    return { config: null, companyName: null };
  }
}

/** KuroHost power actions are async; treat already-in-target-state as success. */
async function runKurohostPowerAction(api, instanceId, action) {
  const detailRes = await api.getInstance(instanceId);
  const current = KurohostApi.unwrapInstance(detailRes);
  const status = String(current?.status || '').toUpperCase();

  if (action === 'start' && status === 'RUNNING') {
    return {
      apiResponse: { instance: current, action: 'start', alreadyInState: true },
      message: 'Server is already running',
      powerState: 'running',
      rawStatus: status,
    };
  }
  if (action === 'stop' && (status === 'STOPPED' || status === 'SUSPENDED')) {
    return {
      apiResponse: { instance: current, action: 'stop', alreadyInState: true },
      message: 'Server is already stopped',
      powerState: 'stopped',
      rawStatus: status,
    };
  }
  if ((action === 'restart' || action === 'reboot') && status === 'STOPPED') {
    const err = new Error('Cannot reboot a stopped instance — start it first.');
    err.status = 409;
    throw err;
  }

  let apiRes;
  if (action === 'start') apiRes = await api.startInstance(instanceId);
  else if (action === 'stop') apiRes = await api.stopInstance(instanceId);
  else apiRes = await api.rebootInstance(instanceId);

  const jobId = apiRes?.job?.id || apiRes?.jobId || null;
  if (jobId) {
    try {
      await api.waitForJob(jobId, { maxWaitMs: 120_000, pollIntervalMs: 3_000 });
    } catch (jobErr) {
      console.warn(`[SERVICE-ACTION] KuroHost ${action} job poll: ${jobErr.message}`);
    }
  }

  const afterRes = await api.getInstance(instanceId);
  const after = KurohostApi.unwrapInstance(afterRes);
  const { powerState, rawStatus } = resolveKurohostPowerState(after);

  const actionLabel = action === 'start' ? 'Start' : action === 'stop' ? 'Stop' : 'Reboot';
  return {
    apiResponse: apiRes,
    message: `${actionLabel} command completed`,
    powerState,
    rawStatus,
    jobId,
  };
}

/**
 * Resolve the company-level Joy Services API config for an order. Joy is a
 * manage-only provider (power actions + status) with NO per-order service id —
 * machines are matched by IP via `machine_list`. Returns null config when the
 * company has no Joy automation enabled.
 */
async function resolveCompanyJoyApi(order) {
  return resolveJoyApiForOrder(order, { Company, IPStock });
}

/**
 * Normalize a Joy `machine_info` payload into a simple power state string.
 */
function resolveJoyPowerState(machineInfo) {
  const raw = String(machineInfo?.Current?.status || machineInfo?.status || '').toLowerCase().trim();
  if (['running', 'online', 'active', 'started', 'on'].includes(raw)) return 'running';
  if (['stopped', 'offline', 'off', 'shutdown', 'down'].includes(raw)) return 'stopped';
  if (['paused', 'suspended', 'hibernated'].includes(raw)) return 'suspended';
  return raw || 'unknown';
}

/**
 * Pull the current password for a reseller (Hostheaven) VM and persist it onto
 * the order when it differs from what we have stored. Hostheaven now rotates
 * the root/login password on every reinstall, so a stale `order.password`
 * would otherwise show the customer a credential that no longer works. Safe to
 * call on every status/sync — it only writes when the value actually changed.
 *
 * @returns {Promise<{changed: boolean, password: string|null, error?: string}>}
 */
async function syncResellerOrderPassword(resellerApi, order, orderId, vmId) {
  try {
    const newPass = await resellerApi.getVmPassword(vmId);
    if (newPass && newPass !== order.password) {
      await Order.findByIdAndUpdate(orderId, {
        password: newPass,
        lastSyncTime: new Date(),
        $push: {
          logs: {
            action: 'sync',
            timestamp: new Date(),
            details: 'Password refreshed from reseller panel (Hostheaven)',
            success: true,
          },
        },
      });
      console.log(`[SERVICE-ACTION] 🔑 Reseller password refreshed for order ${orderId} (vmId=${vmId})`);
      return { changed: true, password: newPass };
    }
    return { changed: false, password: newPass || order.password || null };
  } catch (err) {
    console.warn(`[SERVICE-ACTION] Reseller password sync failed (vmId=${vmId}): ${err.message}`);
    return { changed: false, password: order.password || null, error: err.message };
  }
}

async function applyResellerPanelSync(resellerApi, order, orderId, vmId) {
  const synced = await syncResellerVmCredentials(resellerApi, order, vmId);
  const updates = { ...synced.updates, resellerVmId: String(vmId) };
  await Order.findByIdAndUpdate(orderId, updates);
  return synced;
}

/**
 * Background watcher: Hostheaven assigns the new password during/after the
 * rebuild, which can lag a few seconds behind the reinstall call returning.
 * Poll the details endpoint until the password changes from what it was before
 * the rebuild (or a sane max attempts), then persist it. Runs detached — the
 * HTTP response to the user returns immediately.
 */
function watchResellerPasswordAfterReinstall(resellerApi, orderId, vmId, previousPassword) {
  const delays = [8000, 12000, 15000, 20000, 30000, 30000, 45000, 60000];
  (async () => {
    for (let i = 0; i < delays.length; i++) {
      await new Promise((r) => setTimeout(r, delays[i]));
      try {
        const order = await Order.findById(orderId);
        if (!order) return;

        const newPass = await resellerApi.getVmPassword(vmId);
        if (newPass && newPass !== previousPassword) {
          const synced = await syncResellerVmCredentials(resellerApi, order, vmId);
          const updates = {
            ...synced.updates,
            password: newPass,
            lastSyncTime: new Date(),
            resellerVmId: String(vmId),
          };
          await Order.findByIdAndUpdate(orderId, {
            ...updates,
            $push: {
              logs: {
                action: 'reinstall',
                timestamp: new Date(),
                details: `Post-reinstall sync from panel (${synced.changes.join(', ') || 'password'})`,
                success: true,
              },
            },
          });
          console.log(`[SERVICE-ACTION] 🔑 Post-reinstall credentials captured for order ${orderId} (attempt ${i + 1}, changes: ${synced.changes.join(', ') || 'password'})`);
          return;
        }
      } catch (err) {
        console.warn(`[SERVICE-ACTION] Post-reinstall password poll ${i + 1} failed (vmId=${vmId}): ${err.message}`);
      }
    }
    console.warn(`[SERVICE-ACTION] Post-reinstall password not captured in time for order ${orderId} (vmId=${vmId}) — Sync will retry.`);
  })().catch((err) => console.error('[SERVICE-ACTION] Post-reinstall password watcher crashed:', err.message));
}

/**
 * Convert Reseller-API ISO objects into the flat `{ [id]: name }` shape the
 * dashboard's reinstall dropdown expects.
 *
 * Each upstream entry typically looks like:
 *   { id: 1, isoName: "Ubuntu 22.04", osType: "UBUNTU" }
 */
function flattenResellerIsos(isos) {
  const out = {};
  if (!Array.isArray(isos)) return out;
  for (const iso of isos) {
    if (!iso) continue;
    const id = iso.id ?? iso.isoId ?? iso.templateId;
    if (id == null) continue;
    const name = iso.isoName || iso.name || iso.label || iso.osType || `ISO ${id}`;
    out[String(id)] = String(name);
  }
  return out;
}

/**
 * Best-effort family classification for an upstream ISO object — same pattern
 * as the Virtualizor branch above. Used to keep the order document's `os`
 * label and `username` (root vs Administrator) in sync with what the user
 * just installed via reseller rebuild.
 */
function classifyResellerIso(iso) {
  if (!iso) return { family: null, username: null, osLabel: null };
  const haystack = [iso.isoName, iso.name, iso.osType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/\b(windows|win\s*server|win\s*xp|win\s*7|win\s*8|win\s*10|win\s*11|server\s*200[38]|server\s*201[269]|server\s*202[0-9])\b/.test(haystack)) {
    return { family: 'windows', username: 'Administrator', osLabel: iso.isoName || iso.name || null };
  }
  if (/\b(ubuntu|debian|centos|rocky|almalinux|alma|fedora|rhel|redhat|linux|arch|opensuse|suse)\b/.test(haystack)) {
    return { family: 'linux', username: 'root', osLabel: iso.isoName || iso.name || null };
  }
  return { family: null, username: null, osLabel: iso.isoName || iso.name || null };
}

function normalizeVirtualizorRunningState(raw) {
  return VirtualizorAPI.normalizeVpsPowerState(raw);
}


// Helper function to generate secure password
// Helper function to generate a stronger secure password
function generateSecurePassword() {
  const length = 20; // Increased length
  // More complex character set for higher strength
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const symbols = "@#&$";

  let password = "";

  // Ensure we have at least one of each type for strength
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill the rest randomly
  const allChars = lowercase + uppercase + numbers + symbols;
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password to randomize the order
  return password.split('').sort(() => Math.random() - 0.5).join('');
}


/**
 * Walk Virtualizor's nested `oslist` and return metadata for a specific
 * template id: its friendly name, the distro bucket key (e.g. "windows" /
 * "ubuntu"), and the virtualization type bucket. Used after a company-
 * Virtualizor reinstall so we can sync `order.os` and `order.username` to
 * match the OS the user actually installed (e.g. Linux → Windows).
 */
function findTemplateMeta(oslist, templateId) {
  if (!oslist || typeof oslist !== 'object' || templateId == null) return null;
  const targetId = String(templateId);
  for (const [virtType, distros] of Object.entries(oslist)) {
    if (!distros || typeof distros !== 'object') continue;
    for (const [distroKey, templates] of Object.entries(distros)) {
      if (!templates || typeof templates !== 'object') continue;
      for (const [tplId, tpl] of Object.entries(templates)) {
        if (String(tplId) !== targetId) continue;
        const name =
          (tpl && typeof tpl === 'object' &&
            (tpl.name || tpl.filename || tpl.desc || tpl.title)) ||
          String(tplId);
        return {
          templateId: targetId,
          name: String(name),
          distro: String(distroKey),
          virtType: String(virtType),
        };
      }
    }
  }
  return null;
}

/**
 * Classify an OS template's family from the metadata + name. Returns the
 * canonical username (and family) so the order document stays in sync after
 * a cross-family reinstall (Linux → Windows or vice versa).
 */
function classifyOsFamily(tplMeta) {
  if (!tplMeta) return { family: null, username: null };
  const haystack = [tplMeta.distro, tplMeta.name].filter(Boolean).join(' ').toLowerCase();
  if (/\b(windows|win\s*2k|win\s*server|winsrv|win\s*xp|win\s*7|win\s*8|win\s*10|win\s*11|server\s*200[38]|server\s*201[269]|server\s*202[0-9])\b/.test(haystack)) {
    return { family: 'windows', username: 'Administrator' };
  }
  if (/\b(ubuntu|debian|centos|rocky|almalinux|alma|fedora|rhel|redhat|linux|arch|opensuse|suse)\b/.test(haystack)) {
    return { family: 'linux', username: 'root' };
  }
  return { family: null, username: null };
}

function flattenOslist(oslist, virtFilter) {
  const out = {};
  if (!oslist || typeof oslist !== 'object') return out;

  const flattenDistros = (distroMap) => {
    if (!distroMap || typeof distroMap !== 'object') return;
    for (const distro of Object.values(distroMap)) {
      if (!distro || typeof distro !== 'object') continue;
      for (const [id, tpl] of Object.entries(distro)) {
        if (!id || !tpl || typeof tpl !== 'object') continue;
        const name =
          (tpl).name ||
          (tpl).filename ||
          (tpl).desc ||
          String(id);
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


/** Strict IPv4 so a stored address can never reach the ping/TCP probes as shell input. */
function toProbeIpv4(value) {
  const parts = String(value || '').trim().split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (octets.some((o) => Number.isNaN(o) || o > 255)) return null;
  return octets.join('.');
}

function isServerReachable(ip) {
  const raw = String(ip || '');
  const cleanIp = toProbeIpv4(raw.split(':')[0]);
  if (!cleanIp) return false;

  const parsedPort = raw.includes(':') ? parseInt(raw.split(':')[1], 10) : NaN;
  const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
    ? parsedPort
    : null;

  // execFileSync (not execSync) — no shell, so the address can't be used to
  // smuggle extra commands onto our own server.
  const isWin = process.platform === 'win32';
  const pingArgs = isWin
    ? ['-n', '1', '-w', '3000', cleanIp]
    : ['-c', '1', '-W', '3', cleanIp];
  try {
    execFileSync('ping', pingArgs, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    // Ping failed — try TCP connect to the port (handles Windows servers that block ICMP)
  }

  const portsToTry = port ? [port] : [22, 3389];
  for (const p of portsToTry) {
    try {
      execFileSync(
        process.execPath,
        [
          '-e',
          `const s=require('net').createConnection(${p},'${cleanIp}',()=>{process.exit(0)});s.setTimeout(3000);s.on('timeout',()=>process.exit(1));s.on('error',()=>process.exit(1))`,
        ],
        { stdio: 'ignore', timeout: 5000 }
      );
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

function guessHostnameFromOrder(order) {
  return (
    order?.serverDetails?.rawDetails?.hostname ||
    order?.hostname ||
    undefined
  );
}

/**
 * Merge env Virtualizor panels with any per-company panels on the order's IP stock.
 * Hostycare reinstall/templates need every panel — some VPS (e.g. 103.215.x.x) only
 * appear on a slow or company-specific node.
 */
async function buildMergedVirtualizorApi(order) {
  let envAccounts = [];
  try {
    const envApi = new VirtualizorAPI();
    envAccounts = envApi.accounts;
  } catch (err) {
    console.warn('[SERVICE-ACTION] Env Virtualizor not configured:', err.message);
  }

  const { accounts: companyAccounts } = await resolveCompanyVirtualizorAccounts(order);
  const companyApiAccounts = companyAccounts.length
    ? toVirtualizorApiAccounts(companyAccounts)
    : [];

  const seen = new Set();
  const merged = [];
  for (const acct of [...envAccounts, ...companyApiAccounts]) {
    const key = `${acct.host}:${acct.port || 4083}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(acct);
    }
  }

  if (!merged.length) {
    throw new Error('VirtualizorAPI: no panels configured (check VIRTUALIZOR_HOST_* env or company Virtualizor settings)');
  }

  console.log(
    `[SERVICE-ACTION] Virtualizor panels: ${envAccounts.length} env + ${companyApiAccounts.length} company → ${merged.length} unique`
  );
  return new VirtualizorAPI({ accounts: merged });
}



export async function POST(request) {
  try {
    // Internal forwards carry no auth cookie, so they'd all share one "unknown IP"
    // bucket and throttle each other. They are already gated by the internal key.
    if (!internalKeyMatches(request.headers.get('x-internal-bypass'))) {
      const rateLimited = enforceUserActionRateLimit(request);
      if (rateLimited) return rateLimited;
    }

    await connectDB();

    const body = await request.json();
    const { orderId, action, templateId, newPassword, payload } = body;

    const resolved = await resolveOrderForAction(request, orderId);
    if (resolved.error) return resolved.error;
    const order = resolved.order;

    console.log(`[SERVICE-ACTION][POST] Action: ${action}, Order: ${orderId}, Template: ${templateId}`);

    // Debug order details
    console.log(`[SERVICE-ACTION][POST] Order productName: ${order.productName}`);
    console.log(`[SERVICE-ACTION][POST] Order provider: ${order.provider}`);

    // Check if this is a VPS order (more flexible validation)
    const isVPSOrder = order.productType === 'vps' ||
      order.productType === 'VPS' ||
      (order.productName && order.productName.toLowerCase().includes('vps')) ||
      (order.productName && order.productName.toLowerCase().includes('server')) ||
      (order.productName && order.productName.toLowerCase().includes('linux')) ||
      (order.productName && order.productName.toLowerCase().includes('premium')) ||
      (order.productName && order.productName.toLowerCase().includes('windows')) ||
      (order.productName && order.productName.toLowerCase().includes('rdp')) ||
      order.ipAddress || // Has IP address
      (order.serverDetails && order.serverDetails.rawDetails && order.serverDetails.rawDetails.ips);

    if (!isVPSOrder) {
      return actionJson({
        success: false,
        error: 'This action is only available for VPS orders.',
      }, 400, action);
    }

    // Extract IP address from order details
    let ipAddress = null;

    // Check top-level ipAddress field (this is where it is!)
    if (order.ipAddress) {
      ipAddress = order.ipAddress;
      console.log(`[SERVICE-ACTION][POST] Found IP in order.ipAddress: ${ipAddress}`);
    }

    // Check serverDetails.rawDetails.ips array
    if (!ipAddress && order.serverDetails?.rawDetails?.ips && order.serverDetails.rawDetails.ips.length > 0) {
      ipAddress = order.serverDetails.rawDetails.ips[0];
      console.log(`[SERVICE-ACTION][POST] Found IP in serverDetails.rawDetails.ips: ${ipAddress}`);
    }

    // Check other possible locations
    if (!ipAddress) {
      ipAddress = order.serviceDetails?.ipAddress ||
        order.serviceDetails?.ip ||
        order.productDetails?.ipAddress ||
        order.productDetails?.ip ||
        order.ip;
    }

    // Netbay actions are addressed by serviceId, not IP — so missing IP
    // shouldn't block the request. Every other provider in this route still
    // requires an IP for VM lookup.
    const orderIsNetbay = order.provider === 'netbay' || !!order.netbayServiceId;
    const orderIsKurohost = order.provider === 'kurohost' || !!order.kurohostInstanceId;
    if (!ipAddress && !orderIsNetbay && !orderIsKurohost) {
      return actionJson({
        success: false,
        error: 'No IP address found for this VPS order. Please contact support.',
      }, 400, action);
    }

    console.log(`[SERVICE-ACTION][POST] Using IP address: ${ipAddress || '(none — Netbay)'}`);

    let result;

    // Initialize the appropriate APIs based on provider
    let virtualizorApi = null;
    let hostycareApi = null;
    let smartvpsApi = null;

    // Detect provider type — never treat a Hostycare-provisioned order as SmartVPS
    const isSmartVps = !order.hostycareServiceId && (
      order.provider === 'smartvps' ||
      order.smartvpsDetails?.ip ||
      (order.productName && order.productName.includes('🌊'))
    );
    const isNetbay = order.provider === 'netbay' || !!order.netbayServiceId;
    const isKurohost = order.provider === 'kurohost' || !!order.kurohostInstanceId;
    const hasHostycareService = !!order.hostycareServiceId;

    console.log(`[SERVICE-ACTION][POST] Provider detection: isSmartVps=${isSmartVps}, isNetbay=${isNetbay}, isKurohost=${isKurohost}, hasHostycareService=${hasHostycareService}, order.provider=${order.provider}`);

    // -------------------- KuroHost branch --------------------
    if (isKurohost) {
      const supportedActions = new Set(['start', 'stop', 'restart', 'reboot', 'status', 'sync', 'templates', 'reinstall', 'terminate']);
      if (!supportedActions.has(action)) {
        return actionJson({
          success: false,
          error: `Action '${action}' is not supported for this server.`,
        }, 400, action);
      }

      const { config: kurohostCfg, companyName: kurohostCompanyName } = await resolveCompanyKurohostApi(order);
      if (!kurohostCfg) {
        return actionJson({
          success: false,
          error: 'Server management is not available for this plan. Please contact support.',
        }, 503, action);
      }

      if (!order.kurohostInstanceId && action !== 'templates') {
        return actionJson({
          success: false,
          error: 'This server is still being set up. Please try again in a minute.',
        }, 409, action);
      }

      console.log(`[SERVICE-ACTION][POST] Routing via KuroHost API (${kurohostCfg.baseUrl}) for action=${action} (company=${kurohostCompanyName || 'unknown'}, instanceId=${order.kurohostInstanceId})`);

      let kurohostApi;
      try {
        kurohostApi = new KurohostApi(kurohostCfg);
      } catch (apiErr) {
        return actionJson({
          success: false,
          error: apiErr.message || 'Server management is temporarily unavailable.',
        }, 500, action);
      }

      try {
        switch (action) {
          case 'start':
          case 'stop':
          case 'restart':
          case 'reboot': {
            const normalizedAction = action === 'reboot' ? 'restart' : action;
            const powerResult = await runKurohostPowerAction(
              kurohostApi,
              order.kurohostInstanceId,
              normalizedAction
            );
            await Order.findByIdAndUpdate(orderId, {
              lastAction: normalizedAction,
              lastActionTime: new Date(),
              ...(powerResult.jobId ? { kurohostJobId: powerResult.jobId } : {}),
            });
            return NextResponse.json({
              success: true,
              powerState: powerResult.powerState,
              rawStatus: powerResult.rawStatus,
              result: {
                success: true,
                message: powerResult.message,
                apiResponse: powerResult.apiResponse,
                instanceId: order.kurohostInstanceId,
                alreadyInState: !!powerResult.apiResponse?.alreadyInState,
              },
            });
          }
          case 'terminate': {
            const apiRes = await kurohostApi.terminateInstance(order.kurohostInstanceId);
            await Order.findByIdAndUpdate(orderId, {
              lastAction: 'terminate',
              lastActionTime: new Date(),
              provisioningStatus: 'terminated',
              status: 'cancelled',
            });
            return NextResponse.json({
              success: true,
              result: { success: true, message: 'Instance terminated', apiResponse: apiRes, instanceId: order.kurohostInstanceId },
            });
          }
          case 'status':
          case 'sync': {
            const sync = await syncKurohostOrderFromApi(order);
            if (!sync.ok) {
              return actionJson({ success: false, error: sync.error || 'Sync failed' }, 502, action);
            }
            const inst = sync.instance;
            const { powerState, rawStatus } = resolveKurohostPowerState(inst);
            await Order.findByIdAndUpdate(orderId, sync.dbUpdates);
            const syncChanges = sync.changes || [];
            const credentialsUpdated = syncChanges.some(c => ['password', 'username', 'ipAddress'].includes(c));
            return NextResponse.json({
              success: true,
              powerState,
              rawStatus,
              provider: 'kurohost',
              instanceId: order.kurohostInstanceId,
              instance: inst || null,
              credentialsUpdated,
              syncResult: {
                credentialsUpdated,
                changes: syncChanges,
                lastSyncTime: sync.dbUpdates.lastSyncTime?.toISOString?.() || new Date().toISOString(),
              },
            });
          }
          case 'templates': {
            const zoneId = payload?.cloudZoneId || body?.cloudZoneId || order.kurohostZoneId || undefined;
            const osRes = await kurohostApi.listOsTemplates(zoneId ? { cloudZoneId: zoneId } : undefined);
            const osList = osRes?.items || [];
            const flat = {};
            for (const tpl of osList) {
              const id = String(tpl?.id || '').trim();
              const name = String(tpl?.name || id).trim();
              if (!id) continue;
              flat[id] = {
                id,
                name,
                isWindows: !!tpl?.isWindows,
                label: name,
              };
            }
            return NextResponse.json({
              success: true,
              result: flat,
              raw: osList,
              provider: 'kurohost',
            });
          }
          case 'reinstall': {
            const osTemplateId =
              payload?.templateId ||
              payload?.osTemplateId ||
              body?.templateId ||
              templateId ||
              null;
            if (!osTemplateId) {
              return actionJson({ success: false, error: 'Please select an operating system.' }, 400, 'reinstall');
            }

            const osTemplateName =
              payload?.osName ||
              body?.osName ||
              payload?.name ||
              '';
            const isWindows = !!payload?.isWindows || /windows|win\s*server/i.test(String(osTemplateName));
            const newPassword =
              (typeof payload?.password === 'string' && payload.password.trim()) ||
              (typeof body?.password === 'string' && body.password.trim()) ||
              generateSecurePassword();

            const apiRes = await kurohostApi.reinstallInstance(order.kurohostInstanceId, {
              osTemplateId: String(osTemplateId),
              password: newPassword,
            });
            const jobId = apiRes?.job?.id || apiRes?.jobId || null;

            await Order.findByIdAndUpdate(orderId, {
              lastAction: 'reinstall',
              lastActionTime: new Date(),
              provisioningStatus: 'provisioning',
              provisioningError: 'Reinstall in progress — new password will appear when ready…',
              password: newPassword,
              os: mapKurohostOsLabel(osTemplateName, isWindows),
              username: isWindows ? 'Administrator' : 'root',
              ...(jobId ? { kurohostJobId: jobId } : {}),
            });

            const reinstallOrderId = orderId;
            const reinstallInstanceId = order.kurohostInstanceId;
            void runKurohostPostReinstallFlow({
              api: kurohostApi,
              Order,
              orderId: reinstallOrderId,
              instanceId: reinstallInstanceId,
              jobId,
              generatedPassword: newPassword,
              osTemplateName,
              isWindows,
            }).catch((bgErr) => {
              console.error('[SERVICE-ACTION][POST] KuroHost post-reinstall flow failed:', bgErr.message);
            });

            return NextResponse.json({
              success: true,
              result: {
                accepted: true,
                instanceId: order.kurohostInstanceId,
                jobId,
                osTemplateId: String(osTemplateId),
                message: 'Reinstall submitted — new password will appear automatically when ready',
                raw: apiRes,
              },
            });
          }
        }
      } catch (kurohostErr) {
        console.error(`[SERVICE-ACTION][POST] KuroHost action '${action}' failed:`, kurohostErr.message);
        return actionJson({
          success: false,
          error: kurohostErr.message || 'Server action failed',
        }, kurohostErr.status >= 400 && kurohostErr.status < 600 ? kurohostErr.status : 502, action);
      }
    }

    // -------------------- Netbay branch --------------------
    // Routed FIRST when the order is Netbay-backed: Netbay has its own
    // serviceId per order, so we go straight to its REST API and skip the
    // IP-based VM lookup that the reseller / Virtualizor branches need.
    if (isNetbay) {
      const isNetbayProxy = String(order.netbayProductKind || '').toLowerCase() === 'proxy';
      const supportedActions = isNetbayProxy
        ? new Set(['status', 'sync'])
        : new Set(['start', 'stop', 'restart', 'reboot', 'status', 'sync', 'reinstall', 'rebuild', 'templates']);
      if (!supportedActions.has(action)) {
        return actionJson({
          success: false,
          error: isNetbayProxy
            ? 'Power and OS controls are not available for HTTP proxy. Use Sync to refresh connection details.'
            : `Action '${action}' is not supported for this server.`,
        }, 400, action);
      }

      const { config: netbayCfg, companyName: netbayCompanyName } = await resolveCompanyNetbayApi(order);
      if (!netbayCfg) {
        return actionJson({
          success: false,
          error: 'Server management is not available for this plan. Please contact support.',
        }, 503, action);
      }
      // `templates` is a catalog lookup that doesn't require a service id —
      // every other Netbay action is service-bound.
      if (!order.netbayServiceId && action !== 'templates') {
        return actionJson({
          success: false,
          error: 'This server is still being set up. Please try again in a minute.',
        }, 409, action);
      }

      console.log(`[SERVICE-ACTION][POST] Routing via Netbay API (${netbayCfg.baseUrl}) for action=${action} (company=${netbayCompanyName || 'unknown'}, serviceId=${order.netbayServiceId})`);

      let netbayApi;
      try {
        netbayApi = new NetbayApi(netbayCfg);
      } catch (apiErr) {
        return actionJson({
          success: false,
          error: apiErr.message || 'Server management is temporarily unavailable.',
        }, 500, action);
      }

      try {
        switch (action) {
          case 'start': {
            const apiRes = await netbayApi.start(order.netbayServiceId);
            await Order.findByIdAndUpdate(orderId, {
              lastAction: 'start',
              lastActionTime: new Date(),
            });
            return NextResponse.json({
              success: true,
              result: { success: true, message: 'Start command sent', apiResponse: apiRes, serviceId: order.netbayServiceId },
            });
          }
          case 'stop': {
            const apiRes = await netbayApi.stop(order.netbayServiceId);
            await Order.findByIdAndUpdate(orderId, {
              lastAction: 'stop',
              lastActionTime: new Date(),
            });
            return NextResponse.json({
              success: true,
              result: { success: true, message: 'Stop command sent', apiResponse: apiRes, serviceId: order.netbayServiceId },
            });
          }
          case 'restart':
          case 'reboot': {
            const apiRes = await netbayApi.reboot(order.netbayServiceId);
            await Order.findByIdAndUpdate(orderId, {
              lastAction: 'restart',
              lastActionTime: new Date(),
            });
            return NextResponse.json({
              success: true,
              result: { success: true, message: 'Reboot command sent', apiResponse: apiRes, serviceId: order.netbayServiceId },
            });
          }
          case 'status':
          case 'sync': {
            if (isNetbayProxy) {
              const sync = await syncNetbayOrderFromApi(order);
              if (!sync.ok) {
                return actionJson({
                  success: false,
                  error: sync.error || 'Could not sync proxy from NetBay',
                }, 502, action);
              }
              if (sync.changes.length > 0) {
                await Order.findByIdAndUpdate(orderId, { $set: sync.dbUpdates });
              } else {
                await Order.findByIdAndUpdate(orderId, { $set: { lastSyncTime: sync.dbUpdates.lastSyncTime } });
              }
              const credentialsUpdated = sync.changes.some((c) =>
                ['password', 'username', 'ipAddress'].includes(c)
              );
              const expiryChanged = sync.changes.includes('expiryDate');
              return NextResponse.json({
                success: true,
                provider: 'netbay',
                productKind: 'proxy',
                serviceId: order.netbayServiceId,
                syncResult: {
                  credentialsUpdated,
                  expiryUpdated: expiryChanged,
                  changes: sync.changes,
                  lastSyncTime: sync.dbUpdates.lastSyncTime.toISOString(),
                },
                expiryDate: sync.dbUpdates.expiryDate || order.expiryDate || null,
                lastSync: sync.dbUpdates.lastSyncTime.toISOString(),
              });
            }

            let powerState = 'unknown';
            let rawStatus = null;
            let svc = null;
            let dbUpdates = { lastSyncTime: new Date() };
            let syncChanges = [];
            try {
              const detailRes = await netbayApi.getService(order.netbayServiceId);
              svc = NetbayApi.unwrapServiceResponse(detailRes);
              const resolved = resolveNetbayPowerState(svc, {
                ipAddress: ipAddress || NetbayApi.extractServiceIp(svc),
                checkReachable: isServerReachable,
              });
              powerState = resolved.powerState;
              rawStatus = resolved.rawStatus;

              const applied = applyNetbayServiceToOrderUpdates(svc, order);
              dbUpdates = applied.dbUpdates;
              syncChanges = applied.changes;
            } catch (statusErr) {
              console.warn('[SERVICE-ACTION][POST] Netbay getService failed; falling back to ping:', statusErr.message);
              if (ipAddress) {
                const resolved = resolveNetbayPowerState(null, {
                  ipAddress,
                  checkReachable: isServerReachable,
                });
                powerState = resolved.powerState;
                rawStatus = resolved.rawStatus;
              }
            }
            await Order.findByIdAndUpdate(orderId, dbUpdates);
            const passwordChanged = syncChanges.includes('password');
            const usernameChanged = syncChanges.includes('username');
            const ipChanged = syncChanges.includes('ipAddress');
            const expiryChanged = syncChanges.includes('expiryDate');
            const credentialsUpdated = passwordChanged || usernameChanged || ipChanged;
            return NextResponse.json({
              success: true,
              powerState,
              rawStatus,
              provider: 'netbay',
              serviceId: order.netbayServiceId,
              service: svc || null,
              credentialsUpdated,
              expiryDate: dbUpdates.expiryDate || order.expiryDate || null,
              syncResult: {
                credentialsUpdated,
                expiryUpdated: expiryChanged,
                changes: syncChanges,
                lastSyncTime: dbUpdates.lastSyncTime.toISOString(),
              },
              lastSync: dbUpdates.lastSyncTime.toISOString(),
            });
          }
          case 'templates': {
            const osCategory = payload?.category || body?.category || undefined;
            const osRes = await netbayApi.listOs(osCategory ? { category: osCategory } : {});
            const osList = osRes?.data?.os || osRes?.data || [];
            const flat = {};
            for (const os of (Array.isArray(osList) ? osList : [])) {
              const id = String(os?.id || os?.name || '').trim();
              const name = String(os?.name || id).trim();
              if (!id) continue;
              flat[id] = {
                id,
                name,
                category: os?.category || '',
                storageGb: os?.storageGb,
                label: name,
              };
            }
            return NextResponse.json({
              success: true,
              result: flat,
              raw: osList,
              provider: 'netbay',
            });
          }
          case 'reinstall':
          case 'rebuild': {
            const osPayload = payload?.osName || payload?.os || body?.osName || body?.os ||
              templateId || payload?.templateId || null;
            const apiRes = await netbayApi.rebuild(order.netbayServiceId, osPayload ? { os: String(osPayload) } : {});
            const taskId = apiRes?.data?.taskId || null;

            const update = {
              $set: {
                lastAction: 'reinstall',
                lastActionTime: new Date(),
                provisioningStatus: 'provisioning',
                provisioningError: 'Reinstall in progress — fetching new password…',
              },
            };
            if (osPayload) {
              const osStr = String(osPayload);
              const isWindows = /windows|win\s*server/i.test(osStr);
              update.$set.os = isWindows ? 'Windows 2022 64' : 'Ubuntu 22';
              update.$set.username = isWindows ? 'Administrator' : 'root';
            }
            if (taskId) update.$set.netbayTaskId = taskId;
            await Order.findByIdAndUpdate(orderId, update);

            // Background: poll task + pull auto-generated password from Netbay
            const rebuildOrderId = orderId;
            const rebuildServiceId = order.netbayServiceId;
            void runNetbayPostRebuildFlow({
              api: netbayApi,
              Order,
              orderId: rebuildOrderId,
              serviceId: rebuildServiceId,
              taskId,
            }).catch((bgErr) => {
              console.error('[SERVICE-ACTION][POST] Netbay post-rebuild flow failed:', bgErr.message);
            });

            return NextResponse.json({
              success: true,
              result: {
                accepted: true,
                serviceId: order.netbayServiceId,
                taskId,
                os: osPayload || null,
                message: 'Rebuild submitted — new password will appear automatically when ready',
                raw: apiRes,
              },
            });
          }
        }
      } catch (netbayErr) {
        console.error(`[SERVICE-ACTION][POST] Netbay action '${action}' failed:`, netbayErr.message);
        const facing = toUserFacingNetbayError(netbayErr);
        return actionJson({
          success: false,
          error: facing.message,
          message: facing.message,
          code: facing.code,
          nextAvailableAt: facing.nextAvailableAt || undefined,
        }, facing.status || 500, action);
      }
    }

    // -------------------- Joy Services branch --------------------
    // Manage-only provider: no per-order service id — we match the order's IP
    // against Joy's machine_list to get the `ihash`, then drive power actions
    // via change_machine_state. Only reachable when the linked company has Joy
    // automation configured. Reinstall/OS is not offered by the Joy connect API.
    if (!isSmartVps && !isNetbay && !order.hostycareServiceId) {
      const { config: joyCfg, companyName: joyCompanyName } = await resolveCompanyJoyApi(order);
      if (joyCfg) {
        const supportedActions = new Set(['start', 'stop', 'restart', 'reboot', 'status', 'sync']);
        if (!supportedActions.has(action)) {
          return actionJson({
            success: false,
            error: `Action '${action}' is not available for this server.`,
          }, 400, action);
        }
        if (!ipAddress) {
          return actionJson({
            success: false,
            error: 'This server is still being set up. Please try again shortly.',
          }, 409, action);
        }

        console.log(`[SERVICE-ACTION][POST] Routing via Joy API (${joyCfg.baseUrl}) for action=${action} (company=${joyCompanyName || 'unknown'}, ip=${ipAddress})`);

        let joyApi;
        try {
          joyApi = new JoyApi(joyCfg);
        } catch (apiErr) {
          return actionJson({
            success: false,
            error: apiErr.message || 'Server management is temporarily unavailable.',
          }, 500, action);
        }

        try {
          const machine = await joyApi.findMachineByIp(ipAddress);
          if (!machine?.ihash) {
            return actionJson({
              success: false,
              error: 'Server details could not be found. Please contact support.',
            }, 404, action);
          }
          const ihash = machine.ihash;

          switch (action) {
            case 'start': {
              const apiRes = await joyApi.changeMachineState(ihash, 'start');
              await Order.findByIdAndUpdate(orderId, { lastAction: 'start', lastActionTime: new Date() });
              return NextResponse.json({ success: true, powerState: 'running', result: { success: true, message: 'Start command sent', apiResponse: apiRes } });
            }
            case 'stop': {
              const apiRes = await joyApi.changeMachineState(ihash, 'shutdown');
              await Order.findByIdAndUpdate(orderId, { lastAction: 'stop', lastActionTime: new Date() });
              return NextResponse.json({ success: true, powerState: 'stopped', result: { success: true, message: 'Stop command sent', apiResponse: apiRes } });
            }
            case 'restart':
            case 'reboot': {
              const apiRes = await joyApi.changeMachineState(ihash, 'reboot');
              await Order.findByIdAndUpdate(orderId, { lastAction: 'restart', lastActionTime: new Date() });
              return NextResponse.json({ success: true, result: { success: true, message: 'Reboot command sent', apiResponse: apiRes } });
            }
            case 'status':
            case 'sync': {
              let powerState = 'unknown';
              let info = null;
              try {
                info = await joyApi.machineInfo(ihash);
                powerState = resolveJoyPowerState(info);
              } catch (infoErr) {
                console.warn('[SERVICE-ACTION][POST] Joy machine_info failed; falling back to ping:', infoErr.message);
                if (ipAddress) powerState = isServerReachable(ipAddress) ? 'running' : 'stopped';
              }
              const applied = applyJoyMachineToOrderUpdates(machine, info, order);
              const dbUpdates = applied.dbUpdates;
              await Order.findByIdAndUpdate(orderId, dbUpdates);
              const expiryUpdated = applied.changes.includes('expiryDate');
              return NextResponse.json({
                success: true,
                powerState,
                provider: 'joy',
                serviceId: ihash,
                details: info || null,
                expiryDate: dbUpdates.expiryDate || order.expiryDate || null,
                syncResult: {
                  credentialsUpdated: false,
                  expiryUpdated,
                  changes: applied.changes,
                  lastSyncTime: dbUpdates.lastSyncTime.toISOString(),
                },
                lastSync: dbUpdates.lastSyncTime.toISOString(),
              });
            }
          }
        } catch (joyErr) {
          console.error(`[SERVICE-ACTION][POST] Joy action '${action}' failed:`, joyErr.message);
          return actionJson({
            success: false,
            error: joyErr.message || 'Joy action failed',
            code: joyErr.code || undefined,
          }, typeof joyErr.status === 'number' ? joyErr.status : 500, action);
        }
      }
    }

    // Any non-SmartVPS, non-Netbay order that doesn't have an active Hostycare
    // service ID attached is eligible for company-Virtualizor automation. This
    // covers both pure OceanLinux orders and partially-configured ones whose
    // `provider` was stamped as 'hostycare' or similar but never received a
    // serviceId — those would otherwise fall through to the Hostycare branch
    // and fail with "No valid API configured".
    if (!isSmartVps && !isNetbay && !order.hostycareServiceId) {
      // ---- Company Reseller-API automation (Hostheaven / SomaniOne) ----
      // Tried BEFORE Virtualizor only when there are zero Virtualizor panels
      // configured — that way an admin can swap a company over from one
      // automation type to the other simply by clearing the Virtualizor list
      // and saving the reseller config.
      const { accounts: virtPeek } = await resolveCompanyVirtualizorAccounts(order);
      if (virtPeek.length === 0) {
        const { config: resellerCfg, companyName: resellerCompanyName } = await resolveCompanyResellerApi(order);
        if (resellerCfg) {
          const supportedActions = new Set(['start', 'stop', 'restart', 'reboot', 'status', 'sync', 'templates', 'reinstall', 'resetmac', 'changepassword', 'reconfigure-network']);
          if (!supportedActions.has(action)) {
            return actionJson({
              success: false,
              error: `Action '${action}' is not supported for this server.`,
            }, 400, action);
          }

          console.log(`[SERVICE-ACTION][POST] Using reseller API automation (${resellerCfg.baseUrl}) for action=${action} (company=${resellerCompanyName || 'unknown'}, ip=${ipAddress})`);

          let resellerApi;
          try {
            resellerApi = new ResellerApi(resellerCfg);
          } catch (apiErr) {
            return actionJson({
              success: false,
              error: apiErr.message || 'Server panel configuration is invalid.',
            }, 500, action);
          }

          const findVm = async () => resolveResellerVmForOrder(resellerApi, order);

          try {
            switch (action) {
              case 'start': {
                const { vmId } = await findVm();
                const apiRes = await resellerApi.start(vmId);
                resellerApi.invalidateVmIpCache(ipAddress);
                await Order.findByIdAndUpdate(orderId, {
                  lastAction: 'start',
                  lastActionTime: new Date(),
                  $push: {
                    logs: {
                      action: 'start',
                      timestamp: new Date(),
                      details: `Start sent via reseller API (vmId=${vmId})`,
                      success: true,
                    },
                  },
                });
                return NextResponse.json({
                  success: true,
                  result: { success: true, message: 'Start command sent successfully', apiResponse: apiRes, vmId },
                });
              }
              case 'stop': {
                const { vmId } = await findVm();
                const apiRes = await resellerApi.stop(vmId);
                resellerApi.invalidateVmIpCache(ipAddress);
                await Order.findByIdAndUpdate(orderId, {
                  lastAction: 'stop',
                  lastActionTime: new Date(),
                  $push: {
                    logs: {
                      action: 'stop',
                      timestamp: new Date(),
                      details: `Stop sent via reseller API (vmId=${vmId}${apiRes?.task_id ? `, task=${apiRes.task_id}` : ''})`,
                      success: true,
                    },
                  },
                });
                return NextResponse.json({
                  success: true,
                  result: {
                    success: true,
                    message: apiRes?.message || 'Stop command sent successfully',
                    taskId: apiRes?.task_id || null,
                    apiResponse: apiRes,
                    vmId,
                  },
                });
              }
              case 'restart':
              case 'reboot': {
                const { vmId } = await findVm();
                const apiRes = await resellerApi.restart(vmId);
                resellerApi.invalidateVmIpCache(ipAddress);
                await Order.findByIdAndUpdate(orderId, {
                  lastAction: 'restart',
                  lastActionTime: new Date(),
                  $push: {
                    logs: {
                      action: 'restart',
                      timestamp: new Date(),
                      details: `Reboot sent via reseller API (vmId=${vmId})`,
                      success: true,
                    },
                  },
                });
                return NextResponse.json({
                  success: true,
                  result: { success: true, message: 'Restart command sent successfully', apiResponse: apiRes, vmId },
                });
              }
              case 'status':
              case 'sync': {
                const found = await findVm();
                const { powerState, rawStatus, source } = await resellerApi.resolveVmPowerState(
                  found.vmId,
                  { overviewRaw: found.raw }
                );
                const synced = await applyResellerPanelSync(resellerApi, order, orderId, found.vmId);
                return NextResponse.json({
                  success: true,
                  powerState,
                  rawStatus,
                  powerSource: source,
                  provider: 'reseller-api',
                  vmId: found.vmId,
                  syncResult: {
                    credentialsUpdated: synced.changes.length > 0,
                    changes: synced.changes,
                    lastSyncTime: new Date().toISOString(),
                  },
                  lastSync: new Date().toISOString(),
                });
              }
              case 'templates': {
                const { vmId } = await findVm();
                const { isos, zoneId } = await resellerApi.getVmIsos(vmId);
                const flat = flattenResellerIsos(isos);
                return NextResponse.json({
                  success: true,
                  result: flat,
                  vmId,
                  zoneId,
                  raw: isos,
                });
              }
              case 'reinstall': {
                const chosenIsoId = templateId ?? payload?.templateId ?? payload?.isoId ?? body.isoId;
                if (!chosenIsoId) {
                  return actionJson({ success: false, error: 'Please select an operating system.' }, 400, 'reinstall');
                }
                const { vmId } = await findVm();

                // Fetch ISO catalog up-front so we can sync the order's
                // `os` / `username` to the chosen ISO (Linux ⇄ Windows).
                let chosenIso = null;
                try {
                  const { isos } = await resellerApi.getVmIsos(vmId);
                  chosenIso = (isos || []).find(i => String(i?.id) === String(chosenIsoId)) || null;
                } catch (isoErr) {
                  console.warn('[SERVICE-ACTION][POST] Pre-rebuild ISO lookup failed:', isoErr.message);
                }
                const cls = classifyResellerIso(chosenIso);

                // Capture the pre-rebuild password so the background watcher can
                // tell when Hostheaven has rotated it to the new value.
                let previousPassword = order.password || null;
                try {
                  const beforePass = await resellerApi.getVmPassword(vmId);
                  if (beforePass) previousPassword = beforePass;
                } catch (_) { /* non-fatal — fall back to stored password */ }

                const apiRes = await resellerApi.rebuild(vmId, chosenIsoId);

                // Hostheaven assigns a brand-new password during the rebuild —
                // poll for it in the background and persist once it changes.
                watchResellerPasswordAfterReinstall(resellerApi, orderId, vmId, previousPassword);

                const update = {
                  $set: {
                    lastAction: 'reinstall',
                    lastActionTime: new Date(),
                  },
                  $push: {
                    logs: {
                      action: 'reinstall',
                      timestamp: new Date(),
                      details: `Rebuild via reseller API (vmId=${vmId}, isoId=${chosenIsoId}${cls.osLabel ? `, os=${cls.osLabel}` : ''})`,
                      success: true,
                    },
                  },
                };
                if (cls.osLabel) update.$set.os = cls.osLabel;
                if (cls.username) update.$set.username = cls.username;
                await Order.findByIdAndUpdate(orderId, update);

                return NextResponse.json({
                  success: true,
                  result: {
                    accepted: true,
                    vmId,
                    isoId: chosenIsoId,
                    message: 'Rebuild submitted. New password will appear shortly (auto-synced).',
                    newOs: cls.osLabel || null,
                    newUsername: cls.username || null,
                    osFamily: cls.family || null,
                    passwordRefreshing: true,
                    raw: apiRes,
                  },
                });
              }
              case 'resetmac': {
                const { vmId } = await findVm();
                const apiRes = await resellerApi.regenerateMac(vmId);
                const newMac = apiRes?.newMac || apiRes?.mac || null;
                await Order.findByIdAndUpdate(orderId, {
                  lastAction: 'resetmac',
                  lastActionTime: new Date(),
                  $push: {
                    logs: {
                      action: 'resetmac',
                      timestamp: new Date(),
                      details: `MAC regenerated via reseller API (vmId=${vmId}${newMac ? `, newMac=${newMac}` : ''})`,
                      success: true,
                    },
                  },
                });
                return NextResponse.json({
                  success: true,
                  result: {
                    success: true,
                    message: apiRes?.message || 'MAC address regenerated successfully',
                    newMacAddress: newMac,
                    vmId,
                    apiResponse: apiRes,
                  },
                });
              }
              case 'changepassword': {
                const newPass = newPassword ?? payload?.password ?? body.password;
                if (!newPass || String(newPass).length < 8) {
                  return NextResponse.json({
                    success: false,
                    error: 'password is required (minimum 8 characters)',
                  }, { status: 400 });
                }
                const { vmId } = await findVm();
                const apiRes = await resellerApi.changePassword(vmId, newPass);
                await Order.findByIdAndUpdate(orderId, {
                  password: newPass,
                  lastAction: 'changepassword',
                  lastActionTime: new Date(),
                  $push: {
                    logs: {
                      action: 'changepassword',
                      timestamp: new Date(),
                      details: `Password changed via reseller API (vmId=${vmId})`,
                      success: true,
                    },
                  },
                });
                return NextResponse.json({
                  success: true,
                  result: {
                    success: true,
                    message: apiRes?.message || 'Password updated on VM',
                    password: newPass,
                    vmId,
                    apiResponse: apiRes,
                  },
                });
              }
              case 'reconfigure-network': {
                const { vmId } = await findVm();
                const apiRes = await resellerApi.reconfigureNetwork(vmId);
                await Order.findByIdAndUpdate(orderId, {
                  lastAction: 'reconfigure-network',
                  lastActionTime: new Date(),
                });
                return NextResponse.json({
                  success: true,
                  result: {
                    success: true,
                    message: apiRes?.message || 'Network reconfiguration initiated',
                    vmId,
                    apiResponse: apiRes,
                  },
                });
              }
            }
          } catch (resellerErr) {
            console.error(`[SERVICE-ACTION][POST] Reseller-API action '${action}' failed:`, resellerErr.message);
            const status = typeof resellerErr.status === 'number' ? resellerErr.status : 500;
            return actionJson({
              success: false,
              error: resellerErr.message || 'Reseller API action failed',
            }, status, action);
          }
        }
      }

      const { accounts: companyVirtAccounts } = await resolveCompanyVirtualizorAccounts(order);
      if (companyVirtAccounts.length > 0) {
        const supportedActions = new Set(['start', 'stop', 'restart', 'status', 'sync', 'templates', 'reinstall']);
        if (!supportedActions.has(action)) {
          return actionJson({
            success: false,
            error: `Action '${action}' is not supported for this server.`,
          }, 400, action);
        }

        console.log(`[SERVICE-ACTION][POST] Using ${companyVirtAccounts.length} company Virtualizor panel(s) for action=${action} (order.provider=${order.provider || 'unset'}, no hostycareServiceId)`);

        let companyApi;
        try {
          companyApi = new VirtualizorAPI({ accounts: toVirtualizorApiAccounts(companyVirtAccounts) });
        } catch (apiErr) {
          return actionJson({
            success: false,
            error: apiErr.message || 'Server panel configuration is invalid.',
          }, 500, action);
        }

        const hostname = guessHostnameFromOrder(order);
        const panelHostsLabel = companyVirtAccounts.map(a => a.host).join(', ');
        const findVps = async () => {
          const found = await companyApi.findVpsId({ ip: ipAddress, hostname });
          if (!found) {
            const message = `No VPS visible for IP ${ipAddress} on any of the company's Virtualizor panels (${panelHostsLabel}).`;
            const err = new Error(message);
            err.status = 404;
            throw err;
          }
          return typeof found === 'object' ? found : { vpsid: String(found), virt: null };
        };

        try {
          let result;
          switch (action) {
            case 'start': {
              const { vpsid } = await findVps();
              const apiRes = await companyApi.start(vpsid);
              result = { success: true, message: 'Start command sent successfully', apiResponse: apiRes };
              break;
            }
            case 'stop': {
              const { vpsid } = await findVps();
              const apiRes = await companyApi.stop(vpsid);
              result = { success: true, message: 'Stop command sent successfully', apiResponse: apiRes };
              break;
            }
            case 'restart': {
              const { vpsid } = await findVps();
              const apiRes = await companyApi.restart(vpsid);
              result = { success: true, message: 'Restart command sent successfully', apiResponse: apiRes };
              break;
            }
            case 'status':
            case 'sync': {
              const { vpsid } = await findVps();
              const { powerState, rawStatus, source } = await companyApi.resolveVpsPowerState(vpsid);
              await Order.findByIdAndUpdate(orderId, { lastSyncTime: new Date() });
              return NextResponse.json({
                success: true,
                powerState,
                rawStatus,
                powerSource: source,
                provider: 'virtualizor',
                lastSync: new Date().toISOString(),
              });
            }
            case 'templates': {
              const { vpsid, virt } = await findVps();
              const tplRaw = await companyApi.getTemplates(vpsid);
              const vpsVirt = virt || tplRaw?.virt || tplRaw?.info?.virt || tplRaw?.vs?.virt || null;
              const oslistData = tplRaw?.oslist || tplRaw?.os || tplRaw;
              const flat = flattenOslist(oslistData, vpsVirt);
              return NextResponse.json({ success: true, result: flat, vpsId: vpsid, raw: tplRaw });
            }
            case 'reinstall': {
              const chosenTemplateId = templateId ?? payload?.templateId;
              const providedPwd = newPassword ?? payload?.password;
              if (!chosenTemplateId) {
                return actionJson({ success: false, error: 'Please select an operating system.' }, 400, 'reinstall');
              }
              const { vpsid } = await findVps();
              const pwd = providedPwd || generateSecurePassword();

              // Look up the friendly name + family for the chosen template
              // BEFORE we trigger the reinstall, so we can sync the order's
              // displayed OS / username to whatever the user actually picked
              // (handles Linux ⇄ Windows transitions, etc).
              let tplMeta = null;
              try {
                const tplRaw = await companyApi.getTemplates(vpsid);
                const oslistData = tplRaw?.oslist || tplRaw?.os || tplRaw;
                tplMeta = findTemplateMeta(oslistData, chosenTemplateId);
              } catch (tplErr) {
                console.warn('[SERVICE-ACTION][POST] Pre-reinstall template metadata lookup failed:', tplErr.message);
              }
              const osClass = classifyOsFamily(tplMeta);

              const apiRes = await companyApi.reinstall(vpsid, chosenTemplateId, pwd);

              const update = {
                $set: {
                  password: pwd,
                  lastAction: 'reinstall',
                  lastActionTime: new Date(),
                },
                $push: {
                  logs: {
                    action: 'reinstall',
                    timestamp: new Date(),
                    details: `Reinstall via company Virtualizor (panels: ${panelHostsLabel}, osid: ${chosenTemplateId}${tplMeta?.name ? `, os: ${tplMeta.name}` : ''})`,
                    success: true,
                  },
                },
              };
              // Sync the human-readable OS name on the order so the dashboard
              // (icon + label) reflects what's actually running now.
              if (tplMeta?.name) {
                update.$set.os = tplMeta.name;
              }
              // Sync the login user when we can confidently identify the
              // family — Windows uses Administrator, Linux uses root. We
              // intentionally skip the field when classification is ambiguous
              // so we don't clobber a manually-set value.
              if (osClass.username) {
                update.$set.username = osClass.username;
              }

              await Order.findByIdAndUpdate(orderId, update);

              return NextResponse.json({
                success: true,
                result: {
                  accepted: true,
                  vpsId: vpsid,
                  templateId: chosenTemplateId,
                  message: 'Reinstall submitted successfully',
                  newPassword: pwd,
                  newOs: tplMeta?.name || null,
                  newUsername: osClass.username || null,
                  osFamily: osClass.family || null,
                  raw: apiRes,
                },
              });
            }
          }

          await Order.findByIdAndUpdate(orderId, {
            lastAction: action,
            lastActionTime: new Date(),
            $push: {
              logs: {
                action,
                timestamp: new Date(),
                details: result?.message || `Action ${action} via company Virtualizor`,
                success: result?.success !== false,
              },
            },
          });

          return NextResponse.json({ success: true, result });
        } catch (virtErr) {
          console.error(`[SERVICE-ACTION][POST] Company-Virtualizor action '${action}' failed:`, virtErr.message);
          const status = typeof virtErr.status === 'number' ? virtErr.status : 500;
          return actionJson({
            success: false,
            error: virtErr.message || 'Virtualizor action failed',
          }, status, action);
        }
      }
    }

    if (isSmartVps) {
      smartvpsApi = new SmartVpsAPI();
      console.log('[SERVICE-ACTION][POST] Using SmartVPS API');
    } else if (hasHostycareService || order.provider === 'hostycare' || !order.provider) {
      hostycareApi = new HostycareAPI();
      console.log('[SERVICE-ACTION][POST] Using Hostycare API', hasHostycareService ? `(serviceId=${order.hostycareServiceId})` : '(no serviceId yet)');

      // Virtualizor is only for reinstall/templates on Hostycare orders — power uses Hostycare API
      if (action === 'reinstall' || action === 'templates') {
        virtualizorApi = await buildMergedVirtualizorApi(order);
      }
    }

    switch (action) {
      case 'start':
        console.log('[START] Starting VPS service');
        if (smartvpsApi) {
          console.log('[START] Using SmartVPS API with IP:', ipAddress);
          const apiRes = await smartvpsApi.start(ipAddress);
          result = {
            success: true,
            message: 'Start command sent successfully',
            apiResponse: apiRes
          };
        } else if (hostycareApi && order.hostycareServiceId) {
          console.log('[START] Using Hostycare API with service ID:', order.hostycareServiceId);
          const apiRes = await hostycareApi.startService(order.hostycareServiceId);
          result = {
            success: true,
            message: 'VPS start command sent successfully',
            apiResponse: apiRes
          };
        } else {
          throw new Error(
            order.hostycareServiceId
              ? 'Server management is not configured for this order. Please contact support.'
              : 'Server management is not available for this order. Please contact support.'
          );
        }
        break;

      case 'stop':
        console.log('[STOP] Stopping VPS service');
        if (smartvpsApi) {
          console.log('[STOP] Using SmartVPS API with IP:', ipAddress);
          const apiRes = await smartvpsApi.stop(ipAddress);
          result = {
            success: true,
            message: 'Stop command sent successfully',
            apiResponse: apiRes
          };
        } else if (hostycareApi && order.hostycareServiceId) {
          console.log('[STOP] Using Hostycare API with service ID:', order.hostycareServiceId);
          const apiRes = await hostycareApi.stopService(order.hostycareServiceId);
          result = {
            success: true,
            message: 'VPS stop command sent successfully',
            apiResponse: apiRes
          };
        } else {
          throw new Error(
            order.hostycareServiceId
              ? 'Server management is not configured for this order. Please contact support.'
              : 'Server management is not available for this order. Please contact support.'
          );
        }
        break;

      case 'restart':
        console.log('[RESTART] Restarting VPS service');
        if (smartvpsApi) {
          console.log('[RESTART] Using SmartVPS API - stop, wait for offline, then start');
          const { executeSmartVpsRestart } = require('@/lib/smartvpsPowerActions');
          const apiRes = await executeSmartVpsRestart(smartvpsApi, ipAddress);
          result = {
            success: true,
            message: apiRes.message || 'Restart completed successfully',
            apiResponse: apiRes
          };
        } else if (hostycareApi && order.hostycareServiceId) {
          console.log('[RESTART] Using Hostycare API with service ID:', order.hostycareServiceId);
          const apiRes = await hostycareApi.rebootService(order.hostycareServiceId);
          result = {
            success: true,
            message: 'VPS restart command sent successfully',
            apiResponse: apiRes
          };
        } else {
          throw new Error(
            order.hostycareServiceId
              ? 'Server management is not configured for this order. Please contact support.'
              : 'Server management is not available for this order. Please contact support.'
          );
        }
        break;

      case 'status':
        console.log('[STATUS] Fetching VPS power status');
        if (smartvpsApi) {
          console.log('[STATUS] Using SmartVPS API with IP:', ipAddress);
          try {
            const apiRes = await smartvpsApi.status(ipAddress);
            console.log('[STATUS] SmartVPS response:', JSON.stringify(apiRes, null, 2));

            // SmartVPS returns: { PowerStatus: "Online", MachineStatus: "active", Password: "...", Usernane: "...", OS: "...", ... }
            let powerState = 'unknown';
            const statusVal = apiRes?.PowerStatus || apiRes?.powerStatus || apiRes?.MachineStatus ||
              apiRes?.status || apiRes?.state || apiRes?.power;

            if (statusVal) {
              const sl = String(statusVal).toLowerCase().trim();
              if (['online', 'running', 'active', 'started', 'on', '1'].includes(sl)) powerState = 'running';
              else if (['offline', 'stopped', 'inactive', 'off', '0', 'shutdown'].includes(sl)) powerState = 'stopped';
              else if (['suspended', 'paused'].includes(sl)) powerState = 'suspended';
              else powerState = sl;
            }

            console.log('[STATUS] SmartVPS power state:', powerState);
            
            return NextResponse.json({
              success: true,
              powerState,
              rawStatus: apiRes,
              provider: 'smartvps',
              lastSync: new Date().toISOString()
            });
          } catch (statusError) {
            console.error('[STATUS] SmartVPS error:', statusError);
            return actionJson({
              success: false,
              error: statusError.message,
              powerState: 'unknown',
              provider: 'smartvps',
            }, 200, 'status');
          }
        } else if (hostycareApi && order.hostycareServiceId) {
          console.log('[STATUS] Using Hostycare API with service ID:', order.hostycareServiceId);
          try {
            let serviceInfo = null;
            let serviceDetails = null;

            // Try the real API methods first (work in production where IP is whitelisted)
            try {
              serviceInfo = await hostycareApi.getServiceInfo(order.hostycareServiceId);
              console.log('[STATUS] Service Info:', JSON.stringify(serviceInfo, null, 2));
            } catch (infoErr) {
              console.warn('[STATUS] getServiceInfo failed (non-fatal):', infoErr.message);
            }

            try {
              serviceDetails = await hostycareApi.getServiceDetails(order.hostycareServiceId);
              console.log('[STATUS] Service Details:', JSON.stringify(serviceDetails, null, 2));
            } catch (detailsErr) {
              console.warn('[STATUS] getServiceDetails failed (non-fatal):', detailsErr.message);
            }

            let powerState = 'unknown';
            let rawStatus = null;

            const extractStatus = (obj) => {
              if (!obj) return null;
              const direct = obj.domainstatus || obj.domainStatus || obj.status || obj.state || obj.power_status || obj.vps_status;
              if (direct) return direct;
              for (const key of ['data', 'result', 'vps', 'server', 'service']) {
                if (obj[key]) {
                  const nested = obj[key].domainstatus || obj[key].domainStatus || obj[key].status || obj[key].state || obj[key].power_status || obj[key].power;
                  if (nested) return nested;
                }
              }
              return null;
            };

            if (serviceInfo || serviceDetails) {
              rawStatus = extractStatus(serviceInfo) || extractStatus(serviceDetails);
            }

            console.log('[STATUS] Extracted rawStatus:', rawStatus);

            if (rawStatus) {
              const statusLower = String(rawStatus).toLowerCase().trim();
              if (['online', 'running', 'active', 'started', 'on', '1', 'true'].includes(statusLower)) {
                powerState = 'running';
              } else if (['offline', 'stopped', 'inactive', 'off', '0', 'false', 'shutdown', 'terminated', 'down'].includes(statusLower)) {
                powerState = 'stopped';
              } else if (['suspended', 'paused', 'cancelled'].includes(statusLower)) {
                powerState = 'suspended';
              } else if (['installing', 'provisioning', 'building', 'creating', 'starting', 'stopping', 'rebooting'].includes(statusLower)) {
                powerState = 'busy';
              } else {
                powerState = statusLower;
              }
            } else if (ipAddress) {
              const cleanIp = ipAddress.split(':')[0];
              console.log(`[STATUS] Hostycare API returned no status, pinging ${cleanIp}...`);
              const isReachable = isServerReachable(ipAddress);
              powerState = isReachable ? 'running' : 'stopped';
              console.log(`[STATUS] Ping result: ${cleanIp} is ${isReachable ? 'reachable → running' : 'unreachable → stopped'}`);
            }

            try {
              await syncServerState(order._id, serviceDetails, serviceInfo);
            } catch (syncErr) {
              console.warn('[STATUS] syncServerState failed (non-fatal):', syncErr.message);
            }

            console.log('[STATUS] Returning power state:', powerState);

            return NextResponse.json({
              success: true,
              powerState: powerState,
              rawStatus: rawStatus,
              serviceInfo: serviceInfo,
              serviceDetails: serviceDetails,
              lastSync: new Date().toISOString()
            });
          } catch (statusError) {
            console.error('[STATUS] Error fetching status:', statusError);
            let fallbackState = 'stopped';
            if (ipAddress) {
              const isReachable = isServerReachable(ipAddress);
              fallbackState = isReachable ? 'running' : 'stopped';
              console.log(`[STATUS] Fallback ping ${ipAddress.split(':')[0]}: ${isReachable ? 'online' : 'offline'}`);
            }
            return actionJson({
              success: true,
              error: statusError.message,
              powerState: fallbackState
            }, 200, 'status');
          }
        } else {
          return actionJson({
            success: false,
            error: 'Server management is not available for this order.',
            powerState: 'unknown'
          }, 400, 'status');
        }
        break;

      case 'format':
        console.log('[FORMAT] Formatting VPS');
        if (smartvpsApi) {
          console.log('[FORMAT] Using SmartVPS API with IP:', ipAddress);
          const apiRes = await smartvpsApi.format(ipAddress);

          // Save new password from format response
          const formatUpdate = { lastAction: 'format', lastActionTime: new Date() };
          const formatPass = apiRes?.Password || apiRes?.password || apiRes?.rootPassword || apiRes?.root_password || apiRes?.pass;
          if (formatPass) formatUpdate.password = formatPass;
          await Order.findByIdAndUpdate(orderId, { $set: formatUpdate });

          result = {
            success: true,
            message: 'Format command sent successfully',
            apiResponse: apiRes,
            ...(formatPass ? { newPassword: formatPass } : {}),
          };
        } else {
          throw new Error('Format action is only available for SmartVPS orders');
        }
        break;

      case 'changeos':
        console.log('[CHANGEOS] Changing OS');
        if (smartvpsApi) {
          const osType = body.osType || body.os || payload?.os;
          if (!osType) {
            throw new Error('OS type is required for changeOS action');
          }
          console.log('[CHANGEOS] Using SmartVPS API with IP:', ipAddress, 'OS:', osType);
          const apiRes = await smartvpsApi.changeOS(ipAddress, osType);
          result = {
            success: true,
            message: 'OS change started successfully',
            apiResponse: apiRes
          };
        } else {
          throw new Error('changeOS action is only available for SmartVPS orders');
        }
        break;

      case 'sync':
        console.log('[SYNC] Syncing VPS status');
        if (smartvpsApi) {
          console.log('[SYNC] Using SmartVPS API with IP:', ipAddress);
          try {
            const apiRes = await smartvpsApi.status(ipAddress);
            console.log('[SYNC] SmartVPS status response:', JSON.stringify(apiRes, null, 2));
            
            // Extract credentials and status from SmartVPS response
            // SmartVPS returns: { Password: "...", Usernane: "..." (typo), OS: "...", PowerStatus: "Online", ... }
            const updateFields = { lastSyncTime: new Date() };
            let credentialsUpdated = false;

            const newPass = apiRes?.Password || apiRes?.password || apiRes?.rootPassword;
            const newUser = apiRes?.Usernane || apiRes?.Username || apiRes?.username;
            const newOs = apiRes?.OS || apiRes?.os;
            const newIp = apiRes?.IP || apiRes?.ip;

            if (newPass) { updateFields.password = newPass; credentialsUpdated = true; }
            if (newUser) { updateFields.username = newUser; credentialsUpdated = true; }
            if (newOs) updateFields.os = newOs;
            if (newIp && !order.ipAddress) updateFields.ipAddress = newIp;

            console.log('[SYNC] SmartVPS credentials update:', { password: newPass ? '***' : '(none)', username: newUser || '(none)', os: newOs || '(none)', credentialsUpdated });

            await Order.findByIdAndUpdate(orderId, { $set: updateFields });

            // Parse power state
            const statusVal = apiRes?.PowerStatus || apiRes?.MachineStatus || apiRes?.status;
            let powerState = 'unknown';
            if (statusVal) {
              const sl = String(statusVal).toLowerCase().trim();
              if (['online', 'running', 'active'].includes(sl)) powerState = 'running';
              else if (['offline', 'stopped', 'inactive'].includes(sl)) powerState = 'stopped';
              else powerState = sl;
            }

            const freshOrder = await Order.findById(orderId).select('ipAddress username password os provisioningStatus status lastSyncTime').lean();

            result = {
              success: true,
              message: 'Server status synced successfully',
              credentialsUpdated,
              powerState,
              provider: 'smartvps',
              order: freshOrder,
            };
          } catch (syncError) {
            console.error('[SYNC] SmartVPS sync error:', syncError);
            result = {
              success: false,
              message: customerServiceErrorMessage(syncError.message, { action: 'sync' }),
              error: syncError.message,
            };
          }
        } else if (hostycareApi && order.hostycareServiceId) {
          // Use existing status logic for hostycare sync
          try {
            const serviceInfo = await hostycareApi.getServiceInfo(order.hostycareServiceId);
            const serviceDetails = await hostycareApi.getServiceDetails(order.hostycareServiceId);
            await syncServerState(order._id, serviceDetails, serviceInfo);
            result = {
              success: true,
              message: 'Hostycare status synced successfully',
              serviceInfo,
              serviceDetails
            };
          } catch (syncError) {
            result = {
              success: false,
              message: `Sync failed: ${syncError.message}`
            };
          }
        } else {
          throw new Error('No valid API configured for sync');
        }
        break;

      // In the reinstall case, update to match PHP SDK approach:

      // -------------------- REINSTALL via Virtualizor --------------------
      case 'reinstall': {
        console.log(`[SERVICE-ACTION][POST] ========== REINSTALL OPERATION ==========`);

        if (!virtualizorApi) {
          console.error(`[SERVICE-ACTION][POST] VirtualizorAPI not available for reinstall`);
          return actionJson({ success: false, error: 'Reinstall is not available for this server.' }, 400, 'reinstall');
        }

        // 🔁 Use values from the one parsed body
        const chosenTemplateId = templateId ?? payload?.templateId;
        const providedPwd = newPassword ?? payload?.password;

        console.log(`[SERVICE-ACTION][POST] Template ID: ${chosenTemplateId}`);
        console.log(`[SERVICE-ACTION][POST] Password provided: ${providedPwd ? 'Yes' : 'No (will generate)'}`);

        if (!chosenTemplateId) {
          console.error(`[SERVICE-ACTION][POST] Template ID is required for reinstall`);
          return actionJson({ success: false, error: 'Please select an operating system.' }, 400, 'reinstall');
        }

        try {
          console.log(`[SERVICE-ACTION][POST] Step 1: Finding VPS by IP...`);
          const hostname = guessHostnameFromOrder(order);
          console.log(`[SERVICE-ACTION][POST] Order hostname: ${hostname || 'Not found'}`);

          const vpsResult = await virtualizorApi.findVpsId({ ip: ipAddress, hostname });

          if (!vpsResult) {
            console.error(`[SERVICE-ACTION][POST] No VPS found for IP ${ipAddress}`);
            return actionJson({
              success: false,
              error: 'Server details could not be found. Please contact support.',
              code: 'VIRTUALIZOR_VPS_NOT_FOUND',
            }, 404, 'reinstall');
          }

          const vpsid = typeof vpsResult === 'object' ? vpsResult.vpsid : vpsResult;
          console.log(`[SERVICE-ACTION][POST] Step 2: VPS found with ID: ${vpsid}`);

          const pwd = providedPwd || generateSecurePassword();
          console.log(`[SERVICE-ACTION][POST] Step 3: Starting reinstall operation...`);

          const startTime = Date.now();
          const apiRes = await virtualizorApi.reinstall(vpsid, chosenTemplateId, pwd);
          const duration = Date.now() - startTime;

          console.log(`[SERVICE-ACTION][POST] Step 4: Reinstall operation completed in ${duration}ms`);
          console.log(`[SERVICE-ACTION][POST] API Response keys:`, Object.keys(apiRes || {}));

          // Format IP address with port if needed (Windows Hostycare requires :49965)
          const { formatIpAddress } = await import('@/lib/ipAddressHelper.js');
          const currentIp = order.ipAddress || ipAddress;
          const formattedIpAddress = formatIpAddress(
            currentIp,
            order.provider || 'hostycare',
            order.os
          );

          // Update order with new password, formatted IP, and log
          await Order.findByIdAndUpdate(orderId, {
            $set: {
              password: pwd,
              ipAddress: formattedIpAddress,  // Ensure port is added if missing
              lastAction: 'reinstall',
              lastActionTime: new Date()
            },
            $push: {
              logs: {
                action: 'reinstall',
                timestamp: new Date(),
                details: `Reinstall submitted (osid: ${chosenTemplateId}, duration: ${duration}ms)`,
                success: true
              }
            }
          });

          console.log(`[SERVICE-ACTION][POST] Reinstall operation successful for VPS ${vpsid}`);

          return NextResponse.json({
            success: true,
            result: {
              accepted: true,
              vpsId: vpsid,
              templateId: chosenTemplateId,
              message: 'Reinstall submitted successfully',
              newPassword: pwd,
              duration: `${duration}ms`,
              raw: apiRes
            }
          });

        } catch (error) {
          console.error(`[SERVICE-ACTION][POST] Reinstall operation failed:`, error);
          console.error(`[SERVICE-ACTION][POST] Error details:`, {
            name: error.name,
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 5).join('\n') // First 5 lines of stack
          });

          // Log failed attempt
          await Order.findByIdAndUpdate(orderId, {
            $push: {
              logs: {
                action: 'reinstall',
                timestamp: new Date(),
                details: `Reinstall failed: ${error.message}`,
                success: false
              }
            }
          });

          return actionJson({
            success: false,
            error: error.message || 'Reinstall failed',
          }, 500, 'reinstall');
        }
      }

      case 'templates': {
        console.log(`[SERVICE-ACTION][POST] ========== TEMPLATES OPERATION ==========`);

        if (!virtualizorApi) {
          console.error(`[SERVICE-ACTION][POST] VirtualizorAPI not available for templates`);
          return actionJson({ success: false, error: 'Operating system list is not available for this server.' }, 400, 'templates');
        }

        try {
          console.log(`[SERVICE-ACTION][POST] Step 1: Finding VPS by IP...`);
          const hostname = guessHostnameFromOrder(order);
          console.log(`[SERVICE-ACTION][POST] Order hostname: ${hostname || 'Not found'}`);

          const vpsResult = await virtualizorApi.findVpsId({ ip: ipAddress, hostname });

          if (!vpsResult) {
            console.error(`[SERVICE-ACTION][POST] No VPS found for IP ${ipAddress}`);
            return actionJson({
              success: false,
              error: 'Server details could not be found. Please contact support.',
              code: 'VIRTUALIZOR_VPS_NOT_FOUND',
            }, 404, 'templates');
          }

          const vpsid = typeof vpsResult === 'object' ? vpsResult.vpsid : vpsResult;
          const vpsVirtFromFind = typeof vpsResult === 'object' ? vpsResult.virt : null;

          console.log(`[SERVICE-ACTION][POST] Step 2: VPS found with ID: ${vpsid}, virt: ${vpsVirtFromFind || 'unknown'}`);
          console.log(`[SERVICE-ACTION][POST] Step 3: Fetching available templates...`);

          const startTime = Date.now();
          const tplRaw = await virtualizorApi.getTemplates(vpsid);
          const duration = Date.now() - startTime;

          console.log(`[SERVICE-ACTION][POST] Step 4: Templates fetched in ${duration}ms`);

          // Determine the VPS virt type: prefer from findVpsId, then from template response
          const vpsVirt =
            vpsVirtFromFind ||
            tplRaw?.virt ||
            tplRaw?.info?.virt ||
            tplRaw?.vs?.virt ||
            tplRaw?.vps?.virt ||
            tplRaw?.vs_info?.virt ||
            null;

          const oslistData = tplRaw?.oslist || tplRaw?.os || tplRaw;

          if (vpsVirt) {
            console.log(`[SERVICE-ACTION][POST] VPS virt type: ${vpsVirt} — filtering templates to this type only`);
          } else {
            const oslistKeys = oslistData ? Object.keys(oslistData) : [];
            console.log(`[SERVICE-ACTION][POST] Could not detect virt type, oslist keys: [${oslistKeys.join(', ')}]`);
            if (oslistKeys.length === 1) {
              console.log(`[SERVICE-ACTION][POST] Only one virt type found: ${oslistKeys[0]}`);
            }
          }

          const flat = flattenOslist(oslistData, vpsVirt);
          console.log(`[SERVICE-ACTION][POST] Step 5: Found ${Object.keys(flat).length} templates (filtered by virt: ${vpsVirt || 'none'})`);

          return NextResponse.json({
            success: true,
            result: flat,
            vpsId: vpsid,
            duration: `${duration}ms`,
            raw: tplRaw
          });

        } catch (error) {
          console.error(`[SERVICE-ACTION][POST] Templates operation failed:`, error);
          console.error(`[SERVICE-ACTION][POST] Error details:`, {
            name: error.name,
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 5).join('\n')
          });

          return actionJson({
            success: false,
            error: error.message || 'Could not load operating systems',
          }, 500, 'templates');
        }
      }

      default:
        console.error(`[SERVICE-ACTION][POST] Invalid action: ${action}`);
        return actionJson({ success: false, error: 'Invalid action' }, 400, action);
    }

    // Log the action to the order
    await Order.findByIdAndUpdate(orderId, {
      $push: {
        logs: {
          action,
          timestamp: new Date(),
          details: result.message || `Action ${action} performed`,
          success: result.success || false
        }
      }
    });

    const finalOrder = await Order.findById(orderId).select('ipAddress username password os provisioningStatus lastSyncTime status').lean();
    return actionJson({ success: true, result, order: finalOrder }, 200, action);

  } catch (error) {
    console.error('[SERVICE-ACTION][POST] ===========================================');
    console.error('[SERVICE-ACTION][POST] FATAL ERROR:', error);
    console.error('[SERVICE-ACTION][POST] Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 10).join('\n') // First 10 lines
    });
    console.error('[SERVICE-ACTION][POST] ===========================================');

    return actionJson({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    }, 500, null);
  }
}

/**
 * GET /api/orders/service-action?orderId=...
 *
 * Returns a "service details" snapshot used by the order details page to
 * refresh status when the page first loads. Supports three paths:
 *   1. Company-Virtualizor automation (no Hostycare service ID).
 *   2. Hostycare orders (with hostycareServiceId).
 *   3. Otherwise returns 400 — there's no provider to query.
 *
 * Note: Templates for the OS picker are fetched via POST { action: 'templates' }.
 * This GET intentionally does NOT return a templates list.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    if (!orderId) {
      return actionJson({ success: false, error: 'Order ID is required' }, 400, 'sync');
    }

    await connectDB();

    const resolved = await resolveOrderForAction(request, orderId);
    if (resolved.error) return resolved.error;
    const order = resolved.order;

    console.log(`[SERVICE-ACTION][GET] Loading service details for order: ${orderId}`);

    // Resolve IP from common locations on the order document.
    let ipAddress = order.ipAddress
      || order.serverDetails?.rawDetails?.ips?.[0]
      || order.serviceDetails?.ipAddress
      || order.serviceDetails?.ip
      || order.productDetails?.ipAddress
      || order.productDetails?.ip
      || order.ip
      || null;

    // 1a-kurohost) KuroHost branch — instance id per order.
    if (order.provider === 'kurohost' || !!order.kurohostInstanceId) {
      const { config: kurohostCfg, companyName: kurohostCompanyName } = await resolveCompanyKurohostApi(order);
      if (kurohostCfg && order.kurohostInstanceId) {
        console.log(`[SERVICE-ACTION][GET] Using KuroHost API for order=${orderId} (instanceId=${order.kurohostInstanceId})`);
        try {
          const api = new KurohostApi(kurohostCfg);
          const detailRes = await api.getInstance(order.kurohostInstanceId);
          const inst = KurohostApi.unwrapInstance(detailRes);
          const { powerState, rawStatus } = resolveKurohostPowerState(inst);
          const applied = applyKurohostInstanceToOrderUpdates(inst, order);
          await Order.findByIdAndUpdate(orderId, applied.dbUpdates);
          const credentialsUpdated = applied.changes.some(c => ['password', 'username', 'ipAddress'].includes(c));

          return NextResponse.json({
            success: true,
            provider: 'kurohost',
            companyName: kurohostCompanyName || null,
            instanceId: order.kurohostInstanceId,
            ip: applied.dbUpdates.ipAddress || ipAddress || KurohostApi.extractInstanceIp(inst) || null,
            status: powerState,
            powerState,
            rawStatus,
            details: inst,
            credentialsUpdated,
            syncResult: {
              credentialsUpdated,
              changes: applied.changes,
              lastSyncTime: applied.dbUpdates.lastSyncTime?.toISOString?.() || new Date().toISOString(),
            },
          });
        } catch (kurohostGetErr) {
          console.error('[SERVICE-ACTION][GET] KuroHost getInstance failed:', kurohostGetErr.message);
        }
      }
    }

    // 1a-pre) Netbay branch — Netbay carries its own serviceId per order,
    //         so we go straight to /services/:id without any IP-based lookup.
    if ((order.provider === 'netbay' || !!order.netbayServiceId)) {
      const { config: netbayCfg, companyName: netbayCompanyName } = await resolveCompanyNetbayApi(order);
      if (netbayCfg && order.netbayServiceId) {
        console.log(`[SERVICE-ACTION][GET] Using Netbay API for order=${orderId} (serviceId=${order.netbayServiceId}, baseUrl=${netbayCfg.baseUrl})`);
        try {
          const isNetbayProxy = String(order.netbayProductKind || '').toLowerCase() === 'proxy';
          if (isNetbayProxy) {
            const sync = await syncNetbayOrderFromApi(order);
            if (!sync.ok) {
              return actionJson({
                success: false,
                error: sync.error || 'Could not sync proxy from NetBay',
              }, 502, 'sync');
            }
            if (sync.changes.length > 0) {
              await Order.findByIdAndUpdate(orderId, { $set: sync.dbUpdates });
            } else {
              await Order.findByIdAndUpdate(orderId, { $set: { lastSyncTime: sync.dbUpdates.lastSyncTime } });
            }
            const credentialsUpdated = sync.changes.some((c) =>
              ['password', 'username', 'ipAddress'].includes(c)
            );
            const expiryChanged = sync.changes.includes('expiryDate');
            return NextResponse.json({
              success: true,
              provider: 'netbay',
              productKind: 'proxy',
              companyName: netbayCompanyName || null,
              serviceId: order.netbayServiceId,
              ip: sync.dbUpdates.ipAddress || ipAddress || null,
              credentialsUpdated,
              expiryDate: sync.dbUpdates.expiryDate || order.expiryDate || null,
              syncResult: {
                credentialsUpdated,
                expiryUpdated: expiryChanged,
                changes: sync.changes,
                lastSyncTime: sync.dbUpdates.lastSyncTime.toISOString(),
              },
              lastSync: sync.dbUpdates.lastSyncTime.toISOString(),
            });
          }

          const api = new NetbayApi(netbayCfg);
          const detailRes = await api.getService(order.netbayServiceId);
          const svc = NetbayApi.unwrapServiceResponse(detailRes);

          const resolved = resolveNetbayPowerState(svc, {
            ipAddress: ipAddress || NetbayApi.extractServiceIp(svc),
            checkReachable: isServerReachable,
          });
          const powerState = resolved.powerState;

          // Sync IP / credentials / expiry from Netbay (expiryDate is source of truth)
          const applied = applyNetbayServiceToOrderUpdates(svc, order);
          const dbUpdates = applied.dbUpdates;
          await Order.findByIdAndUpdate(orderId, dbUpdates);

          const passwordChanged = applied.changes.includes('password');
          const usernameChanged = applied.changes.includes('username');
          const ipChanged = applied.changes.includes('ipAddress');
          const expiryChanged = applied.changes.includes('expiryDate');
          const credentialsUpdated = passwordChanged || usernameChanged || ipChanged;

          return NextResponse.json({
            success: true,
            provider: 'netbay',
            companyName: netbayCompanyName || null,
            serviceId: order.netbayServiceId,
            ip: dbUpdates.ipAddress || ipAddress || svc.ip || null,
            status: powerState,
            powerState,
            rawStatus: resolved.rawStatus,
            details: svc,
            credentialsUpdated,
            expiryDate: dbUpdates.expiryDate || order.expiryDate || null,
            syncResult: {
              credentialsUpdated,
              expiryUpdated: expiryChanged,
              changes: applied.changes,
              lastSyncTime: dbUpdates.lastSyncTime.toISOString(),
            },
            lastSync: dbUpdates.lastSyncTime.toISOString(),
          });
        } catch (err) {
          console.error('[SERVICE-ACTION][GET] Netbay lookup failed:', err.message);
          return actionJson({
            success: false,
            error: err.message || 'Could not load server status',
          }, typeof err.status === 'number' ? err.status : 500, 'sync');
        }
      }
    }

    // 1a-joy) Joy Services path — manage-only, IP-matched via machine_list.
    if (!order.hostycareServiceId && !order.netbayServiceId && order.provider !== 'netbay') {
      const { config: joyCfg, companyName: joyCompanyName } = await resolveCompanyJoyApi(order);
      if (joyCfg) {
        if (!ipAddress) {
          return actionJson({
            success: false,
            error: 'This server is still being set up. Please try again shortly.',
          }, 400, 'status');
        }
        console.log(`[SERVICE-ACTION][GET] Using Joy API for ${joyCompanyName || 'company'} (${joyCfg.baseUrl}, ip=${ipAddress})`);
        try {
          const joyApi = new JoyApi(joyCfg);
          const machine = await joyApi.findMachineByIp(ipAddress);
          if (!machine?.ihash) {
            return actionJson({
              success: false,
              error: 'Server details could not be found. Please contact support.',
            }, 404, 'status');
          }
          let powerState = 'unknown';
          let info = null;
          try {
            info = await joyApi.machineInfo(machine.ihash);
            powerState = resolveJoyPowerState(info);
          } catch (infoErr) {
            console.warn('[SERVICE-ACTION][GET] Joy machine_info failed; falling back to ping:', infoErr.message);
            powerState = isServerReachable(ipAddress) ? 'running' : 'stopped';
          }
          const applied = applyJoyMachineToOrderUpdates(machine, info, order);
          const dbUpdates = applied.dbUpdates;
          await Order.findByIdAndUpdate(orderId, dbUpdates);
          const expiryUpdated = applied.changes.includes('expiryDate');
          return NextResponse.json({
            success: true,
            provider: 'joy',
            companyName: joyCompanyName || null,
            serviceId: machine.ihash,
            ip: dbUpdates.ipAddress || ipAddress,
            status: powerState,
            powerState,
            details: info || null,
            expiryDate: dbUpdates.expiryDate || order.expiryDate || null,
            syncResult: {
              credentialsUpdated: false,
              expiryUpdated,
              changes: applied.changes,
              lastSyncTime: dbUpdates.lastSyncTime.toISOString(),
            },
            lastSync: dbUpdates.lastSyncTime.toISOString(),
          });
        } catch (err) {
          console.error('[SERVICE-ACTION][GET] Joy lookup failed:', err.message);
          return actionJson({
            success: false,
            error: err.message || 'Could not load server status',
          }, typeof err.status === 'number' ? err.status : 500, 'status');
        }
      }
    }

    // 1a) Company-Reseller-API path (Hostheaven / SomaniOne) — used only when
    //     the company has no Virtualizor panels configured. We resolve the
    //     VM id by looking up the order's IP in the reseller's order list,
    //     then drive a `metrics` call to extract the power state.
    if (!order.hostycareServiceId) {
      const { accounts: virtPeek } = await resolveCompanyVirtualizorAccounts(order);
      if (virtPeek.length === 0) {
        const { config: resellerCfg, companyName: resellerCompanyName } = await resolveCompanyResellerApi(order);
        if (resellerCfg) {
          if (!ipAddress) {
            return actionJson({
              success: false,
              error: 'This server is still being set up. Please try again shortly.',
            }, 400, 'status');
          }
          console.log(`[SERVICE-ACTION][GET] Using reseller API automation for ${resellerCompanyName || 'company'} (${resellerCfg.baseUrl}, ip=${ipAddress})`);

          let resellerApi;
          try {
            resellerApi = new ResellerApi(resellerCfg);
          } catch (apiErr) {
            return actionJson({
              success: false,
              error: apiErr.message || 'Server panel configuration is invalid.',
            }, 500, action);
          }

          try {
            const found = await resolveResellerVmForOrder(resellerApi, order);
            if (!found) {
              return actionJson({
                success: false,
                error: 'Server details could not be found. Please contact support.',
              }, 404, 'status');
            }

            const { powerState, rawStatus, source } = await resellerApi.resolveVmPowerState(
              found.vmId,
              { overviewRaw: found.raw }
            );

            const synced = await applyResellerPanelSync(resellerApi, order, orderId, found.vmId);

            return NextResponse.json({
              success: true,
              provider: 'reseller-api',
              companyName: resellerCompanyName || null,
              serviceId: String(found.vmId),
              vmId: String(found.vmId),
              ip: synced.updates.ipAddress || found.ip || order.ipAddress,
              status: powerState,
              powerState,
              rawStatus,
              powerSource: source,
              details: found.raw || null,
              syncResult: {
                credentialsUpdated: synced.changes.length > 0,
                changes: synced.changes,
                lastSyncTime: new Date().toISOString(),
              },
              lastSync: new Date().toISOString(),
            });
          } catch (err) {
            console.error('[SERVICE-ACTION][GET] Reseller-API lookup failed:', err.message);
            return actionJson({
              success: false,
              error: err.message || 'Could not load server status',
            }, typeof err.status === 'number' ? err.status : 500, 'status');
          }
        }
      }
    }

    // 1) Company-Virtualizor automation path.
    //    Triggers for any order that doesn't have a real Hostycare service ID
    //    (covers pure oceanlinux orders AND mislabeled "company" orders).
    if (!order.hostycareServiceId) {
      const { accounts: companyVirtAccounts, companyName } = await resolveCompanyVirtualizorAccounts(order);
      if (companyVirtAccounts.length > 0) {
        if (!ipAddress) {
          return actionJson({
            success: false,
            error: 'No IP address on this order — cannot look up the server.',
          }, 400, 'status');
        }
        console.log(`[SERVICE-ACTION][GET] Using ${companyVirtAccounts.length} company Virtualizor panel(s) for ${companyName || 'company'} (ip=${ipAddress})`);

        let companyApi;
        try {
          companyApi = new VirtualizorAPI({ accounts: toVirtualizorApiAccounts(companyVirtAccounts) });
        } catch (apiErr) {
          return actionJson({
            success: false,
            error: apiErr.message || 'Server panel configuration is invalid.',
          }, 500, action);
        }

        try {
          const hostname = guessHostnameFromOrder(order);
          const found = await companyApi.findVpsId({ ip: ipAddress, hostname });
          if (!found) {
            return actionJson({
              success: false,
              error: `No server found for this order IP. Please contact support.`,
              code: 'VIRTUALIZOR_VPS_NOT_FOUND',
            }, 404, 'status');
          }

          const vpsid = typeof found === 'object' ? found.vpsid : found;
          const { powerState, rawStatus, source, vmRecord } = await companyApi.resolveVpsPowerState(vpsid);

          await Order.findByIdAndUpdate(orderId, { lastSyncTime: new Date() });

          return NextResponse.json({
            success: true,
            provider: 'virtualizor',
            companyName: companyName || null,
            serviceId: String(vpsid),
            vpsId: String(vpsid),
            ip: ipAddress,
            status: powerState,
            powerState,
            rawStatus,
            powerSource: source,
            details: vmRecord || null,
            syncResult: {
              credentialsUpdated: false,
              lastSyncTime: new Date().toISOString(),
            },
            lastSync: new Date().toISOString(),
          });
        } catch (err) {
          console.error('[SERVICE-ACTION][GET] Company-Virtualizor lookup failed:', err.message);
          return actionJson({
            success: false,
            error: err.message || 'Could not load server status',
          }, 500, 'status');
        }
      }
    }

    // 2) Hostycare path — only when we actually have a service ID to query.
    if (order.hostycareServiceId) {
      console.log(`[SERVICE-ACTION][GET] Using Hostycare API for service ${order.hostycareServiceId}`);
      const hostycareApi = new HostycareAPI();
      try {
        let serviceInfo = null;
        let serviceDetails = null;
        try { serviceInfo = await hostycareApi.getServiceInfo(order.hostycareServiceId); }
        catch (e) { console.warn('[SERVICE-ACTION][GET] getServiceInfo failed:', e.message); }
        try { serviceDetails = await hostycareApi.getServiceDetails(order.hostycareServiceId); }
        catch (e) { console.warn('[SERVICE-ACTION][GET] getServiceDetails failed:', e.message); }

        let credentialsUpdated = false;
        try {
          credentialsUpdated = await syncServerState(order._id, serviceDetails, serviceInfo);
        } catch (e) {
          console.warn('[SERVICE-ACTION][GET] syncServerState failed:', e.message);
        }

        return NextResponse.json({
          success: true,
          provider: 'hostycare',
          serviceId: order.hostycareServiceId,
          ip: ipAddress,
          serviceInfo,
          serviceDetails,
          syncResult: {
            credentialsUpdated: !!credentialsUpdated,
            lastSyncTime: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.error('[SERVICE-ACTION][GET] Hostycare lookup failed:', err.message);
        return actionJson({
          success: false,
          error: err.message || 'Could not load server status',
        }, 500, 'sync');
      }
    }

    // 3) Nothing to query.
    return actionJson({
      success: false,
      error: 'Server management is not available for this order.',
    }, 400, 'sync');
  } catch (error) {
    console.error('[SERVICE-ACTION][GET] Fatal error:', error);
    return actionJson({
      success: false,
      error: error.message || 'Internal server error',
    }, 500, null);
  }
}

// ... existing syncServerState function remains the same ...

// ... existing syncServerState function remains the same ...
async function syncServerState(orderId, details, info) {
  try {
    const updateData = {
      lastSyncTime: new Date()
    };

    // Extract server state from details/info and map to our schema
    if (details) {
      // Map server status from Hostycare API to our provisioningStatus
      if (details.status) {
        // Safely convert status to string and handle different data types
        let hostycareStatus;
        if (typeof details.status === 'string') {
          hostycareStatus = details.status.toLowerCase();
        } else if (typeof details.status === 'number') {
          // Handle numeric status codes (common in APIs)
          hostycareStatus = details.status.toString();
        } else if (typeof details.status === 'boolean') {
          // Handle boolean status (true = active, false = inactive)
          hostycareStatus = details.status ? 'active' : 'suspended';
        } else if (details.status && typeof details.status === 'object') {
          // Handle object status (extract relevant field)
          hostycareStatus = details.status.state || details.status.name || details.status.value || 'unknown';
          if (typeof hostycareStatus === 'string') {
            hostycareStatus = hostycareStatus.toLowerCase();
          }
        } else {
          console.warn('[SYNC] Unknown status type:', typeof details.status, details.status);
          hostycareStatus = String(details.status).toLowerCase();
        }

        // Map the normalized status to our schema
        switch (hostycareStatus) {
          case 'online':
          case 'running':
          case 'active':
          case '1':
          case 'true':
            updateData.provisioningStatus = 'active';
            break;
          case 'offline':
          case 'stopped':
          case 'suspended':
          case '0':
          case 'false':
            updateData.provisioningStatus = 'suspended';
            break;
          case 'installing':
          case 'provisioning':
          case 'building':
          case 'creating':
            updateData.provisioningStatus = 'provisioning';
            break;
          case 'failed':
          case 'error':
            updateData.provisioningStatus = 'failed';
            break;
          case 'terminated':
          case 'deleted':
          case 'destroyed':
            updateData.provisioningStatus = 'terminated';
            break;
          default:
            // Log unknown status for debugging but don't update
            console.warn('[SYNC] Unknown server status:', hostycareStatus, 'from original:', details.status);
            break;
        }
      }

      // Update IP address if available and not already set
      if (details.ip && details.ip !== 'pending') {
        // Get the order to check provider and OS
        const order = await Order.findById(orderId);
        
        // Format IP address with port if needed (Windows Hostycare requires :49965)
        const { formatIpAddress } = await import('@/lib/ipAddressHelper.js');
        const formattedIpAddress = formatIpAddress(
          details.ip,
          order.provider,
          order.os
        );
        
        updateData.ipAddress = formattedIpAddress;
      }

      // Update username if available
      if (details.username) {
        updateData.username = details.username;
      }

      // Store raw server details for debugging/reference
      updateData.serverDetails = {
        lastUpdated: new Date(),
        rawDetails: details,
        rawInfo: info
      };
    }

    // Only update if we have meaningful data to sync
    if (Object.keys(updateData).length > 1) { // More than just lastSyncTime
      await Order.findByIdAndUpdate(orderId, updateData);
      console.log(`[SYNC] Updated order ${orderId} with server state:`, {
        ...updateData,
        serverDetails: updateData.serverDetails ? '[Raw data stored]' : undefined
      });
    } else {
      console.log(`[SYNC] No meaningful updates for order ${orderId}`);
    }

  } catch (error) {
    console.error('[SYNC] Error syncing server state for order', orderId, ':', error);
    console.error('[SYNC] Details object:', details);
    console.error('[SYNC] Info object:', info);
    throw error;
  }
}
