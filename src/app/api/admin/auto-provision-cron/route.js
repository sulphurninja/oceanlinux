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

// Helper: Comprehensive validation for order configuration
async function validateOrderConfiguration(order) {
    try {
        const IPStock = require('@/models/ipStockModel');
        
        console.log(`[VALIDATION] 🔍 Validating order ${order._id}:`);
        console.log(`[VALIDATION]   - Product: "${order.productName}"`);
        console.log(`[VALIDATION]   - Memory: "${order.memory}"`);
        console.log(`[VALIDATION]   - IP Stock ID: ${order.ipStockId || 'NOT SET'}`);
        
        // STEP 1: Find IPStock for this order's product
        let ipStock;
        
        if (order.ipStockId) {
            console.log(`[VALIDATION] 🔍 Looking for IP Stock by ID: ${order.ipStockId}`);
            ipStock = await IPStock.findById(order.ipStockId);
        }
        
        if (!ipStock) {
            console.log(`[VALIDATION] 🔍 Searching IP Stock by product name: "${order.productName}"`);
            ipStock = await IPStock.findOne({
                name: { $regex: new RegExp(order.productName, 'i') }
            });
        }
        
        if (!ipStock) {
            console.log(`[VALIDATION] ❌ No IPStock found for product: ${order.productName}`);
            return { 
                valid: false, 
                reason: `No IPStock configuration found for product: ${order.productName}` 
            };
        }
        
        console.log(`[VALIDATION] ✅ Found IPStock: ${ipStock.name}`);
        
        // STEP 2: Parse memory options from IPStock
        let memoryOptions = {};
        
        console.log(`[VALIDATION] 🧠 Raw memoryOptions:`, ipStock.memoryOptions);
        console.log(`[VALIDATION] 🧠 memoryOptions type:`, typeof ipStock.memoryOptions);
        console.log(`[VALIDATION] 🧠 memoryOptions constructor:`, ipStock.memoryOptions?.constructor?.name);
        
        if (ipStock.memoryOptions) {
            if (ipStock.memoryOptions instanceof Map) {
                // Native JavaScript Map
                memoryOptions = Object.fromEntries(ipStock.memoryOptions.entries());
                console.log(`[VALIDATION] ✅ Converted native Map to object`);
            } else if (typeof ipStock.memoryOptions.toObject === 'function') {
                // Mongoose Map with toObject method
                memoryOptions = ipStock.memoryOptions.toObject();
                console.log(`[VALIDATION] ✅ Used Mongoose toObject() method`);
            } else if (ipStock.memoryOptions.constructor?.name === 'Map') {
                // Handle Mongoose Map that might not be detected as instanceof Map
                try {
                    memoryOptions = {};
                    for (const [key, value] of ipStock.memoryOptions) {
                        memoryOptions[key] = value;
                    }
                    console.log(`[VALIDATION] ✅ Manually converted Mongoose Map`);
                } catch (e) {
                    console.log(`[VALIDATION] ⚠️ Failed to iterate Map:`, e.message);
                }
            } else if (typeof ipStock.memoryOptions === 'object' && ipStock.memoryOptions !== null) {
                // Plain object or can be treated as one
                memoryOptions = JSON.parse(JSON.stringify(ipStock.memoryOptions));
                console.log(`[VALIDATION] ✅ Used JSON stringify/parse`);
            }
            
            // Additional fallback - try direct property access
            if (Object.keys(memoryOptions).length === 0) {
                console.log(`[VALIDATION] 🔄 Trying direct property access...`);
                
                // Try common memory sizes directly
                const commonSizes = ['2GB', '4GB', '8GB', '16GB', '32GB'];
                for (const size of commonSizes) {
                    if (ipStock.memoryOptions[size] || ipStock.memoryOptions.get?.(size)) {
                        memoryOptions[size] = ipStock.memoryOptions[size] || ipStock.memoryOptions.get(size);
                        console.log(`[VALIDATION] ✅ Found ${size} via direct access`);
                    }
                }
            }
        }
        
        console.log(`[VALIDATION] 🧠 Converted memoryOptions:`, memoryOptions);
        console.log(`[VALIDATION] 🧠 Available memory options:`, Object.keys(memoryOptions));
        
        // STEP 3: Find exact memory configuration
        let memoryConfig = memoryOptions[order.memory];
        
        if (!memoryConfig) {
            // Try variations if exact match fails
            console.log(`[VALIDATION] ⚠️ Exact match failed for "${order.memory}", trying variations...`);
            
            const memoryVariations = [
                order.memory.toLowerCase(),
                order.memory.toUpperCase(),
                order.memory.replace('GB', 'gb'),
                order.memory.replace('gb', 'GB'),
            ];
            
            console.log(`[VALIDATION] 🔄 Trying variations:`, memoryVariations);
            
            for (const variation of memoryVariations) {
                if (memoryOptions[variation]) {
                    console.log(`[VALIDATION] ✅ Found memory config with variation: "${variation}"`);
                    memoryConfig = memoryOptions[variation];
                    break;
                }
            }
            
            // Try direct access from original ipStock if variations fail
            if (!memoryConfig) {
                console.log(`[VALIDATION] 🔄 Trying direct access from ipStock...`);
                for (const variation of [order.memory, ...memoryVariations]) {
                    if (ipStock.memoryOptions?.[variation] || ipStock.memoryOptions?.get?.(variation)) {
                        memoryConfig = ipStock.memoryOptions[variation] || ipStock.memoryOptions.get(variation);
                        console.log(`[VALIDATION] ✅ Found via direct ipStock access: "${variation}"`);
                        break;
                    }
                }
            }
        }
        
        if (!memoryConfig) {
            const availableKeys = Object.keys(memoryOptions);
            console.log(`[VALIDATION] ❌ Memory configuration not found!`);
            console.log(`[VALIDATION]   - Requested: "${order.memory}"`);
            console.log(`[VALIDATION]   - Available: [${availableKeys.join(', ')}]`);
            console.log(`[VALIDATION]   - IP Stock: ${ipStock.name}`);
            
            return { 
                valid: false, 
                reason: `Memory configuration not found for "${order.memory}" in ${ipStock.name}. Available options: [${availableKeys.join(', ')}]` 
            };
        }
        
        console.log(`[VALIDATION] ✅ Found memory config:`, memoryConfig);
        
        // STEP 4: Validate hostycareProductId exists
        const productId = memoryConfig.hostycareProductId || memoryConfig.productId;
        
        if (!productId) {
            console.log(`[VALIDATION] ❌ Missing hostycareProductId!`);
            console.log(`[VALIDATION]   - Memory: "${order.memory}"`);
            console.log(`[VALIDATION]   - Config:`, memoryConfig);
            console.log(`[VALIDATION]   - IP Stock: ${ipStock.name}`);
            
            return { 
                valid: false, 
                reason: `Missing hostycareProductId for memory "${order.memory}" in ${ipStock.name}. Memory config exists but lacks hostycareProductId field.` 
            };
        }
        
        // STEP 5: Validate productId is not empty/null
        if (typeof productId !== 'string' || productId.trim() === '') {
            console.log(`[VALIDATION] ❌ Invalid hostycareProductId!`);
            console.log(`[VALIDATION]   - Product ID: "${productId}"`);
            console.log(`[VALIDATION]   - Type: ${typeof productId}`);
            
            return { 
                valid: false, 
                reason: `Invalid hostycareProductId "${productId}" for memory "${order.memory}" in ${ipStock.name}. Product ID must be a non-empty string.` 
            };
        }
        
        console.log(`[VALIDATION] ✅ All validation passed!`);
        console.log(`[VALIDATION]   - Product ID: "${productId}"`);
        console.log(`[VALIDATION]   - Product Name: ${memoryConfig.hostycareProductName || 'N/A'}`);
        console.log(`[VALIDATION]   - IP Stock: ${ipStock.name}`);
        
        return { 
            valid: true, 
            productId: productId.trim(), 
            ipStock: ipStock.name,
            memoryConfig: memoryConfig
        };
        
    } catch (error) {
        console.error(`[VALIDATION] 💥 Validation error for order ${order._id}:`, error);
        return { 
            valid: false, 
            reason: `Configuration validation error: ${error.message}` 
        };
    }
}

