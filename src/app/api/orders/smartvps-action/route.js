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
            'ubuntu': 'Ubuntu 22',
            '2025': 'Windows 2025', // New addition
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

      case 'status':
        console.log('[SMARTVPS-ACTION][POST] Fetching power status for:', serviceIdentifier);
        try {
          const statusData = await api.status(serviceIdentifier);
          
          // Parse the response - SmartVPS returns a JSON string
          const parsedStatusData = parseSmartVPSResponse(statusData, 'status');
          
          // SmartVPS exact fields:
          // - PowerStatus: "Online" | "Offline" - ACTUAL power state (use this!)
          // - MachineStatus: "active" | etc - VPS exists in system (not power state)
          // - ActionStatus: "completed" | "pending" - last action status
          const { PowerStatus, MachineStatus, ActionStatus } = parsedStatusData;
          
          console.log('[SMARTVPS-ACTION][POST] SmartVPS Status:', { PowerStatus, MachineStatus, ActionStatus });

          // PowerStatus is the REAL power indicator
          let powerState = 'unknown';
          const powerStatusLower = (PowerStatus || '').toLowerCase();
          
          if (powerStatusLower === 'online') {
            powerState = 'running';
          } else if (powerStatusLower === 'offline') {
            powerState = 'stopped';
          } else if (ActionStatus?.toLowerCase() === 'pending') {
            powerState = 'busy';
          }

          console.log('[SMARTVPS-ACTION][POST] Power state:', powerState, '(from PowerStatus:', PowerStatus, ')');

          // Sync to database (don't await to speed up response)
          const extractedCreds = extractSmartVPSCredentials(parsedStatusData, order);
          const details = {
            id: serviceIdentifier,
            ip: extractedCreds.ip || serviceIdentifier,
            status: powerState === 'running' ? 'active' : powerState === 'stopped' ? 'suspended' : MachineStatus,
            username: extractedCreds.username,
            password: extractedCreds.password,
            os: extractedCreds.os,
            ...parsedStatusData
          };
          
          // Fire and forget - don't block response
          syncServerState(orderId, details, details).catch(e => 
            console.error('[SMARTVPS-ACTION][POST] Background sync error:', e.message)
          );

          return NextResponse.json({
            success: true,
            powerState,
            powerStatus: PowerStatus,
            machineStatus: MachineStatus,
            actionStatus: ActionStatus,
            lastSync: new Date().toISOString()
          });
        } catch (error) {
          console.error('[SMARTVPS-ACTION][POST] Power status fetch error:', error.message);
          return NextResponse.json({
            success: false,
            error: error.message,
            powerState: 'unknown'
          });
        }

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
// Helper function to extract credentials from parsed SmartVPS response
function extractSmartVPSCredentials(parsedResponse, order) {
  console.log(`[SMARTVPS-EXTRACT] === CREDENTIAL EXTRACTION START ===`);
  console.log(`[SMARTVPS-EXTRACT] Parsing response for credential extraction`);
  console.log(`[SMARTVPS-EXTRACT] Parsed response type:`, typeof parsedResponse);
  console.log(`[SMARTVPS-EXTRACT] Parsed response keys:`, Object.keys(parsedResponse || {}));

  // 🔍 LOG THE ENTIRE PARSED RESPONSE FOR DEBUGGING
  console.log(`[SMARTVPS-EXTRACT] === FULL PARSED RESPONSE ===`);
  console.log(`[SMARTVPS-EXTRACT] Complete response object:`, JSON.stringify(parsedResponse, null, 2));
  console.log(`[SMARTVPS-EXTRACT] === END FULL RESPONSE ===`);

  // Log all possible username fields INCLUDING THE TYPO
  console.log(`[SMARTVPS-EXTRACT] All possible username fields:`, {
    Username: parsedResponse?.Username,
    username: parsedResponse?.username,
    Usernane: parsedResponse?.Usernane, // 🔧 TYPO FIELD FROM SMARTVPS
    User: parsedResponse?.User,
    user: parsedResponse?.user,
    login: parsedResponse?.login,
    Login: parsedResponse?.Login,
    admin_user: parsedResponse?.admin_user,
    AdminUser: parsedResponse?.AdminUser,
    root_user: parsedResponse?.root_user,
    RootUser: parsedResponse?.RootUser,
    user_name: parsedResponse?.user_name,
    UserName: parsedResponse?.UserName,
    loginName: parsedResponse?.loginName,
    LoginName: parsedResponse?.LoginName,
    account: parsedResponse?.account,
    Account: parsedResponse?.Account,
    admin: parsedResponse?.admin,
    Admin: parsedResponse?.Admin
  });

  const extracted = {
    // SmartVPS uses capitalized field names in status responses
    ip: parsedResponse?.IP || parsedResponse?.ip || order.ipAddress,

    // Extract raw username from SmartVPS response - FIXED WITH TYPO FIELD
    rawUsername: parsedResponse?.Username ||
                parsedResponse?.username ||
                parsedResponse?.Usernane || // 🔧 SMARTVPS TYPO FIELD
                parsedResponse?.User ||
                parsedResponse?.user ||
                parsedResponse?.Login ||
                parsedResponse?.login ||
                parsedResponse?.AdminUser ||
                parsedResponse?.admin_user ||
                parsedResponse?.RootUser ||
                parsedResponse?.root_user ||
                parsedResponse?.UserName ||
                parsedResponse?.user_name ||
                parsedResponse?.LoginName ||
                parsedResponse?.loginName ||
                parsedResponse?.Account ||
                parsedResponse?.account ||
                parsedResponse?.Admin ||
                parsedResponse?.admin ||
                order.username,

    // Try ALL possible password field variations
    password: parsedResponse?.Password ||
             parsedResponse?.password ||
             parsedResponse?.AdminPassword ||
             parsedResponse?.admin_password ||
             parsedResponse?.RootPassword ||
             parsedResponse?.root_password ||
             parsedResponse?.UserPassword ||
             parsedResponse?.user_password ||
             parsedResponse?.LoginPassword ||
             parsedResponse?.login_password ||
             parsedResponse?.Pass ||
             parsedResponse?.pass ||
             parsedResponse?.PWD ||
             parsedResponse?.pwd ||
             order.password,

    // Try ALL possible OS field variations
    os: parsedResponse?.OS ||
        parsedResponse?.os ||
        parsedResponse?.OperatingSystem ||
        parsedResponse?.operating_system ||
        parsedResponse?.Template ||
        parsedResponse?.template ||
        parsedResponse?.OSTemplate ||
        parsedResponse?.os_template ||
        parsedResponse?.Distro ||
        parsedResponse?.distro ||
        parsedResponse?.System ||
        parsedResponse?.system ||
        parsedResponse?.OSName ||
        parsedResponse?.os_name ||
        parsedResponse?.operating_system_name ||
        order.os,

    status: parsedResponse?.MachineStatus || parsedResponse?.PowerStatus || parsedResponse?.ActionStatus || parsedResponse?.status,
    ram: parsedResponse?.RAM || parsedResponse?.ram,
    expiryDate: parsedResponse?.ExpiryDate || parsedResponse?.expiryDate
  };

  // 🔧 SPECIAL LOGIC: Determine correct username based on ACTUAL OS FROM SMARTVPS
  console.log(`[SMARTVPS-EXTRACT] === USERNAME OS-BASED LOGIC ===`);
  console.log(`[SMARTVPS-EXTRACT] Extracted OS from SmartVPS:`, extracted.os);
  console.log(`[SMARTVPS-EXTRACT] Order OS (for reference):`, order.os);
  console.log(`[SMARTVPS-EXTRACT] Raw username from SmartVPS:`, extracted.rawUsername);
  console.log(`[SMARTVPS-EXTRACT] Current username in order:`, order.username);

  // Use the ACTUAL OS from SmartVPS, not the order OS
  const actualOS = extracted.os || order.os;
  const osLower = (actualOS || '').toLowerCase();
  const isLinux = osLower.includes('ubuntu') || osLower.includes('centos') || osLower.includes('linux');
  const isWindows = osLower.includes('windows') || osLower.includes('win');

  console.log(`[SMARTVPS-EXTRACT] OS Analysis:`, {
    actualOSFromSmartVPS: extracted.os,
    orderOS: order.os,
    osForAnalysis: actualOS,
    osLower: osLower,
    containsUbuntu: osLower.includes('ubuntu'),
    containsCentos: osLower.includes('centos'),
    containsLinux: osLower.includes('linux'),
    containsWindows: osLower.includes('windows'),
    isLinuxDetected: isLinux,
    isWindowsDetected: isWindows
  });

  if (isLinux) {
    console.log(`[SMARTVPS-EXTRACT] ✅ Linux OS detected (${actualOS}) - setting username to 'root'`);
    extracted.username = 'root';
    extracted.usernameSource = 'Linux OS Rule';
    extracted.usernameReason = `OS contains linux identifier: ${osLower}`;
  } else if (isWindows) {
    console.log(`[SMARTVPS-EXTRACT] ✅ Windows OS detected (${actualOS}) - using username from SmartVPS`);
    extracted.username = extracted.rawUsername;
    extracted.usernameSource = extracted.rawUsername === order.username ? 'Order Document' : 'SmartVPS API';
    extracted.usernameReason = `Windows OS detected, using SmartVPS username: ${extracted.rawUsername}`;
  } else {
    console.log(`[SMARTVPS-EXTRACT] ⚠️ Unknown OS detected (${actualOS}) - using username from SmartVPS`);
    extracted.username = extracted.rawUsername;
    extracted.usernameSource = extracted.rawUsername === order.username ? 'Order Document' : 'SmartVPS API';
    extracted.usernameReason = `Unknown OS, using SmartVPS username: ${extracted.rawUsername}`;
  }

  console.log(`[SMARTVPS-EXTRACT] === EXTRACTION RESULTS ===`);
  console.log(`[SMARTVPS-EXTRACT] Extracted credentials:`, {
    ip: extracted.ip,
    username: extracted.username,
    usernameSource: extracted.usernameSource,
    usernameReason: extracted.usernameReason,
    rawUsernameFromSmartVPS: extracted.rawUsername,
    password: extracted.password ? '[EXTRACTED PASSWORD]' : 'no password found',
    os: extracted.os,
    actualOSUsed: actualOS,
    isLinuxOS: isLinux,
    isWindowsOS: isWindows,
    status: extracted.status,
    ram: extracted.ram,
    expiryDate: extracted.expiryDate
  });

  console.log(`[SMARTVPS-EXTRACT] Source comparison:`, {
    username: {
      final: extracted.username,
      rawFromSmartVPS: extracted.rawUsername,
      fromOrder: order.username,
      source: extracted.usernameSource,
      osBasedRule: isLinux ? 'Applied (Linux -> root)' : isWindows ? 'Applied (Windows -> use SmartVPS)' : 'Unknown OS',
      willUpdate: extracted.username !== order.username
    },
    password: {
      hasExtracted: !!extracted.password,
      fromOrder: !!order.password,
      isFromSmartVPS: extracted.password !== order.password,
      source: extracted.password === order.password ? 'Order Document' : 'SmartVPS API',
      willUpdate: extracted.password !== order.password
    },
    os: {
      extracted: extracted.os,
      fromOrder: order.os,
      isFromSmartVPS: extracted.os !== order.os,
      source: extracted.os === order.os ? 'Order Document' : 'SmartVPS API',
      willUpdate: extracted.os !== order.os
    }
  });

  console.log(`[SMARTVPS-EXTRACT] === CREDENTIAL EXTRACTION END ===`);
  return extracted;
}

