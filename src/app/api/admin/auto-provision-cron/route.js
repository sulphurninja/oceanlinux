import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AutoProvisioningService = require('@/services/autoProvisioningService');

// Configuration
const CONFIG = {
    maxRetries: 3,
    retryDelayMs: 5000, // 5 seconds between retries
    batchSize: 5, // Process 5 orders at a time
    maxProcessingTime: 540000, // 9 minutes (AWS Lambda 15min limit buffer)
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

// Main auto-provisioning cron endpoint
export async function POST(request) {
    const startTime = Date.now();
    console.log("\n" + "🤖".repeat(80));
    console.log(`[AUTO-PROVISION-CRON] 🤖 STARTING AUTOMATED PROVISIONING`);
    console.log(`[AUTO-PROVISION-CRON] ⏰ Start time: ${new Date().toISOString()}`);
    console.log("🤖".repeat(80));

    try {
        await connectDB();
        console.log("[AUTO-PROVISION-CRON] ✅ Database connected");

        // STEP 1: Find orders that need provisioning - UPDATED QUERY
        console.log(`[AUTO-PROVISION-CRON] 📋 STEP 1: Finding confirmed orders with valid product configs...`);

        // First, get all confirmed orders that haven't been auto-provisioned
        const candidateOrders = await Order.find({
            $and: [
                { status: 'confirmed' }, // ONLY confirmed orders
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
        })
            .sort({ createdAt: 1 }) // Oldest first
            .limit(CONFIG.batchSize * 2); // Get more candidates to filter

        console.log(`[AUTO-PROVISION-CRON] 📊 Found ${candidateOrders.length} candidate orders`);

        // STEP 2: Filter orders that have valid product configurations
        const validOrders = [];

        for (const order of candidateOrders) {
            console.log(`[AUTO-PROVISION-CRON] 🔍 Checking product config for order ${order._id}: ${order.productName}`);

            try {
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
                    console.log(`[AUTO-PROVISION-CRON] ❌ No IPStock found for order ${order._id}: ${order.productName}`);
                    continue;
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
                    console.log(`[AUTO-PROVISION-CRON] ❌ No hostycareProductId for order ${order._id}: ${order.memory} in ${ipStock.name}`);
                    continue;
                }

                console.log(`[AUTO-PROVISION-CRON] ✅ Valid config found for order ${order._id}: Product ID ${productId}`);
                validOrders.push(order);

                // Stop when we have enough valid orders
                if (validOrders.length >= CONFIG.batchSize) {
                    break;
                }

            } catch (configError) {
                console.error(`[AUTO-PROVISION-CRON] ❌ Error checking config for order ${order._id}:`, configError.message);
                continue;
            }
        }

        console.log(`[AUTO-PROVISION-CRON] 📊 Found ${validOrders.length} orders with valid configurations to process`);

        if (validOrders.length === 0) {
            console.log(`[AUTO-PROVISION-CRON] ✅ No valid orders need provisioning`);
            return NextResponse.json({
                success: true,
                message: 'No valid orders need provisioning',
                processed: 0,
                checked: candidateOrders.length,
                summary: { successful: 0, failed: 0, skipped: candidateOrders.length, retries: 0 }
            });
        }
        // STEP 3: Process valid orders with retry logic
        const provisioningService = new AutoProvisioningService();
        const results = [];
        let totalRetries = 0;

        for (const order of validOrders) {
            const orderStartTime = Date.now();
            console.log(`\n[AUTO-PROVISION-CRON] 🔄 Processing order: ${order._id}`);
            console.log(`[AUTO-PROVISION-CRON] 📦 Product: ${order.productName}`);
            console.log(`[AUTO-PROVISION-CRON] 💾 Memory: ${order.memory}`);
            console.log(`[AUTO-PROVISION-CRON] 💰 Price: ₹${order.price}`);

            let attempt = 1;
            let success = false;
            let lastError = null;

            // Retry loop for this order
            while (attempt <= CONFIG.maxRetries && !success) {
                // Check if we're running out of time
                const elapsedTime = Date.now() - startTime;
                if (elapsedTime > CONFIG.maxProcessingTime) {
                    console.log(`[AUTO-PROVISION-CRON] ⏰ Approaching time limit, stopping processing`);
                    break;
                }

                try {
                    console.log(`[AUTO-PROVISION-CRON] 🚀 Attempt ${attempt}/${CONFIG.maxRetries} for order ${order._id}`);

                    const result = await provisioningService.provisionServer(order._id.toString());

                    if (result.success) {
                        success = true;
                        const orderTime = Date.now() - orderStartTime;
                        console.log(`[AUTO-PROVISION-CRON] ✅ Order ${order._id} provisioned successfully in ${orderTime}ms`);

                        results.push({
                            orderId: order._id.toString(),
                            success: true,
                            attempts: attempt,
                            processingTime: orderTime,
                            serviceId: result.serviceId,
                            ipAddress: result.ipAddress
                        });
                    } else {
                        throw new Error(result.error || 'Unknown provisioning error');
                    }

                } catch (error) {
                    lastError = error;
                    console.error(`[AUTO-PROVISION-CRON] ❌ Attempt ${attempt} failed for order ${order._id}:`, error.message);

                    // Check if error is retryable
                    if (attempt < CONFIG.maxRetries && isRetryableError(error.message)) {
                        console.log(`[AUTO-PROVISION-CRON] 🔄 Error is retryable, waiting ${CONFIG.retryDelayMs}ms before retry...`);
                        await sleep(CONFIG.retryDelayMs);
                        attempt++;
                        totalRetries++;
                    } else {
                        // Max retries reached or non-retryable error
                        const orderTime = Date.now() - orderStartTime;
                        console.error(`[AUTO-PROVISION-CRON] 💥 Order ${order._id} failed permanently after ${attempt} attempts`);

                        results.push({
                            orderId: order._id.toString(),
                            success: false,
                            attempts: attempt,
                            processingTime: orderTime,
                            error: error.message,
                            retryable: isRetryableError(error.message)
                        });
                        break;
                    }
                }
            }

            // Add delay between orders to avoid rate limiting
            if (validOrders.indexOf(order) < validOrders.length - 1) {
                console.log(`[AUTO-PROVISION-CRON] ⏱️ Waiting 2 seconds before next order...`);
                await sleep(2000);
            }
        }

        // STEP 4: Generate summary
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        const skipped = candidateOrders.length - validOrders.length;
        const totalTime = Date.now() - startTime;

        const summary = {
            successful,
            failed,
            skipped,
            retries: totalRetries,
            totalTime,
            processed: results.length,
            checked: candidateOrders.length
        };

        console.log("\n" + "🎯".repeat(80));
        console.log(`[AUTO-PROVISION-CRON] 🎯 BATCH PROCESSING COMPLETED`);
        console.log(`   - Orders checked: ${summary.checked}`);
        console.log(`   - Orders processed: ${summary.processed}`);
        console.log(`   - Orders skipped (no config): ${summary.skipped}`);
        console.log(`   - Successful: ${summary.successful}`);
        console.log(`   - Failed: ${summary.failed}`);
        console.log(`   - Total retries: ${summary.retries}`);
        console.log(`   - Total time: ${summary.totalTime}ms`);
        console.log("🎯".repeat(80));

        // STEP 5: Handle failed orders (mark for human review if non-retryable)
        const nonRetryableFailures = results.filter(r => !r.success && !r.retryable);
        if (nonRetryableFailures.length > 0) {
            console.log(`[AUTO-PROVISION-CRON] 🔴 Marking ${nonRetryableFailures.length} orders for manual review...`);

            for (const failure of nonRetryableFailures) {
                await Order.findByIdAndUpdate(failure.orderId, {
                    provisioningStatus: 'failed',
                    provisioningError: `CRON: ${failure.error}`,
                    autoProvisioned: true
                });
            }
        }

        return NextResponse.json({
            success: true,
            message: `Checked ${summary.checked} orders, processed ${summary.processed}: ${summary.successful} successful, ${summary.failed} failed, ${summary.skipped} skipped`,
            summary,
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error("\n" + "💥".repeat(80));
        console.error(`[AUTO-PROVISION-CRON] 💥 CRON JOB FAILED:`, error);
        console.error(`   - Error: ${error.message}`);
        console.error(`   - Time elapsed: ${totalTime}ms`);
        console.error("💥".repeat(80));

        return NextResponse.json({
            success: false,
            error: error.message,
            totalTime,
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
                { status: 'confirmed' }, // Only confirmed orders
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
                }
            ]
        });

        const activeProvisioned = await Order.countDocuments({
            autoProvisioned: true,
            provisioningStatus: 'active'
        });

        const failedProvisioning = await Order.countDocuments({
            autoProvisioned: true,
            provisioningStatus: 'failed'
        });

        return NextResponse.json({
            success: true,
            status: 'healthy',
            statistics: {
                totalOrders,
                confirmedOrders,
                pendingProvisioning,
                activeProvisioned,
                failedProvisioning
            },
            config: {
                maxRetries: CONFIG.maxRetries,
                batchSize: CONFIG.batchSize,
                retryDelayMs: CONFIG.retryDelayMs,
                note: "Only processes 'confirmed' orders with valid product configurations"
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