// Helper: Try to acquire a database lock by marking an order as 'provisioning'
// BUT ONLY for orders that pass validation
async function acquireDatabaseLock() {
    try {
        console.log('[LOCK] 🔍 Finding and validating orders for locking...');
        
        // Get candidate orders (not locked)
        const candidateOrders = await Order.find({
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
        })
        .sort({ createdAt: 1 }) // Oldest first
        .limit(10); // Check up to 10 candidates
        
        console.log(`[LOCK] 📊 Found ${candidateOrders.length} candidate orders`);
        
        if (candidateOrders.length === 0) {
            console.log('[LOCK] ⏸️ No candidate orders found');
            return null;
        }
        
        // Validate each candidate until we find one with proper configuration
        for (const candidate of candidateOrders) {
            console.log(`[LOCK] 🔍 Checking candidate order: ${candidate._id}`);
            
            const validation = await validateOrderConfiguration(candidate);
            
            if (!validation.valid) {
                console.log(`[LOCK] ❌ Order ${candidate._id} failed validation: ${validation.reason}`);
                
                // Mark this order as failed permanently so it doesn't get picked up again
                await Order.findByIdAndUpdate(candidate._id, {
                    provisioningStatus: 'failed',
                    provisioningError: `CONFIG: ${validation.reason}`,
                    autoProvisioned: true
                });
                
                console.log(`[LOCK] 🚫 Order ${candidate._id} marked as permanently failed due to config issues`);
                continue; // Try next candidate
            }
            
            console.log(`[LOCK] ✅ Order ${candidate._id} passed validation, attempting to lock...`);
            
            // Try to atomically lock this specific order
            const lockedOrder = await Order.findOneAndUpdate(
                {
                    _id: candidate._id,
                    $and: [
                        { status: 'confirmed' },
                        {
                            $or: [
                                { provisioningStatus: { $ne: 'provisioning' } },
                                { provisioningStatus: { $exists: false } },
                                // Also include stale locks
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
                    new: false // Return the document before update
                }
            );
            
            if (lockedOrder) {
                console.log(`[LOCK] 🔓 Successfully locked order: ${lockedOrder._id}`);
                // Add validation info to the returned order for later use
                lockedOrder._validationInfo = validation;
                return lockedOrder;
            } else {
                console.log(`[LOCK] ⚠️ Failed to lock order ${candidate._id} (already locked by another process)`);
                // Try next candidate
            }
        }
        
        console.log('[LOCK] ⏸️ No valid orders could be locked');
        return null;

    } catch (error) {
        console.error('[LOCK] 💥 Error in acquireDatabaseLock:', error);
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

// Main auto-provisioning cron endpoint - ENHANCED WITH PROPER VALIDATION
export async function POST(request) {
    const startTime = Date.now();
    const cronId = Math.random().toString(36).substring(2, 8);
    
    console.log("\n" + "🤖".repeat(80));
    console.log(`[CRON-${cronId}] 🤖 STARTING AUTO-PROVISIONING WITH STRICT VALIDATION`);
    console.log(`[CRON-${cronId}] ⏰ Start time: ${new Date().toISOString()}`);
    console.log("🤖".repeat(80));

    try {
        await connectDB();
        console.log(`[CRON-${cronId}] ✅ Database connected`);

        // STEP 1: Try to acquire a database lock on a VALIDATED order
        console.log(`[CRON-${cronId}] 🔒 STEP 1: Attempting to acquire lock on validated order...`);
        
        const lockedOrder = await acquireDatabaseLock();
        
        if (!lockedOrder) {
            console.log(`[CRON-${cronId}] ⏸️ No valid orders available for provisioning`);
            return NextResponse.json({
                success: true,
                message: 'No valid orders available for provisioning (all processed, locked, or lack proper configuration)',
                processed: 0,
                cronId,
                timestamp: new Date().toISOString()
            });
        }

        console.log(`[CRON-${cronId}] 🔓 Lock acquired for VALIDATED order: ${lockedOrder._id}`);
        console.log(`[CRON-${cronId}] 📦 Product: ${lockedOrder.productName}`);
        console.log(`[CRON-${cronId}] 💾 Memory: ${lockedOrder.memory}`);
        console.log(`[CRON-${cronId}] 💰 Price: ₹${lockedOrder.price}`);
        console.log(`[CRON-${cronId}] 🆔 Product ID: ${lockedOrder._validationInfo.productId}`);

        // STEP 2: Process the locked order with retry logic
        console.log(`[CRON-${cronId}] 🚀 STEP 2: Processing validated and locked order...`);

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
                        ipAddress: provisionResult.ipAddress,
                        productId: lockedOrder._validationInfo.productId
                    };

                    // The provisionServer already updates the order status to 'active'
                    
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
                        retryable: isRetryableError(error.message),
                        productId: lockedOrder._validationInfo.productId
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
                retryable: false,
                productId: lockedOrder._validationInfo.productId
            };

            await releaseDatabaseLock(
                lockedOrder._id, 
                'failed', 
                `CRON: Processing timeout after ${attempt} attempts`
            );
        }
        
        // STEP 3: Generate summary
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
        console.log(`   - Product ID: ${lockedOrder._validationInfo.productId}`);
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
                ? `Successfully provisioned order ${lockedOrder._id} with product ID ${lockedOrder._validationInfo.productId}` 
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

        const configFailures = await Order.countDocuments({
            provisioningError: { $regex: /^CONFIG:/ }
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
                failedProvisioning,
                configFailures
            },
            config: {
                maxRetries: CONFIG.maxRetries,
                retryDelayMs: CONFIG.retryDelayMs,
                lockTimeoutMs: CONFIG.lockTimeoutMs,
                runInterval: "2 minutes",
                lockMechanism: "Database-based atomic locks with strict validation",
                note: "Only processes orders with valid IPStock configurations and hostycareProductId"
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