// ... rest of the existing code stays the same ...
// Also update the syncServerState function to handle the username logic properly
async function syncServerState(orderId, details, info) {
  console.log('[SMARTVPS-SYNC] === SYNC START ===');
  console.log('[SMARTVPS-SYNC] Order ID:', orderId);
  console.log('[SMARTVPS-SYNC] Details received:', details ? '[Details object present]' : null);

  try {
    // Get the current order to compare against
    const currentOrder = await Order.findById(orderId);
    if (!currentOrder) {
      throw new Error('Order not found for sync');
    }

    console.log('[SMARTVPS-SYNC] Current order credentials:', {
      username: currentOrder.username,
      password: currentOrder.password ? '[PASSWORD SET]' : 'no password',
      os: currentOrder.os
    });

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
        usernameSource: details.usernameSource,
        password: details.password ? '[PASSWORD PRESENT]' : 'null',
        os: details.os,
        ip: details.ip
      });

      // Status mapping (unchanged)
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

      // IP Address sync (unchanged)
      if (details.ip && details.ip !== 'pending') {
        console.log('[SMARTVPS-SYNC] Found IP address:', details.ip);
        updateData.ipAddress = details.ip;
      }

      // Username sync - enhanced with OS-based logic and FORCED UPDATE for Linux systems
      console.log('[SMARTVPS-SYNC] === USERNAME SYNC ===');
      console.log('[SMARTVPS-SYNC] Username from details:', details.username);
      console.log('[SMARTVPS-SYNC] Username source:', details.usernameSource);
      console.log('[SMARTVPS-SYNC] Current username in order:', currentOrder.username);

      // Determine the correct username based on OS
      const currentOS = details.os || currentOrder.os;
      const osLower = (currentOS || '').toLowerCase();
      const isLinux = osLower.includes('ubuntu') || osLower.includes('centos');

      console.log('[SMARTVPS-SYNC] OS analysis:', {
        currentOS: currentOS,
        osLower: osLower,
        isLinux: isLinux
      });

      let correctUsername;
      let usernameUpdateReason;

      if (isLinux) {
        // For Linux systems, username should ALWAYS be root
        correctUsername = 'root';
        usernameUpdateReason = 'Linux OS Rule (Ubuntu/CentOS -> root)';
        console.log('[SMARTVPS-SYNC] Linux OS detected - setting username to root');
      } else {
        // For non-Linux systems, use the username from SmartVPS API
        correctUsername = details.username || currentOrder.username;
        usernameUpdateReason = details.username ? 'SmartVPS API Response' : 'No Change';
        console.log('[SMARTVPS-SYNC] Non-Linux OS detected - using SmartVPS username');
      }

      console.log('[SMARTVPS-SYNC] Username determination result:', {
        correctUsername: correctUsername,
        currentUsername: currentOrder.username,
        needsUpdate: correctUsername !== currentOrder.username,
        updateReason: usernameUpdateReason
      });

      // Always update username if it doesn't match the correct value
      if (correctUsername && correctUsername !== currentOrder.username) {
        console.log('[SMARTVPS-SYNC] ✅ Username update needed:');
        console.log('[SMARTVPS-SYNC] Current username:', currentOrder.username);
        console.log('[SMARTVPS-SYNC] Correct username:', correctUsername);
        console.log('[SMARTVPS-SYNC] Update reason:', usernameUpdateReason);
        updateData.username = correctUsername;
      } else if (correctUsername === currentOrder.username) {
        console.log('[SMARTVPS-SYNC] Username already correct:', correctUsername);
      } else {
        console.log('[SMARTVPS-SYNC] No valid username found, keeping current:', currentOrder.username);
      }

      // Password sync - enhanced with better comparison
      console.log('[SMARTVPS-SYNC] === PASSWORD SYNC ===');
      if (details.password && details.password !== currentOrder.password) {
        console.log('[SMARTVPS-SYNC] ✅ Password update detected (passwords differ)');
        console.log('[SMARTVPS-SYNC] Password source: SmartVPS API');
        updateData.password = details.password;
      } else if (details.password === currentOrder.password) {
        console.log('[SMARTVPS-SYNC] Password unchanged (same as current)');
      } else {
        console.log('[SMARTVPS-SYNC] No password in SmartVPS response, keeping current');
      }

      // OS sync - enhanced with better comparison
      console.log('[SMARTVPS-SYNC] === OS SYNC ===');
      if (details.os && details.os !== currentOrder.os) {
        console.log('[SMARTVPS-SYNC] ✅ OS update detected:');
        console.log('[SMARTVPS-SYNC] Current OS:', currentOrder.os);
        console.log('[SMARTVPS-SYNC] New OS:', details.os);

        let mappedOS = details.os;

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

        if (typeof details.os === 'string') {
          const osKey = details.os.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (osMapping[osKey]) {
            mappedOS = osMapping[osKey];
          } else if (osMapping[details.os.toLowerCase()]) {
            mappedOS = osMapping[details.os.toLowerCase()];
          } else {
            // If no direct mapping, use the OS as-is (it might already be properly formatted)
            mappedOS = details.os;
          }
        }

        updateData.os = mappedOS;
        console.log('[SMARTVPS-SYNC] Mapped OS:', details.os, '->', mappedOS);
      } else if (details.os === currentOrder.os) {
        console.log('[SMARTVPS-SYNC] OS unchanged:', details.os);

        // Even if OS is unchanged, we still need to check if username is correct for the OS
        if (isLinux && currentOrder.username !== 'root') {
          console.log('[SMARTVPS-SYNC] 🔧 OS unchanged but username correction needed for Linux');
          console.log('[SMARTVPS-SYNC] Current OS is Linux but username is not root');
          if (!updateData.username) {
            updateData.username = 'root';
            console.log('[SMARTVPS-SYNC] ✅ Correcting username to root for Linux OS');
          }
        }
      } else {
        console.log('[SMARTVPS-SYNC] No OS in SmartVPS response, using current:', currentOrder.os);

        // Check if username is correct for current OS
        if (isLinux && currentOrder.username !== 'root') {
          console.log('[SMARTVPS-SYNC] 🔧 No OS update but username correction needed for existing Linux OS');
          if (!updateData.username) {
            updateData.username = 'root';
            console.log('[SMARTVPS-SYNC] ✅ Correcting username to root for existing Linux OS');
          }
        }
      }

      // Store raw server details for debugging and future reference
      updateData.serverDetails = {
        lastUpdated: new Date(),
        rawDetails: details,
        rawInfo: info,
        usernameLogic: {
          detectedOS: currentOS,
          isLinux: isLinux,
          correctUsername: correctUsername,
          usernameUpdateReason: usernameUpdateReason
        }
      };
      console.log('[SMARTVPS-SYNC] Added server details to update data');
    }

    console.log('[SMARTVPS-SYNC] Final update data keys:', Object.keys(updateData));
    console.log('[SMARTVPS-SYNC] Update data summary:', {
      lastSyncTime: updateData.lastSyncTime,
      provisioningStatus: updateData.provisioningStatus,
      ipAddress: updateData.ipAddress,
      username: updateData.username ? `${updateData.username} (UPDATED)` : 'unchanged',
      password: updateData.password ? '[PASSWORD UPDATED]' : 'unchanged',
      os: updateData.os ? `${updateData.os} (UPDATED)` : 'unchanged',
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
        lastSyncTime: updatedOrder.lastSyncTime
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
    throw error;
  }
}

// ... rest of the existing code stays the same ...
// ... rest of the existing code stays the same ...

// ... rest of the existing code stays the same ...

