import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { authenticateReseller } from '@/lib/resellerAuth';
const SmartVpsAPI = require('@/services/smartvpsApi');
const HostycareAPI = require('@/services/hostycareApi');

/**
 * Reseller API - Manage Server Actions
 * 
 * Allows resellers to manage their orders' VPS servers
 * 
 * POST /api/v1/reseller/orders/manage
 * 
 * Headers:
 *   X-Reseller-API-Key: <reseller_api_key>
 * 
 * Body:
 *   {
 *     "orderId": "order_id_here",
 *     "action": "start|stop|restart|status|format|changeos|sync"
 *     "osType": "ubuntu" // Required only for changeos action
 *   }
 * 
 * Supported Actions:
 *   - start: Start the VPS
 *   - stop: Stop the VPS
 *   - restart: Restart the VPS (stop + start)
 *   - status: Get current power status
 *   - format: Format/reset the VPS (SmartVPS only)
 *   - changeos: Change operating system (SmartVPS only)
 *   - sync: Sync server status with provider
 */
export async function POST(request) {
    await connectDB();

    // Authenticate reseller
    const auth = await authenticateReseller(request);
    if (!auth.success) {
        return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    const { reseller } = auth;

    try {
        const body = await request.json();
        const { orderId, action, osType } = body;

        // Validate required fields
        if (!orderId) {
            return NextResponse.json({
                success: false,
                message: 'orderId is required'
            }, { status: 400 });
        }

        if (!action) {
            return NextResponse.json({
                success: false,
                message: 'action is required. Supported: start, stop, restart, status, format, changeos, sync'
            }, { status: 400 });
        }

        // Validate action
        const validActions = ['start', 'stop', 'restart', 'status', 'format', 'changeos', 'sync'];
        if (!validActions.includes(action.toLowerCase())) {
            return NextResponse.json({
                success: false,
                message: `Invalid action. Supported actions: ${validActions.join(', ')}`
            }, { status: 400 });
        }

        // Find the order and verify ownership
        const order = await Order.findOne({
            _id: orderId,
            resellerId: reseller._id
        });

        if (!order) {
            return NextResponse.json({
                success: false,
                message: 'Order not found or you do not have permission to manage it'
            }, { status: 404 });
        }

        // Check if order is active and has an IP
        if (order.status !== 'active' && order.status !== 'confirmed') {
            return NextResponse.json({
                success: false,
                message: `Cannot manage server. Order status is: ${order.status}. Server must be active.`
            }, { status: 400 });
        }

        // Get IP address
        const ipAddress = order.ipAddress ||
            order.serverDetails?.rawDetails?.ips?.[0] ||
            order.serviceDetails?.ipAddress;

        if (!ipAddress) {
            return NextResponse.json({
                success: false,
                message: 'No IP address found for this order. Server may not be provisioned yet.'
            }, { status: 400 });
        }

        console.log(`[RESELLER-MANAGE] Reseller ${reseller._id} executing ${action} on order ${orderId} (IP: ${ipAddress})`);

        // Detect provider
        const isSmartVps = order.provider === 'smartvps' ||
            order.smartvpsDetails?.ip ||
            (order.productName && order.productName.includes('🌊'));

        let result;

        if (isSmartVps) {
            // Use SmartVPS API
            const smartvpsApi = new SmartVpsAPI();
            result = await executeSmartVpsAction(smartvpsApi, action, ipAddress, osType);
        } else {
            // Use Hostycare API
            if (!order.hostycareServiceId) {
                return NextResponse.json({
                    success: false,
                    message: 'This order does not have a valid service ID for management'
                }, { status: 400 });
            }
            const hostycareApi = new HostycareAPI();
            result = await executeHostycareAction(hostycareApi, action, order.hostycareServiceId, ipAddress);
        }

        // Log the action
        await Order.findByIdAndUpdate(orderId, {
            $push: {
                logs: {
                    action: `reseller_${action}`,
                    timestamp: new Date(),
                    details: `Reseller API: ${action} executed by reseller ${reseller._id}`,
                    success: result.success
                }
            }
        });

        return NextResponse.json({
            success: result.success,
            action: action,
            orderId: orderId,
            ipAddress: ipAddress,
            message: result.message,
            data: result.data || null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[RESELLER-MANAGE] Error:', error);
        return NextResponse.json({
            success: false,
            message: error.message || 'Server action failed'
        }, { status: 500 });
    }
}

/**
 * Execute action using SmartVPS API
 */
async function executeSmartVpsAction(api, action, ipAddress, osType) {
    try {
        switch (action.toLowerCase()) {
            case 'start': {
                const res = await api.start(ipAddress);
                return { success: true, message: 'Start command sent', data: res };
            }

            case 'stop': {
                const res = await api.stop(ipAddress);
                return { success: true, message: 'Stop command sent', data: res };
            }

            case 'restart': {
                await api.stop(ipAddress);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
                const res = await api.start(ipAddress);
                return { success: true, message: 'Restart command sent (stop + start)', data: res };
            }

            case 'status': {
                const res = await api.status(ipAddress);
                let powerState = 'unknown';

                // Parse response
                if (res) {
                    const statusStr = String(res.status || res.state || res.power || res).toLowerCase();
                    if (['online', 'running', 'active', 'started', 'on', '1'].includes(statusStr)) {
                        powerState = 'running';
                    } else if (['offline', 'stopped', 'inactive', 'off', '0', 'shutdown'].includes(statusStr)) {
                        powerState = 'stopped';
                    } else {
                        powerState = statusStr;
                    }
                }

                return {
                    success: true,
                    message: 'Status retrieved',
                    data: { powerState, raw: res }
                };
            }

            case 'format': {
                const res = await api.format(ipAddress);
                return { success: true, message: 'Format command sent. Server will be reset.', data: res };
            }

            case 'changeos': {
                if (!osType) {
                    return {
                        success: false,
                        message: 'osType is required for changeos action. Valid options: ubuntu, centos, 2012, 2016, 2019, 2022, 11'
                    };
                }
                const res = await api.changeOS(ipAddress, osType);
                return { success: true, message: `OS change to ${osType} initiated`, data: res };
            }

            case 'sync': {
                const res = await api.status(ipAddress);
                return { success: true, message: 'Server status synced', data: res };
            }

            default:
                return { success: false, message: `Action ${action} not supported for SmartVPS` };
        }
    } catch (error) {
        console.error(`[RESELLER-MANAGE] SmartVPS ${action} error:`, error);
        return { success: false, message: error.message };
    }
}

/**
 * Execute action using Hostycare API
 */
async function executeHostycareAction(api, action, serviceId, ipAddress) {
    try {
        switch (action.toLowerCase()) {
            case 'start': {
                const res = await api.startService(serviceId);
                return { success: true, message: 'Start command sent', data: res };
            }

            case 'stop': {
                const res = await api.stopService(serviceId);
                return { success: true, message: 'Stop command sent', data: res };
            }

            case 'restart': {
                const res = await api.rebootService(serviceId);
                return { success: true, message: 'Restart command sent', data: res };
            }

            case 'status': {
                const serviceInfo = await api.getServiceInfo(serviceId);
                let powerState = 'unknown';

                if (serviceInfo) {
                    const statusStr = String(
                        serviceInfo.status ||
                        serviceInfo.state ||
                        serviceInfo.power_status ||
                        serviceInfo.vps_status ||
                        ''
                    ).toLowerCase();

                    if (['online', 'running', 'active', 'started', 'on', '1', 'true'].includes(statusStr)) {
                        powerState = 'running';
                    } else if (['offline', 'stopped', 'inactive', 'off', '0', 'false', 'shutdown'].includes(statusStr)) {
                        powerState = 'stopped';
                    } else {
                        powerState = statusStr || 'unknown';
                    }
                }

                return {
                    success: true,
                    message: 'Status retrieved',
                    data: { powerState, serviceInfo }
                };
            }

            case 'sync': {
                const serviceInfo = await api.getServiceInfo(serviceId);
                const serviceDetails = await api.getServiceDetails(serviceId);
                return {
                    success: true,
                    message: 'Server status synced',
                    data: { serviceInfo, serviceDetails }
                };
            }

            case 'format':
            case 'changeos':
                return {
                    success: false,
                    message: `Action ${action} is only available for SmartVPS/OceanLinux products`
                };

            default:
                return { success: false, message: `Action ${action} not supported for Hostycare` };
        }
    } catch (error) {
        console.error(`[RESELLER-MANAGE] Hostycare ${action} error:`, error);
        return { success: false, message: error.message };
    }
}

/**
 * GET - List available actions and their descriptions
 */
export async function GET(request) {
    await connectDB();

    const auth = await authenticateReseller(request);
    if (!auth.success) {
        return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    return NextResponse.json({
        success: true,
        message: 'Reseller Server Management API',
        availableActions: {
            start: {
                description: 'Start the VPS server',
                method: 'POST',
                body: { orderId: 'required', action: 'start' }
            },
            stop: {
                description: 'Stop the VPS server',
                method: 'POST',
                body: { orderId: 'required', action: 'stop' }
            },
            restart: {
                description: 'Restart the VPS server',
                method: 'POST',
                body: { orderId: 'required', action: 'restart' }
            },
            status: {
                description: 'Get current power status of the VPS',
                method: 'POST',
                body: { orderId: 'required', action: 'status' }
            },
            format: {
                description: 'Format/reset the VPS (SmartVPS/OceanLinux only)',
                method: 'POST',
                body: { orderId: 'required', action: 'format' }
            },
            changeos: {
                description: 'Change operating system (SmartVPS/OceanLinux only)',
                method: 'POST',
                body: { orderId: 'required', action: 'changeos', osType: 'ubuntu|centos|2012|2016|2019|2022|11' }
            },
            sync: {
                description: 'Sync server status from provider',
                method: 'POST',
                body: { orderId: 'required', action: 'sync' }
            }
        },
        example: {
            curl: `curl -X POST "https://your-domain.com/api/v1/reseller/orders/manage" \\
  -H "X-Reseller-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"orderId": "ORDER_ID", "action": "status"}'`
        }
    });
}
