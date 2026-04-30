import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import Company from '@/models/companyModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import { execSync } from 'child_process';
const HostycareAPI = require('@/services/hostycareApi');
const SmartVpsAPI = require('@/services/smartvpsApi');
// at top of /api/orders/service-action/route.js
import { VirtualizorAPI } from '@/services/virtualizorApi';   // you exported the class by name
// or: import VirtualizorAPI from '@/services/virtualizorApi'; // you also export default
const {
  getCompanyVirtualizorAccounts,
  toVirtualizorApiAccounts,
} = require('@/lib/companyVirtualizor');

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

function normalizeVirtualizorRunningState(raw) {
  if (!raw) return 'unknown';
  if (typeof raw === 'string') {
    const s = raw.toLowerCase().trim();
    if (['1', 'running', 'on', 'online', 'started', 'active'].includes(s)) return 'running';
    if (['0', 'stopped', 'off', 'offline', 'shutdown'].includes(s)) return 'stopped';
    if (['suspended', 'paused'].includes(s)) return 'suspended';
    return s;
  }
  if (typeof raw === 'number') return raw === 1 ? 'running' : 'stopped';
  if (typeof raw === 'object') {
    const candidate = raw.status || raw.state || raw.power || raw.running;
    if (candidate !== undefined) return normalizeVirtualizorRunningState(candidate);
  }
  return 'unknown';
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


function isServerReachable(ip) {
  const cleanIp = ip.split(':')[0];
  const port = ip.includes(':') ? parseInt(ip.split(':')[1]) : null;

  // Try ICMP ping first
  const isWin = process.platform === 'win32';
  const cmd = isWin
    ? `ping -n 1 -w 3000 ${cleanIp}`
    : `ping -c 1 -W 3 ${cleanIp}`;
  try {
    execSync(cmd, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    // Ping failed — try TCP connect to the port (handles Windows servers that block ICMP)
  }

  const portsToTry = port ? [port] : [22, 3389];
  for (const p of portsToTry) {
    try {
      execSync(
        `node -e "const s=require('net').createConnection(${p},'${cleanIp}',()=>{process.exit(0)});s.setTimeout(3000);s.on('timeout',()=>process.exit(1));s.on('error',()=>process.exit(1))"`,
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



export async function POST(request) {
  try {
    await connectDB();

    // ✅ Read ONCE
    const body = await request.json();
    const { orderId, action, templateId, newPassword, payload } = body;

    console.log(`[SERVICE-ACTION][POST] Action: ${action}, Order: ${orderId}, Template: ${templateId}`);

    // Get order details
    const order = await Order.findById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

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
      return NextResponse.json({
        success: false,
        error: `This action is only available for VPS orders. Product name: ${order.productName}`
      }, { status: 400 });
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

    if (!ipAddress) {
      return NextResponse.json({
        success: false,
        error: `No IP address found for this VPS order. Available order fields: ${Object.keys(order).join(', ')}`
      }, { status: 400 });
    }

    console.log(`[SERVICE-ACTION][POST] Using IP address: ${ipAddress}`);

    let result;

    // Initialize the appropriate APIs based on provider
    let virtualizorApi = null;
    let hostycareApi = null;
    let smartvpsApi = null;

    // Detect provider type
    const isSmartVps = order.provider === 'smartvps' || 
                       order.smartvpsDetails?.ip || 
                       (order.productName && order.productName.includes('🌊'));
    
    console.log(`[SERVICE-ACTION][POST] Provider detection: isSmartVps=${isSmartVps}, order.provider=${order.provider}`);

    // Any non-SmartVPS order that doesn't have an active Hostycare service ID
    // attached is eligible for company-Virtualizor automation. This covers
    // both pure OceanLinux orders and partially-configured ones whose
    // `provider` was stamped as 'hostycare' or similar but never received a
    // serviceId — those would otherwise fall through to the Hostycare branch
    // and fail with "No valid API configured".
    if (!isSmartVps && !order.hostycareServiceId) {
      const { accounts: companyVirtAccounts } = await resolveCompanyVirtualizorAccounts(order);
      if (companyVirtAccounts.length > 0) {
        const supportedActions = new Set(['start', 'stop', 'restart', 'status', 'sync', 'templates', 'reinstall']);
        if (!supportedActions.has(action)) {
          return NextResponse.json({
            success: false,
            error: `Action '${action}' is not supported for this order via Virtualizor automation.`,
          }, { status: 400 });
        }

        console.log(`[SERVICE-ACTION][POST] Using ${companyVirtAccounts.length} company Virtualizor panel(s) for action=${action} (order.provider=${order.provider || 'unset'}, no hostycareServiceId)`);

        let companyApi;
        try {
          companyApi = new VirtualizorAPI({ accounts: toVirtualizorApiAccounts(companyVirtAccounts) });
        } catch (apiErr) {
          return NextResponse.json({
            success: false,
            error: `Company Virtualizor configuration is invalid: ${apiErr.message}`,
          }, { status: 500 });
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
              result = { success: true, message: 'Start command sent (Virtualizor)', apiResponse: apiRes };
              break;
            }
            case 'stop': {
              const { vpsid } = await findVps();
              const apiRes = await companyApi.stop(vpsid);
              result = { success: true, message: 'Stop command sent (Virtualizor)', apiResponse: apiRes };
              break;
            }
            case 'restart': {
              const { vpsid } = await findVps();
              const apiRes = await companyApi.restart(vpsid);
              result = { success: true, message: 'Restart command sent (Virtualizor)', apiResponse: apiRes };
              break;
            }
            case 'status':
            case 'sync': {
              let powerState = 'unknown';
              let rawStatus = null;
              try {
                const { vpsid } = await findVps();
                const vmRecord = await companyApi.getVpsRecord(vpsid);
                if (vmRecord) {
                  rawStatus =
                    vmRecord.status ?? vmRecord.state ?? vmRecord.running ?? vmRecord.power ?? null;
                  powerState = normalizeVirtualizorRunningState(rawStatus ?? vmRecord);
                }
              } catch (lookupErr) {
                console.warn('[SERVICE-ACTION][POST] Virtualizor status lookup failed; falling back to ping:', lookupErr.message);
              }
              if (powerState === 'unknown' && ipAddress) {
                powerState = isServerReachable(ipAddress) ? 'running' : 'stopped';
              }
              await Order.findByIdAndUpdate(orderId, { lastSyncTime: new Date() });
              return NextResponse.json({
                success: true,
                powerState,
                rawStatus,
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
                return NextResponse.json({ success: false, error: 'templateId is required' }, { status: 400 });
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
                  message: 'Reinstall submitted via company Virtualizor',
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
          return NextResponse.json({
            success: false,
            error: virtErr.message || 'Virtualizor action failed',
          }, { status });
        }
      }
    }

    if (isSmartVps) {
      smartvpsApi = new SmartVpsAPI();
      console.log('[SERVICE-ACTION][POST] Using SmartVPS API');
    } else if (order.provider === 'hostycare' || !order.provider) {
      hostycareApi = new HostycareAPI();
      console.log('[SERVICE-ACTION][POST] Using Hostycare API');

      // Only initialize VirtualizorAPI for actions that need it (reinstall, templates)
      if (action === 'reinstall' || action === 'templates') {
        virtualizorApi = new VirtualizorAPI();
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
            message: 'SmartVPS start command sent successfully',
            apiResponse: apiRes
          };
        } else if (hostycareApi && order.hostycareServiceId) {
          console.log('[START] Using Hostycare API with service ID:', order.hostycareServiceId);
          result = await hostycareApi.startService(order.hostycareServiceId);
          result = {
            success: true,
            message: 'VPS start command sent successfully',
            apiResponse: result
          };
        } else {
          throw new Error('No valid API configured for this order (missing service ID or provider)');
        }
        break;

      case 'stop':
        console.log('[STOP] Stopping VPS service');
        if (smartvpsApi) {
          console.log('[STOP] Using SmartVPS API with IP:', ipAddress);
          const apiRes = await smartvpsApi.stop(ipAddress);
          result = {
            success: true,
            message: 'SmartVPS stop command sent successfully',
            apiResponse: apiRes
          };
        } else if (hostycareApi && order.hostycareServiceId) {
          console.log('[STOP] Using Hostycare API with service ID:', order.hostycareServiceId);
          result = await hostycareApi.stopService(order.hostycareServiceId);
          result = {
            success: true,
            message: 'VPS stop command sent successfully',
            apiResponse: result
          };
        } else {
          throw new Error('No valid API configured for this order (missing service ID or provider)');
        }
        break;

      case 'restart':
        console.log('[RESTART] Restarting VPS service');
        if (smartvpsApi) {
          // SmartVPS doesn't have restart - do stop then start
          console.log('[RESTART] Using SmartVPS API - stop then start');
          await smartvpsApi.stop(ipAddress);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
          const apiRes = await smartvpsApi.start(ipAddress);
          result = {
            success: true,
            message: 'SmartVPS restart command sent successfully (stop + start)',
            apiResponse: apiRes
          };
        } else if (hostycareApi && order.hostycareServiceId) {
          console.log('[RESTART] Using Hostycare API with service ID:', order.hostycareServiceId);
          result = await hostycareApi.rebootService(order.hostycareServiceId);
          result = {
            success: true,
            message: 'VPS restart command sent successfully',
            apiResponse: result
          };
        } else {
          throw new Error('No valid API configured for this order (missing service ID or provider)');
        }
        break;

      case 'status':
        console.log('[STATUS] Fetching VPS power status');
        if (smartvpsApi) {
          console.log('[STATUS] Using SmartVPS API with IP:', ipAddress);
          try {
            const apiRes = await smartvpsApi.status(ipAddress);
            console.log('[STATUS] SmartVPS response:', JSON.stringify(apiRes, null, 2));

            // Parse SmartVPS status response
            let powerState = 'unknown';
            let rawStatus = apiRes?.status || apiRes?.state || apiRes?.power || apiRes;

            if (typeof rawStatus === 'string') {
              const statusLower = rawStatus.toLowerCase();
              if (['online', 'running', 'active', 'started', 'on', '1'].includes(statusLower)) {
                powerState = 'running';
              } else if (['offline', 'stopped', 'inactive', 'off', '0', 'shutdown'].includes(statusLower)) {
                powerState = 'stopped';
              } else if (['suspended', 'paused'].includes(statusLower)) {
                powerState = 'suspended';
              } else {
                powerState = statusLower;
              }
            } else if (typeof rawStatus === 'object' && rawStatus !== null) {
              // Handle object response
              const state = rawStatus.status || rawStatus.state || rawStatus.power;
              if (state) {
                const stateLower = String(state).toLowerCase();
                if (['online', 'running', 'active', 'started', 'on', '1'].includes(stateLower)) {
                  powerState = 'running';
                } else if (['offline', 'stopped', 'inactive', 'off', '0', 'shutdown'].includes(stateLower)) {
                  powerState = 'stopped';
                } else {
                  powerState = stateLower;
                }
              }
            }

            console.log('[STATUS] SmartVPS power state:', powerState);
            
            return NextResponse.json({
              success: true,
              powerState: powerState,
              rawStatus: rawStatus,
              provider: 'smartvps',
              lastSync: new Date().toISOString()
            });
          } catch (statusError) {
            console.error('[STATUS] SmartVPS error:', statusError);
            return NextResponse.json({
              success: false,
              error: statusError.message,
              powerState: 'unknown',
              provider: 'smartvps'
            });
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
            return NextResponse.json({
              success: true,
              error: statusError.message,
              powerState: fallbackState
            });
          }
        } else {
          return NextResponse.json({
            success: false,
            error: 'No valid API configured for this order',
            powerState: 'unknown'
          });
        }
        break;

      case 'format':
        console.log('[FORMAT] Formatting VPS');
        if (smartvpsApi) {
          console.log('[FORMAT] Using SmartVPS API with IP:', ipAddress);
          const apiRes = await smartvpsApi.format(ipAddress);
          result = {
            success: true,
            message: 'SmartVPS format command sent successfully',
            apiResponse: apiRes
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
            message: `SmartVPS OS change to ${osType} sent successfully`,
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
            
            // Update order with synced data
            await Order.findByIdAndUpdate(orderId, {
              lastSyncTime: new Date(),
              $push: {
                logs: {
                  action: 'sync',
                  timestamp: new Date(),
                  details: 'SmartVPS status synced',
                  success: true
                }
              }
            });

            result = {
              success: true,
              message: 'SmartVPS status synced successfully',
              apiResponse: apiRes
            };
          } catch (syncError) {
            console.error('[SYNC] SmartVPS sync error:', syncError);
            result = {
              success: false,
              message: `Sync failed: ${syncError.message}`,
              error: syncError.message
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
          return NextResponse.json({ success: false, error: 'Virtualizor required for reinstall' }, { status: 400 });
        }

        // 🔁 Use values from the one parsed body
        const chosenTemplateId = templateId ?? payload?.templateId;
        const providedPwd = newPassword ?? payload?.password;

        console.log(`[SERVICE-ACTION][POST] Template ID: ${chosenTemplateId}`);
        console.log(`[SERVICE-ACTION][POST] Password provided: ${providedPwd ? 'Yes' : 'No (will generate)'}`);

        if (!chosenTemplateId) {
          console.error(`[SERVICE-ACTION][POST] Template ID is required for reinstall`);
          return NextResponse.json({ success: false, error: 'templateId is required' }, { status: 400 });
        }

        try {
          console.log(`[SERVICE-ACTION][POST] Step 1: Finding VPS by IP...`);
          const hostname = guessHostnameFromOrder(order);
          console.log(`[SERVICE-ACTION][POST] Order hostname: ${hostname || 'Not found'}`);

          const vpsResult = await virtualizorApi.findVpsId({ ip: ipAddress, hostname });

          if (!vpsResult) {
            console.error(`[SERVICE-ACTION][POST] No VPS found for IP ${ipAddress}`);
            return NextResponse.json({
              success: false,
              error: `No VPS visible for IP ${ipAddress}. This could mean:
              1. The IP is not assigned to any VPS across our Virtualizor panels
              2. The VPS is on a different panel not configured
              3. There's a connectivity issue with the Virtualizor panel

              Please check if the IP ${ipAddress} is correct and the VPS is properly provisioned.`
            }, { status: 404 });
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

          return NextResponse.json({
            success: false,
            error: `Reinstall failed: ${error.message}`,
            details: {
              ip: ipAddress,
              templateId: chosenTemplateId,
              errorType: error.name || 'Unknown'
            }
          }, { status: 500 });
        }
      }

      case 'templates': {
        console.log(`[SERVICE-ACTION][POST] ========== TEMPLATES OPERATION ==========`);

        if (!virtualizorApi) {
          console.error(`[SERVICE-ACTION][POST] VirtualizorAPI not available for templates`);
          return NextResponse.json({ success: false, error: 'Virtualizor not available for this provider' }, { status: 400 });
        }

        try {
          console.log(`[SERVICE-ACTION][POST] Step 1: Finding VPS by IP...`);
          const hostname = guessHostnameFromOrder(order);
          console.log(`[SERVICE-ACTION][POST] Order hostname: ${hostname || 'Not found'}`);

          const vpsResult = await virtualizorApi.findVpsId({ ip: ipAddress, hostname });

          if (!vpsResult) {
            console.error(`[SERVICE-ACTION][POST] No VPS found for IP ${ipAddress}`);
            return NextResponse.json({ success: false, error: `No VPS visible for IP ${ipAddress}` }, { status: 404 });
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

          return NextResponse.json({
            success: false,
            error: `Failed to fetch templates: ${error.message}`,
            details: {
              ip: ipAddress,
              errorType: error.name || 'Unknown'
            }
          }, { status: 500 });
        }
      }

      default:
        console.error(`[SERVICE-ACTION][POST] Invalid action: ${action}`);
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
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

    return NextResponse.json({ success: true, result });

  } catch (error) {
    console.error('[SERVICE-ACTION][POST] ===========================================');
    console.error('[SERVICE-ACTION][POST] FATAL ERROR:', error);
    console.error('[SERVICE-ACTION][POST] Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 10).join('\n') // First 10 lines
    });
    console.error('[SERVICE-ACTION][POST] ===========================================');

    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
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
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    await connectDB();

    console.log(`[SERVICE-ACTION][GET] Loading service details for order: ${orderId}`);

    const order = await Order.findById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // Resolve IP from common locations on the order document.
    let ipAddress = order.ipAddress
      || order.serverDetails?.rawDetails?.ips?.[0]
      || order.serviceDetails?.ipAddress
      || order.serviceDetails?.ip
      || order.productDetails?.ipAddress
      || order.productDetails?.ip
      || order.ip
      || null;

    // 1) Company-Virtualizor automation path.
    //    Triggers for any order that doesn't have a real Hostycare service ID
    //    (covers pure oceanlinux orders AND mislabeled "company" orders).
    if (!order.hostycareServiceId) {
      const { accounts: companyVirtAccounts, companyName } = await resolveCompanyVirtualizorAccounts(order);
      if (companyVirtAccounts.length > 0) {
        if (!ipAddress) {
          return NextResponse.json({
            success: false,
            error: 'No IP address on this order — cannot look up VPS on the company Virtualizor.',
          }, { status: 400 });
        }
        console.log(`[SERVICE-ACTION][GET] Using ${companyVirtAccounts.length} company Virtualizor panel(s) for ${companyName || 'company'} (ip=${ipAddress})`);

        let companyApi;
        try {
          companyApi = new VirtualizorAPI({ accounts: toVirtualizorApiAccounts(companyVirtAccounts) });
        } catch (apiErr) {
          return NextResponse.json({
            success: false,
            error: `Company Virtualizor configuration is invalid: ${apiErr.message}`,
          }, { status: 500 });
        }

        try {
          const hostname = guessHostnameFromOrder(order);
          const found = await companyApi.findVpsId({ ip: ipAddress, hostname });
          if (!found) {
            const panelHostsLabel = companyVirtAccounts.map(a => a.host).join(', ');
            return NextResponse.json({
              success: false,
              error: `No VPS visible for IP ${ipAddress} on any of the company's Virtualizor panels (${panelHostsLabel}).`,
            }, { status: 404 });
          }

          const vpsid = typeof found === 'object' ? found.vpsid : found;
          const vmRecord = await companyApi.getVpsRecord(vpsid).catch(() => null);
          const rawStatus =
            vmRecord?.status ?? vmRecord?.state ?? vmRecord?.running ?? vmRecord?.power ?? null;
          let powerState = normalizeVirtualizorRunningState(rawStatus ?? vmRecord);
          if (powerState === 'unknown' && ipAddress) {
            powerState = isServerReachable(ipAddress) ? 'running' : 'stopped';
          }

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
            details: vmRecord || null,
            syncResult: {
              credentialsUpdated: false,
              lastSyncTime: new Date().toISOString(),
            },
            lastSync: new Date().toISOString(),
          });
        } catch (err) {
          console.error('[SERVICE-ACTION][GET] Company-Virtualizor lookup failed:', err.message);
          return NextResponse.json({
            success: false,
            error: err.message || 'Company Virtualizor lookup failed',
          }, { status: 500 });
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
        return NextResponse.json({
          success: false,
          error: err.message || 'Hostycare lookup failed',
        }, { status: 500 });
      }
    }

    // 3) Nothing to query.
    return NextResponse.json({
      success: false,
      error: 'No valid provider configured for this order (no company Virtualizor and no Hostycare service ID).',
    }, { status: 400 });
  } catch (error) {
    console.error('[SERVICE-ACTION][GET] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
    }, { status: 500 });
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
