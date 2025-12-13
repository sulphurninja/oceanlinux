import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
const HostycareAPI = require('@/services/hostycareApi');
// at top of /api/orders/service-action/route.js
import { VirtualizorAPI } from '@/services/virtualizorApi';   // you exported the class by name
// or: import VirtualizorAPI from '@/services/virtualizorApi'; // you also export default


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


function flattenOslist(oslist) {
  // Accept shapes like: oslist[virt][distro][osid] = { osid, name, filename, ... }
  const out = {};
  if (!oslist || typeof oslist !== 'object') return out;

  // first level can be virt (kvm/xen/proxk/etc)
  for (const virt of Object.values(oslist)) {
    if (!virt || typeof virt !== 'object') continue;
    // second level can be distro
    for (const distro of Object.values(virt)) {
      if (!distro || typeof distro !== 'object') continue;
      // third level are templates keyed by osid
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
  }
  return out;
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

    // Initialize the appropriate APIs
    let virtualizorApi = null;
    let hostycareApi = null;

    if (order.provider === 'hostycare' || !order.provider) {
      hostycareApi = new HostycareAPI();

      // Only initialize VirtualizorAPI for actions that need it (reinstall, templates)
      if (action === 'reinstall' || action === 'templates') {
        virtualizorApi = new VirtualizorAPI();
      }
    }

    switch (action) {
      case 'start':
        console.log('[START] Starting VPS service');
        if (hostycareApi && order.hostycareServiceId) {
          console.log('[START] Using Hostycare API with service ID:', order.hostycareServiceId);
          result = await hostycareApi.startService(order.hostycareServiceId);
          result = {
            success: true,
            message: 'VPS start command sent successfully',
            apiResponse: result
          };
        } else {
          throw new Error('Hostycare service ID not found for this order');
        }
        break;

      case 'stop':
        console.log('[STOP] Stopping VPS service');
        if (hostycareApi && order.hostycareServiceId) {
          console.log('[STOP] Using Hostycare API with service ID:', order.hostycareServiceId);
          result = await hostycareApi.stopService(order.hostycareServiceId);
          result = {
            success: true,
            message: 'VPS stop command sent successfully',
            apiResponse: result
          };
        } else {
          throw new Error('Hostycare service ID not found for this order');
        }
        break;

      case 'restart':
        console.log('[RESTART] Restarting VPS service');
        if (hostycareApi && order.hostycareServiceId) {
          console.log('[RESTART] Using Hostycare API with service ID:', order.hostycareServiceId);
          result = await hostycareApi.rebootService(order.hostycareServiceId);
          result = {
            success: true,
            message: 'VPS restart command sent successfully',
            apiResponse: result
          };
        } else {
          throw new Error('Hostycare service ID not found for this order');
        }
        break;

      case 'status':
        console.log('[STATUS] Fetching VPS power status');
        if (hostycareApi && order.hostycareServiceId) {
          console.log('[STATUS] Using Hostycare API with service ID:', order.hostycareServiceId);
          try {
            const serviceInfo = await hostycareApi.getServiceInfo(order.hostycareServiceId);
            const serviceDetails = await hostycareApi.getServiceDetails(order.hostycareServiceId);
            
            console.log('[STATUS] Service Info:', JSON.stringify(serviceInfo, null, 2));
            console.log('[STATUS] Service Details:', JSON.stringify(serviceDetails, null, 2));

            // Parse the power state from the response
            let powerState = 'unknown';
            let rawStatus = null;

            // Check serviceInfo first (usually has real-time status)
            if (serviceInfo) {
              rawStatus = serviceInfo.status || serviceInfo.state || serviceInfo.power_status || serviceInfo.vps_status;
              
              // Also check nested properties
              if (!rawStatus && serviceInfo.vps) {
                rawStatus = serviceInfo.vps.status || serviceInfo.vps.state || serviceInfo.vps.power;
              }
              if (!rawStatus && serviceInfo.server) {
                rawStatus = serviceInfo.server.status || serviceInfo.server.state || serviceInfo.server.power;
              }
            }

            // Fallback to serviceDetails if no status found
            if (!rawStatus && serviceDetails) {
              rawStatus = serviceDetails.status || serviceDetails.state || serviceDetails.power_status;
              
              if (!rawStatus && serviceDetails.vps) {
                rawStatus = serviceDetails.vps.status || serviceDetails.vps.state;
              }
            }

            // Normalize the status
            if (rawStatus) {
              const statusLower = String(rawStatus).toLowerCase();
              if (['online', 'running', 'active', 'started', 'on', '1', 'true'].includes(statusLower)) {
                powerState = 'running';
              } else if (['offline', 'stopped', 'inactive', 'off', '0', 'false', 'shutdown'].includes(statusLower)) {
                powerState = 'stopped';
              } else if (['suspended', 'paused'].includes(statusLower)) {
                powerState = 'suspended';
              } else if (['installing', 'provisioning', 'building', 'creating', 'starting', 'stopping', 'rebooting'].includes(statusLower)) {
                powerState = 'busy';
              } else {
                powerState = statusLower; // Use as-is if we can't map it
              }
            }

            // Sync state to database
            await syncServerState(order._id, serviceDetails, serviceInfo);

            console.log('[STATUS] Returning power state:', powerState);
            
            // Return directly for status action (not wrapped in result)
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
            return NextResponse.json({
              success: false,
              error: statusError.message,
              powerState: 'unknown'
            });
          }
        } else {
          return NextResponse.json({
            success: false,
            error: 'Hostycare service ID not found',
            powerState: 'unknown'
          });
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

          const vpsid = await virtualizorApi.findVpsId({ ip: ipAddress, hostname });

          if (!vpsid) {
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

          const vpsid = await virtualizorApi.findVpsId({ ip: ipAddress, hostname });

          if (!vpsid) {
            console.error(`[SERVICE-ACTION][POST] No VPS found for IP ${ipAddress}`);
            return NextResponse.json({ success: false, error: `No VPS visible for IP ${ipAddress}` }, { status: 404 });
          }

          console.log(`[SERVICE-ACTION][POST] Step 2: VPS found with ID: ${vpsid}`);
          console.log(`[SERVICE-ACTION][POST] Step 3: Fetching available templates...`);

          const startTime = Date.now();
          const tplRaw = await virtualizorApi.getTemplates(vpsid);
          const duration = Date.now() - startTime;

          console.log(`[SERVICE-ACTION][POST] Step 4: Templates fetched in ${duration}ms`);

          const flat = flattenOslist(tplRaw?.oslist || tplRaw?.os || tplRaw);
          console.log(`[SERVICE-ACTION][POST] Step 5: Found ${Object.keys(flat).length} templates`);

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

// GET method for fetching templates
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    await connectDB();

    console.log(`[SERVICE-ACTION][GET] Fetching templates for order: ${orderId}`);

    // Get order details
    const order = await Order.findById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // Extract IP address from order details
    let ipAddress = null;

    if (order.ipAddress) {
      ipAddress = order.ipAddress;
    } else if (order.serverDetails?.rawDetails?.ips && order.serverDetails.rawDetails.ips.length > 0) {
      ipAddress = order.serverDetails.rawDetails.ips[0];
    }

    if (!ipAddress) {
      return NextResponse.json({
        success: false,
        error: 'No IP address found for this VPS order'
      }, { status: 400 });
    }

    console.log(`[SERVICE-ACTION][GET] Using IP address: ${ipAddress}`);

    // Initialize Virtualizor API
    const virtualizorApi = new VirtualizorAPI();

    try {
      // Find the VPS
      const vpsInfo = await virtualizorApi.findVPSByIP(ipAddress);
      if (!vpsInfo) {
        throw new Error(`No VPS found with IP address: ${ipAddress}`);
      }

      // Get available templates
      const templates = await virtualizorApi.getOSTemplates(vpsInfo.vpsId);

      if (!templates.oslist) {
        throw new Error('No OS templates available for this VPS');
      }

      // Process templates into a more user-friendly format
      const processedTemplates = {};

      for (const [virtType, distros] of Object.entries(templates.oslist)) {
        for (const [distroName, templateList] of Object.entries(distros)) {
          if (templateList && typeof templateList === 'object' && Object.keys(templateList).length > 0) {
            if (!processedTemplates[distroName]) {
              processedTemplates[distroName] = [];
            }

            for (const [templateId, templateData] of Object.entries(templateList)) {
              // Check if this template is available for this VPS's management group
              const templateMG = templateData.mg || [];
              const vpsMG = parseInt(vpsInfo.vpsData.mg);

              if (templateMG.includes(vpsMG) || templateMG.length === 0) {
                processedTemplates[distroName].push({
                  id: templateId,
                  name: templateData.name || templateData.filename || `Template ${templateId}`,
                  filename: templateData.filename,
                  size: templateData.size,
                  virtType: virtType,
                  current: templateId === vpsInfo.vpsData.osid
                });
              }
            }
          }
        }
      }

      console.log(`[SERVICE-ACTION][GET] Processed templates:`, Object.keys(processedTemplates));

      return NextResponse.json({
        success: true,
        vpsId: vpsInfo.vpsId,
        currentTemplate: vpsInfo.vpsData.osid,
        currentOS: vpsInfo.vpsData.os_name,
        templates: processedTemplates
      });

    } catch (error) {
      console.error('[SERVICE-ACTION][GET] Error:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to fetch templates'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[SERVICE-ACTION][GET] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
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
