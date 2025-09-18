import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
const SmartVPSAPI = require('@/services/smartvpsApi');


export async function GET(request) {
  console.log('[SMARTVPS-ACTION][GET] === REQUEST START ===');
  console.log('[SMARTVPS-ACTION][GET] Request URL:', request.url);

  try {
    await connectDB();
    console.log('[SMARTVPS-ACTION][GET] Database connected successfully');

    const userId = await getDataFromToken(request);
    console.log('[SMARTVPS-ACTION][GET] User ID from token:', userId);

    if (!userId) {
      console.log('[SMARTVPS-ACTION][GET] No user ID found - unauthorized');
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    console.log('[SMARTVPS-ACTION][GET] Order ID from params:', orderId);

    if (!orderId) {
      console.log('[SMARTVPS-ACTION][GET] No orderId provided');
      return NextResponse.json({ message: 'orderId is required' }, { status: 400 });
    }

    console.log('[SMARTVPS-ACTION][GET] Searching for order:', { _id: orderId, user: userId });
    const order = await Order.findOne({ _id: orderId, user: userId });
    console.log('[SMARTVPS-ACTION][GET] Found order:', order ? {
      _id: order._id,
      productName: order.productName,
      provider: order.provider,
      smartvpsServiceId: order.smartvpsServiceId,
      ipAddress: order.ipAddress,
      status: order.status,
      provisioningStatus: order.provisioningStatus
    } : 'null');

    if (!order) {
      console.log('[SMARTVPS-ACTION][GET] Order not found');
      return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    }

    // For SmartVPS, we can use either the smartvpsServiceId or ipAddress as the identifier
    const serviceIdentifier = order.smartvpsServiceId || order.ipAddress;
    if (!serviceIdentifier) {
      console.log('[SMARTVPS-ACTION][GET] No SmartVPS service ID or IP address attached to order');
      return NextResponse.json({ message: 'No SmartVPS service or IP address attached' }, { status: 400 });
    }

    console.log('[SMARTVPS-ACTION][GET] Using service identifier:', serviceIdentifier);
    console.log('[SMARTVPS-ACTION][GET] Initializing SmartVPS API');
    const api = new SmartVPSAPI();

    console.log('[SMARTVPS-ACTION][GET] Fetching service status for identifier:', serviceIdentifier);
    let details = null;
    let info = null;

    try {
      // Use the status endpoint to get service details
      const statusResponse = await api.status(serviceIdentifier);

      // Parse the response specifically for status action
      const parsedResponse = parseSmartVPSResponse(statusResponse, 'status');

      // 🔍 ENHANCED DEBUGGING: Log the parsed response
      console.log('[SMARTVPS-ACTION][GET] === PARSED STATUS RESPONSE ===');
      console.log('[SMARTVPS-ACTION][GET] Parsed response:', JSON.stringify(parsedResponse, null, 2));
      console.log('[SMARTVPS-ACTION][GET] Response keys:', Object.keys(parsedResponse || {}));
      console.log('[SMARTVPS-ACTION][GET] === END PARSED RESPONSE ===');

      // Extract credentials from the parsed response
      const extractedCredentials = extractSmartVPSCredentials(parsedResponse, order);

      // Transform the response to include the extracted credentials
      const transformedDetails = {
        id: serviceIdentifier,
        ip: extractedCredentials.ip || serviceIdentifier,

        // Use extracted status and map to our format
        status: extractedCredentials.status === 'active' ? 'active' :
               extractedCredentials.status === 'Online' ? 'active' :
               extractedCredentials.status === 'completed' ? 'active' : 'unknown',

        // Use the credentials from SmartVPS, fallback to order if not found
        username: extractedCredentials.username || 'Administrator',
        password: extractedCredentials.password, // This should now get the NEW password
        os: extractedCredentials.os,

        // Additional fields
        ram: extractedCredentials.ram,
        expiryDate: extractedCredentials.expiryDate,

        // Include original parsed response for debugging
        ...parsedResponse
      };

      console.log('[SMARTVPS-ACTION][GET] Transformed details with credentials:', {
        id: transformedDetails.id,
        ip: transformedDetails.ip,
        status: transformedDetails.status,
        username: transformedDetails.username,
        password: transformedDetails.password ? '[FINAL PASSWORD FOR SYNC]' : 'null',
        os: transformedDetails.os,
        passwordSource: extractedCredentials.password !== order.password ? 'SmartVPS API' : 'Order Document'
      });

      details = transformedDetails;
      info = details; // For SmartVPS, info and details are the same
    } catch (error) {
      console.log('[SMARTVPS-ACTION][GET] Service status error (continuing anyway):', error.message);
      // Create a basic details object even if status call fails
      details = {
        id: serviceIdentifier,
        ip: order.ipAddress || serviceIdentifier,
        status: order.provisioningStatus || order.status || 'unknown',
        username: order.username || 'Administrator',
        password: order.password,
        os: order.os
      };
    }

    console.log('[SMARTVPS-ACTION][GET] Syncing server state to database');
    // Sync the latest server state to our database
    const syncResult = await syncServerState(order._id, details, info);
    console.log('[SMARTVPS-ACTION][GET] Server state sync completed, sync result:', {
      credentialsUpdated: !!(syncResult.username || syncResult.password || syncResult.os),
      updates: {
        username: syncResult.username ? 'UPDATED' : 'unchanged',
        password: syncResult.password ? 'UPDATED' : 'unchanged',
        os: syncResult.os ? 'UPDATED' : 'unchanged',
        status: syncResult.provisioningStatus ? 'UPDATED' : 'unchanged'
      }
    });

    const response = {
      success: true,
      serviceId: serviceIdentifier,
      details,
      info,
      syncResult: {
        credentialsUpdated: !!(syncResult.username || syncResult.password || syncResult.os),
        lastSyncTime: syncResult.lastSyncTime
      }
    };
    console.log('[SMARTVPS-ACTION][GET] Returning response with sync info');

    return NextResponse.json(response);
  } catch (error) {
    console.error('[SMARTVPS-ACTION][GET] === ERROR ===');
    console.error('[SMARTVPS-ACTION][GET] Error type:', error.constructor.name);
    console.error('[SMARTVPS-ACTION][GET] Error message:', error.message);
    console.error('[SMARTVPS-ACTION][GET] Error stack:', error.stack);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  console.log('[SMARTVPS-ACTION][POST] === REQUEST START ===');
  console.log('[SMARTVPS-ACTION][POST] Request URL:', request.url);
  console.log('[SMARTVPS-ACTION][POST] Headers:', Object.fromEntries(request.headers.entries()));

  try {
    await connectDB();
    console.log('[SMARTVPS-ACTION][POST] Database connected successfully');

    const userId = await getDataFromToken(request);
    console.log('[SMARTVPS-ACTION][POST] User ID from token:', userId);

    if (!userId) {
      console.log('[SMARTVPS-ACTION][POST] No user ID found - unauthorized');
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const requestBody = await request.json();
    console.log('[SMARTVPS-ACTION][POST] Request body:', requestBody);

    const { orderId, action, payload } = requestBody;
    console.log('[SMARTVPS-ACTION][POST] Parsed params:', { orderId, action, payload });

    if (!orderId || !action) {
      console.log('[SMARTVPS-ACTION][POST] Missing required parameters');
      return NextResponse.json({ message: 'orderId and action are required' }, { status: 400 });
    }

    console.log('[SMARTVPS-ACTION][POST] Searching for order:', { _id: orderId, user: userId });
    const order = await Order.findOne({ _id: orderId, user: userId });
    console.log('[SMARTVPS-ACTION][POST] Found order:', order ? {
      _id: order._id,
      productName: order.productName,
      provider: order.provider,
      smartvpsServiceId: order.smartvpsServiceId,
      ipAddress: order.ipAddress,
      status: order.status,
      provisioningStatus: order.provisioningStatus,
      lastAction: order.lastAction,
      lastActionTime: order.lastActionTime
    } : 'null');

    if (!order) {
      console.log('[SMARTVPS-ACTION][POST] Order not found');
      return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    }

    // For SmartVPS, we can use either the smartvpsServiceId or ipAddress as the identifier
    const serviceIdentifier = order.smartvpsServiceId || order.ipAddress;
    if (!serviceIdentifier) {
      console.log('[SMARTVPS-ACTION][POST] No SmartVPS service ID or IP address attached to order');
      return NextResponse.json({ message: 'No SmartVPS service or IP address attached' }, { status: 400 });
    }

    console.log('[SMARTVPS-ACTION][POST] Using service identifier:', serviceIdentifier);
    console.log('[SMARTVPS-ACTION][POST] Initializing SmartVPS API');
    const api = new SmartVPSAPI();

    let result;

    console.log('[SMARTVPS-ACTION][POST] Executing action:', action);
    switch (action) {
      case 'start':
        console.log('[SMARTVPS-ACTION][POST] Starting service:', serviceIdentifier);
        result = await api.start(serviceIdentifier);
        console.log('[SMARTVPS-ACTION][POST] Start service result:', result);

        console.log('[SMARTVPS-ACTION][POST] Updating order status to active');
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'active',
          lastAction: 'start',
          lastActionTime: new Date()
        });
        console.log('[SMARTVPS-ACTION][POST] Order updated successfully');
        break;

      case 'stop':
        console.log('[SMARTVPS-ACTION][POST] Stopping service:', serviceIdentifier);
        result = await api.stop(serviceIdentifier);
        console.log('[SMARTVPS-ACTION][POST] Stop service result:', result);

        console.log('[SMARTVPS-ACTION][POST] Updating order status to suspended');
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'suspended',
          lastAction: 'stop',
          lastActionTime: new Date()
        });
        console.log('[SMARTVPS-ACTION][POST] Order updated successfully');
        break;

      case 'reboot':
        console.log('[SMARTVPS-ACTION][POST] Rebooting service:', serviceIdentifier);
        // SmartVPS doesn't have direct reboot, so we stop then start
        try {
          console.log('[SMARTVPS-ACTION][POST] Stopping for reboot...');
          await api.stop(serviceIdentifier);
          console.log('[SMARTVPS-ACTION][POST] Waiting 2 seconds before restart...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log('[SMARTVPS-ACTION][POST] Starting after stop...');
          result = await api.start(serviceIdentifier);
          console.log('[SMARTVPS-ACTION][POST] Reboot sequence completed:', result);
        } catch (error) {
          console.error('[SMARTVPS-ACTION][POST] Reboot sequence failed:', error);
          throw new Error(`Reboot failed: ${error.message}`);
        }

        console.log('[SMARTVPS-ACTION][POST] Updating order last action to reboot');
        await Order.findByIdAndUpdate(orderId, {
          lastAction: 'reboot',
          lastActionTime: new Date()
        });
        console.log('[SMARTVPS-ACTION][POST] Order updated successfully');
        break;

      case 'format':
        console.log('[SMARTVPS-ACTION][POST] Format action requested');
        console.log('[SMARTVPS-ACTION][POST] Format payload:', {
          templateId: payload?.templateId
        });

        try {
          let formatResult;

          // If templateId is provided, change OS first then format
          if (payload?.templateId) {
            console.log('[SMARTVPS-ACTION][POST] Changing OS to template:', payload.templateId);
            await api.changeOS(serviceIdentifier, payload.templateId);
            console.log('[SMARTVPS-ACTION][POST] OS change completed, now formatting...');

            // Format - SmartVPS format doesn't take OS parameter, just format the service
            formatResult = await api.format(serviceIdentifier);
          } else {
            // Just format without OS change
            formatResult = await api.format(serviceIdentifier);
          }

          console.log('[SMARTVPS-ACTION][POST] Format API Success:', formatResult);
          result = formatResult;

          console.log('[SMARTVPS-ACTION][POST] Updating order provisioning status to provisioning');
          await Order.findByIdAndUpdate(orderId, {
            provisioningStatus: 'provisioning',
            lastAction: 'format',
            lastActionTime: new Date()
          });
          console.log('[SMARTVPS-ACTION][POST] Order updated successfully');

          // Immediately schedule multiple sync attempts after format to capture new credentials
          console.log('[SMARTVPS-ACTION][POST] Scheduling post-format sync attempts for credential updates');
          const syncAttempts = [5000, 15000, 30000, 60000, 120000]; // 5s, 15s, 30s, 1m, 2m

          syncAttempts.forEach((delay, index) => {
            setTimeout(async () => {
              console.log(`[SMARTVPS-ACTION][POST] Post-format sync attempt ${index + 1}/${syncAttempts.length} after ${delay}ms`);
              try {
                const statusData = await api.status(serviceIdentifier);

                // Parse the response specifically for status action
                const parsedStatusData = parseSmartVPSResponse(statusData, 'status');

                // 🔍 ENHANCED DEBUGGING for post-format sync
                console.log(`[SMARTVPS-ACTION][POST] === POST-FORMAT SYNC ${index + 1} PARSED RESPONSE ===`);
                console.log(`[SMARTVPS-ACTION][POST] Parsed response:`, JSON.stringify(parsedStatusData, null, 2));
                console.log(`[SMARTVPS-ACTION][POST] === END POST-FORMAT SYNC ${index + 1} RESPONSE ===`);

                // Extract credentials from the parsed response
                const extractedCredentials = extractSmartVPSCredentials(parsedStatusData, order);

                const details = {
                  id: serviceIdentifier,
                  ip: extractedCredentials.ip || serviceIdentifier,
                  status: extractedCredentials.status === 'active' || extractedCredentials.status === 'Online' ? 'active' : 'provisioning',

                  // Use the credentials from SmartVPS
                  username: extractedCredentials.username,
                  password: extractedCredentials.password, // This should now get the NEW password
                  os: extractedCredentials.os,

                  // Include all original response data
                  ...parsedStatusData
                };

                console.log(`[SMARTVPS-ACTION][POST] Post-format sync ${index + 1} - Final details for sync:`, {
                  id: details.id,
                  ip: details.ip,
                  status: details.status,
                  username: details.username,
                  password: details.password ? '[FINAL PASSWORD FOR SYNC]' : 'no password found',
                  os: details.os,
                  passwordSource: extractedCredentials.password !== order.password ? 'SmartVPS API' : 'Order Document'
                });

                const syncResult = await syncServerState(orderId, details, details);
                console.log(`[SMARTVPS-ACTION][POST] Post-format sync ${index + 1} completed:`, {
                  credentialsUpdated: !!(syncResult.username || syncResult.password || syncResult.os),
                  usernameUpdated: !!syncResult.username,
                  passwordUpdated: !!syncResult.password,
                  osUpdated: !!syncResult.os
                });

                // If we got new credentials, log success
                if (syncResult.username || syncResult.password || syncResult.os) {
                  console.log(`[SMARTVPS-ACTION][POST] ✅ Credentials updated in sync attempt ${index + 1}:`);
                  if (syncResult.username) console.log(`[SMARTVPS-ACTION][POST] - Username: ${syncResult.username}`);
                  if (syncResult.password) console.log(`[SMARTVPS-ACTION][POST] - Password: [UPDATED]`);
                  if (syncResult.os) console.log(`[SMARTVPS-ACTION][POST] - OS: ${syncResult.os}`);
                }
              } catch (syncError) {
                console.error(`[SMARTVPS-ACTION][POST] Post-format sync ${index + 1} error:`, syncError);
              }
            }, delay);
          });

        } catch (error) {
          console.error('[SMARTVPS-ACTION][POST] Format API Error:', error.message);
          console.error('[SMARTVPS-ACTION][POST] Format API Error Stack:', error.stack);
          throw error;
        }
        break;

      case 'changepassword':
        console.log('[SMARTVPS-ACTION][POST] Change password action requested');
        console.log('[SMARTVPS-ACTION][POST] SmartVPS does not support direct password change via API');
        return NextResponse.json({ message: 'Password change not supported by SmartVPS API. Use format instead.' }, { status: 400 });

      case 'templates':
        console.log('[SMARTVPS-ACTION][POST] Fetching templates for service:', serviceIdentifier);
        try {
          // Return available OS templates based on SmartVPS documentation
          result = {
            '2012': 'Windows Server 2012',
            '2016': 'Windows Server 2016',
            '2019': 'Windows Server 2019',
            '2022': 'Windows Server 2022',
            '11': 'Windows 11',
            'centos': 'CentOS 7',
            'ubuntu': 'Ubuntu 22'
          };
          console.log('[SMARTVPS-ACTION][POST] Templates returned:', result);
        } catch (error) {
          console.error('[SMARTVPS-ACTION][POST] Templates fetch error:', error.message);
          console.error('[SMARTVPS-ACTION][POST] Templates fetch error stack:', error.stack);
          throw error;
        }
        break;

      case 'details':
        console.log('[SMARTVPS-ACTION][POST] Fetching service details for:', serviceIdentifier);
        try {
          const statusData = await api.status(serviceIdentifier);

          // Parse the response specifically for status action
          const parsedStatusData = parseSmartVPSResponse(statusData, 'status');

          // Extract credentials from the parsed response
          const extractedCredentials = extractSmartVPSCredentials(parsedStatusData, order);

          // Transform the response to match expected format with enhanced credential extraction
          result = {
            id: serviceIdentifier,
            ip: extractedCredentials.ip || serviceIdentifier,
            status: extractedCredentials.status === 'active' || extractedCredentials.status === 'Online' ? 'active' : 'unknown',

            // Use credentials from SmartVPS
            username: extractedCredentials.username || 'Administrator',
            password: extractedCredentials.password,
            os: extractedCredentials.os,

            ...parsedStatusData
          };

          console.log('[SMARTVPS-ACTION][POST] Transformed service details:', {
            ...result,
            password: result.password ? '[PASSWORD PRESENT]' : 'null'
          });
        } catch (error) {
          console.error('[SMARTVPS-ACTION][POST] Service details fetch error:', error);
          throw error;
        }
        break;

      default:
        console.log('[SMARTVPS-ACTION][POST] Unsupported action:', action);
        return NextResponse.json({ message: 'Unsupported action' }, { status: 400 });
    }

    console.log('[SMARTVPS-ACTION][POST] Action completed, checking if sync is needed');

    // After any other action (start, stop, reboot), fetch the latest server state and sync it
    if (['start', 'stop', 'reboot'].includes(action)) {
      console.log('[SMARTVPS-ACTION][POST] Action requires sync, scheduling delayed sync');
      try {
        setTimeout(async () => {
          console.log('[SMARTVPS-ACTION][POST] Executing delayed sync after action:', action);
          try {
            let details = null;
            let info = null;

            try {
              const statusData = await api.status(serviceIdentifier);

              // Parse the response specifically for status action
              const parsedStatusData = parseSmartVPSResponse(statusData, 'status');

              // Extract credentials from the parsed response
              const extractedCredentials = extractSmartVPSCredentials(parsedStatusData, order);

              console.log('[SMARTVPS-ACTION][POST] Delayed sync - parsed status data:', parsedStatusData);

              details = {
                id: serviceIdentifier,
                ip: extractedCredentials.ip || serviceIdentifier,
                status: extractedCredentials.status === 'active' || extractedCredentials.status === 'Online' ? 'active' : 'unknown',
                username: extractedCredentials.username || 'Administrator',
                password: extractedCredentials.password,
                os: extractedCredentials.os,
                ...parsedStatusData
              };
              info = details;
              console.log('[SMARTVPS-ACTION][POST] Delayed sync - transformed details:', {
                ...details,
                password: details.password ? '[PASSWORD PRESENT]' : 'null'
              });
            } catch (statusError) {
              console.log('[SMARTVPS-ACTION][POST] Delayed sync - status error (ignored):', statusError.message);
              details = {
                id: serviceIdentifier,
                ip: order.ipAddress || serviceIdentifier,
                status: 'unknown'
              };
              info = details;
            }

            await syncServerState(orderId, details, info);
            console.log('[SMARTVPS-ACTION][POST] Delayed sync completed successfully');
          } catch (syncError) {
            console.error('[SMARTVPS-ACTION][POST] Delayed sync error:', syncError);
          }
        }, 2000);
        console.log('[SMARTVPS-ACTION][POST] Delayed sync scheduled for 2 seconds');
      } catch (syncError) {
        console.error('[SMARTVPS-ACTION][POST] Sync scheduling error:', syncError);
      }
    } else {
      console.log('[SMARTVPS-ACTION][POST] Action does not require sync');
    }

    const response = { success: true, action, result };
    console.log('[SMARTVPS-ACTION][POST] Returning response:', {
      ...response,
      result: result ? '[Result object present]' : null
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('[SMARTVPS-ACTION][POST] === ERROR ===');
    console.error('[SMARTVPS-ACTION][POST] Error type:', error.constructor.name);
    console.error('[SMARTVPS-ACTION][POST] Error message:', error.message);
    console.error('[SMARTVPS-ACTION][POST] Error stack:', error.stack);
    console.error('[SMARTVPS-ACTION][POST] Error details:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
// Helper function to parse SmartVPS API responses
function parseSmartVPSResponse(response, actionType = 'unknown') {
  console.log(`[SMARTVPS-PARSE] Parsing response for action: ${actionType}`);
  console.log(`[SMARTVPS-PARSE] Raw response type:`, typeof response);

  // For status action, expect JSON data
  if (actionType === 'status') {
    // If it's already a proper object with meaningful keys, return as-is
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      const keys = Object.keys(response);
      const hasNonNumericKeys = keys.some(key => isNaN(key));

      if (hasNonNumericKeys) {
        console.log(`[SMARTVPS-PARSE] Response is already parsed object:`, response);
        return response;
      }

      // If it's an object with only numeric keys (character array), reconstruct the string
      if (keys.every(key => !isNaN(key))) {
        try {
          const jsonString = keys
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(key => response[key])
            .join('');
          console.log(`[SMARTVPS-PARSE] Reconstructed JSON string:`, jsonString);
          const parsed = JSON.parse(jsonString);
          console.log(`[SMARTVPS-PARSE] Successfully parsed reconstructed JSON:`, parsed);
          return parsed;
        } catch (parseError) {
          console.error(`[SMARTVPS-PARSE] Failed to parse reconstructed string:`, parseError);
          return response;
        }
      }
    }

    // If it's a string, try to parse as JSON
    if (typeof response === 'string') {
      try {
        const parsed = JSON.parse(response);
        console.log(`[SMARTVPS-PARSE] Successfully parsed JSON string:`, parsed);
        return parsed;
      } catch (parseError) {
        console.error(`[SMARTVPS-PARSE] Failed to parse JSON string:`, parseError);
        return response;
      }
    }
  }

  // For other actions (start, stop, reboot, format, etc.), return as-is
  console.log(`[SMARTVPS-PARSE] Non-status action, returning response as-is`);
  return response;
}

// Helper function to extract credentials from parsed SmartVPS response
function extractSmartVPSCredentials(parsedResponse, order) {
  console.log(`[SMARTVPS-EXTRACT] Extracting credentials from parsed response`);

  const extracted = {
    // SmartVPS uses capitalized field names in status responses
    ip: parsedResponse?.IP || parsedResponse?.ip || order.ipAddress,
    username: parsedResponse?.Username || parsedResponse?.username || parsedResponse?.User || parsedResponse?.user || order.username,
    password: parsedResponse?.Password || parsedResponse?.password || order.password,
    os: parsedResponse?.OS || parsedResponse?.os || order.os,
    status: parsedResponse?.MachineStatus || parsedResponse?.PowerStatus || parsedResponse?.ActionStatus || parsedResponse?.status,
    ram: parsedResponse?.RAM || parsedResponse?.ram,
    expiryDate: parsedResponse?.ExpiryDate || parsedResponse?.expiryDate
  };

  console.log(`[SMARTVPS-EXTRACT] Extracted credentials:`, {
    ip: extracted.ip,
    username: extracted.username,
    password: extracted.password ? '[EXTRACTED PASSWORD]' : 'no password found',
    os: extracted.os,
    status: extracted.status,
    ram: extracted.ram,
    expiryDate: extracted.expiryDate,
    passwordSource: parsedResponse?.Password || parsedResponse?.password ? 'SmartVPS API' : 'Order Document'
  });

  return extracted;
}


// Helper function to sync server state from SmartVPS API to our database
async function syncServerState(orderId, details, info) {
  console.log('[SMARTVPS-SYNC] === SYNC START ===');
  console.log('[SMARTVPS-SYNC] Order ID:', orderId);
  console.log('[SMARTVPS-SYNC] Details received:', details ? '[Details object present]' : null);
  console.log('[SMARTVPS-SYNC] Info received:', info ? '[Info object present]' : null);

  try {
    const updateData = {
      lastSyncTime: new Date()
    };
    console.log('[SMARTVPS-SYNC] Initial update data:', updateData);

    if (details) {
      console.log('[SMARTVPS-SYNC] Processing details object');
      console.log('[SMARTVPS-SYNC] Details keys:', Object.keys(details));
      console.log('[SMARTVPS-SYNC] Raw details for credential extraction:', {
        status: details.status,
        username: details.username,
        password: details.password ? '[PASSWORD PRESENT]' : 'null',
        os: details.os,
        operating_system: details.operating_system,
        template: details.template,
        admin_password: details.admin_password,
        root_password: details.root_password,
        user: details.user,
        login: details.login
      });

      // Status mapping
      let smartvpsStatus;
      if (typeof details.status === 'string') {
        smartvpsStatus = details.status.toLowerCase();
        console.log('[SMARTVPS-SYNC] String status converted:', smartvpsStatus);
      } else if (typeof details.status === 'number') {
        smartvpsStatus = details.status.toString();
        console.log('[SMARTVPS-SYNC] Number status converted:', smartvpsStatus);
      } else if (typeof details.status === 'boolean') {
        smartvpsStatus = details.status ? 'active' : 'suspended';
        console.log('[SMARTVPS-SYNC] Boolean status converted:', smartvpsStatus);
      } else if (details.status && typeof details.status === 'object') {
        smartvpsStatus = details.status.state || details.status.name || details.status.value || 'unknown';
        if (typeof smartvpsStatus === 'string') {
          smartvpsStatus = smartvpsStatus.toLowerCase();
        }
        console.log('[SMARTVPS-SYNC] Object status processed:', smartvpsStatus);
      } else {
        console.warn('[SMARTVPS-SYNC] Unknown status type:', typeof details.status, details.status);
        smartvpsStatus = String(details.status).toLowerCase();
        console.log('[SMARTVPS-SYNC] Fallback status conversion:', smartvpsStatus);
      }

      console.log('[SMARTVPS-SYNC] Final smartvpsStatus:', smartvpsStatus);
      console.log('[SMARTVPS-SYNC] Mapping status to provisioning status');

      switch (smartvpsStatus) {
        case 'online':
        case 'running':
        case 'active':
        case '1':
        case 'true':
          updateData.provisioningStatus = 'active';
          console.log('[SMARTVPS-SYNC] Mapped to: active');
          break;
        case 'offline':
        case 'stopped':
        case 'suspended':
        case '0':
        case 'false':
          updateData.provisioningStatus = 'suspended';
          console.log('[SMARTVPS-SYNC] Mapped to: suspended');
          break;
        case 'installing':
        case 'provisioning':
        case 'building':
        case 'creating':
          updateData.provisioningStatus = 'provisioning';
          console.log('[SMARTVPS-SYNC] Mapped to: provisioning');
          break;
        case 'failed':
        case 'error':
          updateData.provisioningStatus = 'failed';
          console.log('[SMARTVPS-SYNC] Mapped to: failed');
          break;
        case 'terminated':
        case 'deleted':
        case 'destroyed':
          updateData.provisioningStatus = 'terminated';
          console.log('[SMARTVPS-SYNC] Mapped to: terminated');
          break;
        default:
          console.warn('[SMARTVPS-SYNC] Unknown server status:', smartvpsStatus, 'from original:', details.status);
          break;
      }

      // IP Address sync
      if (details.ip && details.ip !== 'pending') {
        console.log('[SMARTVPS-SYNC] Found IP address:', details.ip);
        updateData.ipAddress = details.ip;
      }

      // Username sync - check multiple possible fields
      const possibleUsernames = [
        details.username,
        details.user,
        details.login,
        details.admin_user,
        details.root_user
      ].filter(Boolean);

      if (possibleUsernames.length > 0) {
        const newUsername = possibleUsernames[0];
        console.log('[SMARTVPS-SYNC] Found username:', newUsername, 'from fields:', possibleUsernames);
        updateData.username = newUsername;
      }

      // Password sync - check multiple possible fields
      const possiblePasswords = [
        details.password,
        details.admin_password,
        details.root_password,
        details.user_password,
        details.login_password
      ].filter(Boolean);

      if (possiblePasswords.length > 0) {
        const newPassword = possiblePasswords[0];
        console.log('[SMARTVPS-SYNC] Found password from SmartVPS response');
        updateData.password = newPassword;
      }

      // OS sync - check multiple possible fields and map to standard names
      const possibleOSFields = [
        details.os,
        details.operating_system,
        details.template,
        details.os_template,
        details.distro,
        details.system
      ].filter(Boolean);

      if (possibleOSFields.length > 0) {
        const osInfo = possibleOSFields[0];
        console.log('[SMARTVPS-SYNC] Found OS info:', osInfo);

        let mappedOS = osInfo;

        // Map SmartVPS OS identifiers to our standard display names
        const osMapping = {
          '2012': 'Windows Server 2012',
          '2016': 'Windows Server 2016',
          '2019': 'Windows Server 2019',
          '2022': 'Windows Server 2022',
          '11': 'Windows 11',
          'centos': 'CentOS 7',
          'ubuntu': 'Ubuntu 22',
          'ubuntu22': 'Ubuntu 22',
          'ubuntu20': 'Ubuntu 20',
          'centos7': 'CentOS 7',
          'centos8': 'CentOS 8',
          'windows2012': 'Windows Server 2012',
          'windows2016': 'Windows Server 2016',
          'windows2019': 'Windows Server 2019',
          'windows2022': 'Windows Server 2022',
          'win11': 'Windows 11'
        };

        if (typeof osInfo === 'string') {
          const osKey = osInfo.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (osMapping[osKey]) {
            mappedOS = osMapping[osKey];
          } else if (osMapping[osInfo.toLowerCase()]) {
            mappedOS = osMapping[osInfo.toLowerCase()];
          } else {
            // If no direct mapping, try to create a readable name
            mappedOS = osInfo.charAt(0).toUpperCase() + osInfo.slice(1);
          }
        }

        updateData.os = mappedOS;
        console.log('[SMARTVPS-SYNC] Mapped OS:', osInfo, '->', mappedOS);
      }

      // Store raw server details for debugging and future reference
      updateData.serverDetails = {
        lastUpdated: new Date(),
        rawDetails: details,
        rawInfo: info
      };
      console.log('[SMARTVPS-SYNC] Added server details to update data');
    }

    console.log('[SMARTVPS-SYNC] Final update data keys:', Object.keys(updateData));
    console.log('[SMARTVPS-SYNC] Update data summary:', {
      lastSyncTime: updateData.lastSyncTime,
      provisioningStatus: updateData.provisioningStatus,
      ipAddress: updateData.ipAddress,
      username: updateData.username,
      password: updateData.password ? '[PASSWORD UPDATED]' : undefined,
      os: updateData.os,
      hasServerDetails: !!updateData.serverDetails
    });

    if (Object.keys(updateData).length > 1) { // More than just lastSyncTime
      console.log('[SMARTVPS-SYNC] Updating order in database');
      const updatedOrder = await Order.findByIdAndUpdate(orderId, updateData, { new: true });
      console.log(`[SMARTVPS-SYNC] Updated order ${orderId} with server state:`, {
        _id: updatedOrder._id,
        provisioningStatus: updatedOrder.provisioningStatus,
        ipAddress: updatedOrder.ipAddress,
        username: updatedOrder.username,
        password: updatedOrder.password ? '[PASSWORD UPDATED]' : 'null',
        os: updatedOrder.os,
        lastSyncTime: updatedOrder.lastSyncTime,
        serverDetails: updatedOrder.serverDetails ? '[Raw data stored]' : undefined
      });
    } else {
      console.log(`[SMARTVPS-SYNC] No meaningful updates for order ${orderId}`);
    }

    console.log('[SMARTVPS-SYNC] === SYNC SUCCESS ===');
    return updateData;
  } catch (error) {
    console.error('[SMARTVPS-SYNC] === SYNC ERROR ===');
    console.error('[SMARTVPS-SYNC] Error syncing server state for order', orderId, ':', error);
    console.error('[SMARTVPS-SYNC] Error type:', error.constructor.name);
    console.error('[SMARTVPS-SYNC] Error message:', error.message);
    console.error('[SMARTVPS-SYNC] Error stack:', error.stack);
    console.error('[SMARTVPS-SYNC] Details object:', details);
    console.error('[SMARTVPS-SYNC] Info object:', info);
    throw error;
  }
}


