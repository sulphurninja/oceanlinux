import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AutoProvisioningService = require('@/services/autoProvisioningService');

// Configuration
const CONFIG = {
    maxRetries: 3,
    retryDelayMs: 5000, // 5 seconds between retries
    maxProcessingTime: 540000, // 9 minutes (AWS Lambda 15min limit buffer)
    lockTimeoutMs: 1200000, // 20 minutes - if a lock is older than this, consider it stale
    retryableErrors: [
        'Password strength should not be less than 100',
        'The following IP(s) are used by another VPS',
        'Service temporarily unavailable',
        'Connection timeout',
        'API rate limit',
        'Server is busy'
    ]
};

// Helper: Check if error is retryable
function isRetryableError(errorMessage) {
    return CONFIG.retryableErrors.some(retryableError =>
        errorMessage.toLowerCase().includes(retryableError.toLowerCase())
    );
}

// Helper: Sleep/delay function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Try to acquire a database lock by marking an order as 'provisioning'
async function acquireDatabaseLock() {
    try {
        // Find an order that needs provisioning and atomically set it to 'provisioning'
        const result = await Order.findOneAndUpdate(
            {
                $and: [
                    { status: 'confirmed' },
                    {
                        $or: [
                            { autoProvisioned: { $ne: true } },
                            { autoProvisioned: { $exists: false } },
                            {
                                $and: [
                                    { autoProvisioned: true },
                                    { provisioningStatus: 'failed' }
                                ]
                            }
                        ]
                    },
                    {
                        $or: [
                            { provisioningStatus: { $ne: 'provisioning' } },
                            { provisioningStatus: { $exists: false } },
                            // Also include stale locks (older than 20 minutes)
                            {
                                $and: [
                                    { provisioningStatus: 'provisioning' },
                                    { updatedAt: { $lt: new Date(Date.now() - CONFIG.lockTimeoutMs) } }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                provisioningStatus: 'provisioning',
                autoProvisioned: true,
                provisioningError: 'CRON: Processing...'
            },
            {
                new: false, // Return the document before update
                sort: { createdAt: 1 } // Oldest first
            }
        );

        return result; // Returns the order if lock acquired, null if no orders available
    } catch (error) {
        console.error('[LOCK] Error acquiring database lock:', error);
        return null;
    }
}

// Helper: Release database lock by updating order status
async function releaseDatabaseLock(orderId, finalStatus, error = '') {
    try {
        const updateData = {
            provisioningStatus: finalStatus,
            provisioningError: error
        };

        await Order.findByIdAndUpdate(orderId, updateData);
        console.log(`[LOCK] Released lock for order ${orderId} with status: ${finalStatus}`);
    } catch (updateError) {
        console.error(`[LOCK] Error releasing lock for order ${orderId}:`, updateError);
    }
}

// Helper: Validate order has proper configuration
async function validateOrderConfiguration(order) {
    try {
        const IPStock = require('@/models/ipStockModel');
        
        // Find IPStock for this order's product
        let ipStock;
        
        if (order.ipStockId) {
            ipStock = await IPStock.findById(order.ipStockId);
        } else {
            ipStock = await IPStock.findOne({
                name: { $regex: new RegExp(order.productName, 'i') }
            });
        }
        
        if (!ipStock) {
            return { valid: false, reason: `No IPStock found for product: ${order.productName}` };
        }
        
        // Check if memory config exists and has hostycareProductId
        let memoryOptions = {};
        
        if (ipStock.memoryOptions) {
            if (ipStock.memoryOptions instanceof Map) {
                memoryOptions = Object.fromEntries(ipStock.memoryOptions.entries());
            } else if (typeof ipStock.memoryOptions.toObject === 'function') {
                memoryOptions = ipStock.memoryOptions.toObject();
            } else if (typeof ipStock.memoryOptions === 'object') {
                memoryOptions = JSON.parse(JSON.stringify(ipStock.memoryOptions));
            }
        }
        
        const memoryConfig = memoryOptions[order.memory];
        const productId = memoryConfig?.hostycareProductId || memoryConfig?.productId;
        
        if (!productId) {
            return { 
                valid: false, 
                reason: `No hostycareProductId for ${order.memory} in ${ipStock.name}` 
            };
        }
        
        return { valid: true, productId, ipStock: ipStock.name };
        
    } catch (error) {
        return { valid: false, reason: `Configuration error: ${error.message}` };
    }
}

// Main auto-provisioning cron endpoint - DATABASE LOCK VERSION
export async function POST(request) {
    const startTime = Date.now();
    const cronId = Math.random().toString(36).substring(2, 8); // Random ID for this cron execution
    
    console.log("\n" + "🤖".repeat(80));
    console.log(`[CRON-${cronId}] 🤖 STARTING ONE-BY-ONE PROVISIONING (2min interval safe)`);
    console.log(`[CRON-${cronId}] ⏰ Start time: ${new Date().toISOString()}`);
    console.log("🤖".repeat(80));

    try {
        await connectDB();
        console.log(`[CRON-${cronId}] ✅ Database connected`);

        // STEP 1: Try to acquire a database lock on a single order
        console.log(`[CRON-${cronId}] 🔒 STEP 1: Attempting to acquire database lock...`);
        
        const lockedOrder = await acquireDatabaseLock();
        
        if (!lockedOrder) {
            console.log(`[CRON-${cronId}] ⏸️ No orders available for provisioning or all are locked`);
            return NextResponse.json({
                success: true,
                message: 'No orders available for provisioning (all locked or none pending)',
                processed: 0,
                cronId,
                timestamp: new Date().toISOString()
            });
        }

        console.log(`[CRON-${cronId}] 🔓 Lock acquired for order: ${lockedOrder._id}`);
        console.log(`[CRON-${cronId}] 📦 Product: ${lockedOrder.productName}`);
        console.log(`[CRON-${cronId}] 💾 Memory: ${lockedOrder.memory}`);
        console.log(`[CRON-${cronId}] 💰 Price: ₹${lockedOrder.price}`);

        // STEP 2: Validate order configuration
        console.log(`[CRON-${cronId}] ✅ STEP 2: Validating order configuration...`);
        
        const configValidation = await validateOrderConfiguration(lockedOrder);
        
        if (!configValidation.valid) {
            console.log(`[CRON-${cronId}] ❌ Order configuration invalid: ${configValidation.reason}`);
            
            // Release lock with failed status
            await releaseDatabaseLock(lockedOrder._id, 'failed', `CRON: ${configValidation.reason}`);
            
            return NextResponse.json({
                success: false,
                message: `Order ${lockedOrder._id} has invalid configuration: ${configValidation.reason}`,
                orderId: lockedOrder._id.toString(),
                error: configValidation.reason,
                cronId,
                timestamp: new Date().toISOString()
            });
        }

        console.log(`[CRON-${cronId}] ✅ Configuration valid - Product ID: ${configValidation.productId}`);

        // STEP 3: Process the locked order with retry logic
        console.log(`[CRON-${cronId}] 🚀 STEP 3: Processing locked order...`);

        const provisioningService = new AutoProvisioningService();
        let totalRetries = 0;
        let result = null;

        const orderStartTime = Date.now();
        let attempt = 1;
        let success = false;
        let lastError = null;

        // Retry loop for this single order
        while (attempt <= CONFIG.maxRetries && !success) {
            // Check if we're running out of time
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime > CONFIG.maxProcessingTime) {
                console.log(`[CRON-${cronId}] ⏰ Approaching time limit, stopping processing`);
                lastError = new Error('Processing time limit reached');
                break;
            }

            try {
                console.log(`[CRON-${cronId}] 🚀 Attempt ${attempt}/${CONFIG.maxRetries}`);

                const provisionResult = await provisioningService.provisionServer(lockedOrder._id.toString());

                if (provisionResult.success) {
                    success = true;
                    const orderTime = Date.now() - orderStartTime;
                    console.log(`[CRON-${cronId}] ✅ Order provisioned successfully in ${orderTime}ms`);

                    result = {
                        orderId: lockedOrder._id.toString(),
                        success: true,
                        attempts: attempt,
                        processingTime: orderTime,
                        serviceId: provisionResult.serviceId,
                        ipAddress: provisionResult.ipAddress
                    };

                    // Release lock with success - the provisionServer already updates the order
                    // So we don't need to call releaseDatabaseLock here
                    
                } else {
                    throw new Error(provisionResult.error || 'Unknown provisioning error');
                }

            } catch (error) {
                lastError = error;
                console.error(`[CRON-${cronId}] ❌ Attempt ${attempt} failed:`, error.message);

                // Check if error is retryable
                if (attempt < CONFIG.maxRetries && isRetryableError(error.message)) {
                    console.log(`[CRON-${cronId}] 🔄 Error is retryable, waiting ${CONFIG.retryDelayMs}ms...`);
                    await sleep(CONFIG.retryDelayMs);
                    attempt++;
                    totalRetries++;
                } else {
                    // Max retries reached or non-retryable error
                    const orderTime = Date.now() - orderStartTime;
                    console.error(`[CRON-${cronId}] 💥 Order failed permanently after ${attempt} attempts`);

                    result = {
                        orderId: lockedOrder._id.toString(),
                        success: false,
                        attempts: attempt,
                        processingTime: orderTime,
                        error: error.message,
                        retryable: isRetryableError(error.message)
                    };

                    // Release lock with failed status
                    await releaseDatabaseLock(
                        lockedOrder._id, 
                        'failed', 
                        `CRON: ${error.message}`
                    );
                    break;
                }
            }
        }

        // Handle timeout case
        if (!success && !result) {
            const orderTime = Date.now() - orderStartTime;
            result = {
                orderId: lockedOrder._id.toString(),
                success: false,
                attempts: attempt,
                processingTime: orderTime,
                error: lastError?.message || 'Processing timeout',
                retryable: false
            };

            await releaseDatabaseLock(
                lockedOrder._id, 
                'failed', 
                `CRON: Processing timeout after ${attempt} attempts`
            );
        }
        
        // STEP 4: Generate summary
        const totalTime = Date.now() - startTime;
        const summary = {
            successful: result?.success ? 1 : 0,
            failed: result?.success ? 0 : 1,
            retries: totalRetries,
            totalTime,
            processed: 1
        };

        console.log("\n" + "🎯".repeat(80));
        console.log(`[CRON-${cronId}] 🎯 PROCESSING COMPLETED`);
        console.log(`   - Order: ${lockedOrder._id}`);
        console.log(`   - Result: ${result?.success ? 'SUCCESS' : 'FAILED'}`);
        console.log(`   - Attempts: ${result?.attempts || 0}`);
        console.log(`   - Total retries: ${summary.retries}`);
        console.log(`   - Processing time: ${result?.processingTime || 0}ms`);
        console.log(`   - Total time: ${summary.totalTime}ms`);
        if (!result?.success) {
            console.log(`   - Error: ${result?.error}`);
        }
        console.log("🎯".repeat(80));

        return NextResponse.json({
            success: true,
            message: result?.success 
                ? `Successfully provisioned order ${lockedOrder._id}` 
                : `Failed to provision order ${lockedOrder._id}: ${result?.error}`,
            summary,
            result,
            cronId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error("\n" + "💥".repeat(80));
        console.error(`[CRON-${cronId}] 💥 CRON JOB FAILED:`, error);
        console.error(`   - Error: ${error.message}`);
        console.error(`   - Time elapsed: ${totalTime}ms`);
        console.error("💥".repeat(80));

        return NextResponse.json({
            success: false,
            error: error.message,
            totalTime,
            cronId,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

// GET endpoint for status/health check - UPDATED
export async function GET(request) {
    try {
        await connectDB();

        // Get statistics
        const totalOrders = await Order.countDocuments();
        const confirmedOrders = await Order.countDocuments({ status: 'confirmed' });
        
        const pendingProvisioning = await Order.countDocuments({
            $and: [
                { status: 'confirmed' },
                {
                    $or: [
                        { autoProvisioned: { $ne: true } },
                        { autoProvisioned: { $exists: false } },
                        {
                            $and: [
                                { autoProvisioned: true },
                                { provisioningStatus: 'failed' }
                            ]
                        }
                    ]
                },
                {
                    $or: [
                        { provisioningStatus: { $ne: 'provisioning' } },
                        { provisioningStatus: { $exists: false } }
                    ]
                }
            ]
        });

        const currentlyProvisioning = await Order.countDocuments({
            provisioningStatus: 'provisioning'
        });

        const activeProvisioned = await Order.countDocuments({
            autoProvisioned: true,
            provisioningStatus: 'active'
        });

        const failedProvisioning = await Order.countDocuments({
            autoProvisioned: true,
            provisioningStatus: 'failed'
        });

        // Check for stale locks (provisioning status older than 20 minutes)
        const staleLocks = await Order.countDocuments({
            provisioningStatus: 'provisioning',
            updatedAt: { $lt: new Date(Date.now() - CONFIG.lockTimeoutMs) }
        });

        return NextResponse.json({
            success: true,
            status: 'healthy',
            statistics: {
                totalOrders,
                confirmedOrders,
                pendingProvisioning,
                currentlyProvisioning,
                staleLocks,
                activeProvisioned,
                failedProvisioning
            },
            config: {
                maxRetries: CONFIG.maxRetries,
                retryDelayMs: CONFIG.retryDelayMs,
                lockTimeoutMs: CONFIG.lockTimeoutMs,
                runInterval: "2 minutes",
                lockMechanism: "Database-based atomic locks",
                note: "Safe for 2-minute intervals - uses database locks to prevent race conditions"
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return NextResponse.json({
            success: false,
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}