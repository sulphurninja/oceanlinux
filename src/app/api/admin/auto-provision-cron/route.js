import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AutoProvisioningService = require('@/services/autoProvisioningService');
const WhatsAppService = require('@/services/whatsappService');
/**
 * Auto-provision cron — retries FAILED paid orders for every provider
 * (SmartVPS, Hostycare, ADVPS, Netbay, KuroHost, reseller panel).
 * Schedule: every 5 minutes. Window: 24h from order createdAt.
 * Same OceanLinux order is never double-bought in parallel (DB lock + IP/service-id resume).
 */

// Configuration
const CONFIG = {
    maxRetries: 1, // one provision/buy per cron tick — next try after 5 min, not 2–4 buys in one run
    retryWindowMs: 24 * 60 * 60 * 1000, // stop auto-retry 24h after order created
    maxProcessingTime: 540000, // 9 minutes (AWS Lambda 15min limit buffer)
    lockTimeoutMs: 1200000, // 20 minutes - if a lock is older than this, consider it stale
    retryableErrors: [
        'Password strength should not be less than 100',
        'The following IP(s) are used by another VPS',
        'Service temporarily unavailable',
        'Connection timeout',
        'API rate limit',
        'Server is busy',
        'did not return an assigned IP',
        'Lock acquisition failed',
        'Cannot provision',
        'ipstock failed',
        'No package matching',
        'try again',
        'out of stock',
        'no available',
        'rate limit',
        'ECONNRESET',
        'ETIMEDOUT',
        'timeout',
        'temporarily',
    ]
};

// Helper: Check if error is retryable
function isRetryableError(errorMessage) {
    return CONFIG.retryableErrors.some(retryableError =>
        errorMessage.toLowerCase().includes(retryableError.toLowerCase())
    );
}

function shouldSkipAutoRetry(order) {
    const err = String(order.provisioningError || '');
    if (/WRONG IP ASSIGNED|DO NOT provision|PROVISIONING BLOCKED/i.test(err)) {
        return { skip: true, reason: 'safety_block' };
    }
    if (order.status === 'failed') {
        return { skip: true, reason: 'order_status_failed' };
    }
    if (order.provisioningStatus === 'active' && order.ipAddress) {
        return { skip: true, reason: 'already_active' };
    }
    const created = order.createdAt ? new Date(order.createdAt).getTime() : 0;
    if (created && Date.now() - created > CONFIG.retryWindowMs) {
        return { skip: true, reason: 'retry_window_24h' };
    }
    const last = order.lastProvisionAttempt ? new Date(order.lastProvisionAttempt).getTime() : 0;
    if (last && Date.now() - last < 4 * 60 * 1000) {
        return { skip: true, reason: 'cooldown_4min' };
    }
    return { skip: false };
}

// Helper: Sleep/delay function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Comprehensive validation for order configuration
async function validateOrderConfiguration(order) {
    try {
        if (order.slotIpPackageId) {
            return {
                valid: false,
                reason: 'Slot IP order — assign from package inventory, not VPS auto-provision',
            };
        }

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

        const AutoProvisioningService = require('@/services/autoProvisioningService');
        const { isResellerApiStock } = require('@/lib/resellerApiStockConfig');
        const provisioner = new AutoProvisioningService();

        if (provisioner.isSmartVpsStock(ipStock, order)) {
            return { valid: true, productId: 'smartvps', ipStock: ipStock.name, provider: 'smartvps' };
        }
        if (provisioner.isAdvpsStock(ipStock, order)) {
            return { valid: true, productId: 'advps', ipStock: ipStock.name, provider: 'advps' };
        }
        if (provisioner.isNetbayStock(ipStock, order)) {
            return { valid: true, productId: 'netbay', ipStock: ipStock.name, provider: 'netbay' };
        }
        if (provisioner.isKurohostStock(ipStock, order)) {
            return { valid: true, productId: 'kurohost', ipStock: ipStock.name, provider: 'kurohost' };
        }
        if (isResellerApiStock(ipStock, order)) {
            return { valid: true, productId: 'reseller-api', ipStock: ipStock.name, provider: 'reseller-api' };
        }

        // Hostycare: need memoryOptions + hostycareProductId

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
        
        // STEP 4: Check provider — ADVPS orders don't need hostycareProductId
        const advpsConfig = ipStock.defaultConfigurations?.get?.('advps') ||
            ipStock.defaultConfigurations?.advps;
        const isAdvps = advpsConfig || (ipStock.name || '').startsWith('⚡') || order.advpsOrderId;

        if (isAdvps) {
            // ADVPS: product ID comes from defaultConfigurations.advps.variants, not memoryOptions
            const variants = advpsConfig?.variants instanceof Map
                ? Object.fromEntries(advpsConfig.variants)
                : (advpsConfig?.variants || {});
            const anyVariant = Object.values(variants).find(v => v?.productId);
            const advpsProductId = anyVariant?.productId || order.advpsProductId;

            if (!advpsProductId) {
                console.log(`[VALIDATION] ❌ ADVPS: No product ID in variants or order`);
                return {
                    valid: false,
                    reason: `ADVPS product ID not found in IPStock variants. Run /api/advps/sync to refresh.`
                };
            }

            console.log(`[VALIDATION] ✅ ADVPS validation passed!`);
            console.log(`[VALIDATION]   - ADVPS Product ID: "${advpsProductId}"`);
            console.log(`[VALIDATION]   - IP Stock: ${ipStock.name}`);
            console.log(`[VALIDATION]   - ADVPS Order ID: ${order.advpsOrderId || '(new purchase)'}`);

            return {
                valid: true,
                productId: String(advpsProductId),
                ipStock: ipStock.name,
                memoryConfig: memoryConfig,
                isAdvps: true
            };
        }

        // Non-ADVPS: validate hostycareProductId exists
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
        const cooldownCutoff = new Date(Date.now() - 4 * 60 * 1000);
        const candidateOrders = await Order.find({
            $and: [
                { status: 'confirmed' },
                {
                    $or: [
                        { slotIpPackageId: { $exists: false } },
                        { slotIpPackageId: null },
                        { slotIpPackageId: '' },
                    ],
                },
                {
                    $or: [
                        { createdAt: { $gte: new Date(Date.now() - CONFIG.retryWindowMs) } },
                        { createdAt: { $exists: false } },
                    ],
                },
                {
                    $or: [
                        { lastProvisionAttempt: { $exists: false } },
                        { lastProvisionAttempt: null },
                        { lastProvisionAttempt: { $lt: cooldownCutoff } },
                    ],
                },
                {
                    $or: [
                        { provisioningError: { $exists: false } },
                        { provisioningError: null },
                        { provisioningError: '' },
                        {
                            provisioningError: {
                                $not: /WRONG IP ASSIGNED|DO NOT provision|PROVISIONING BLOCKED/i,
                            },
                        },
                    ],
                },
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
        .sort({ createdAt: 1 })
        .limit(40);
        
        console.log(`[LOCK] 📊 Found ${candidateOrders.length} candidate orders`);
        
        if (candidateOrders.length === 0) {
            console.log('[LOCK] ⏸️ No candidate orders found');
            return null;
        }
        
        // Validate each candidate until we find one with proper configuration
        for (const candidate of candidateOrders) {
            console.log(`[LOCK] 🔍 Checking candidate order: ${candidate._id}`);

            const skip = shouldSkipAutoRetry(candidate);
            if (skip.skip) {
                console.log(`[LOCK] ⏭️ Skip ${candidate._id}: ${skip.reason}`);
                continue;
            }
            
            const validation = await validateOrderConfiguration(candidate);
            
            if (!validation.valid) {
                console.log(`[LOCK] ❌ Order ${candidate._id} failed validation: ${validation.reason} — skip this run, will retry later`);
                continue;
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
        await Order.findByIdAndUpdate(orderId, {
            provisioningStatus: finalStatus,
            provisioningError: error,
            lastProvisionAttempt: new Date(),
        });
        console.log(`[LOCK] Released lock for order ${orderId} with status: ${finalStatus}`);
    } catch (updateError) {
        console.error(`[LOCK] Error releasing lock for order ${orderId}:`, updateError);
    }
}

// Main auto-provisioning cron endpoint - ENHANCED WITH PROPER VALIDATION
export async function POST(request) {
    const cronDenied = enforceCronSecret(request);
    if (cronDenied) return cronDenied;

    const startTime = Date.now();
    const cronId = Math.random().toString(36).substring(2, 8);
    
    console.log("\n" + "🤖".repeat(80));
    console.log(`[CRON-${cronId}] 🤖 STARTING AUTO-PROVISIONING WITH STRICT VALIDATION`);
    console.log(`[CRON-${cronId}] ⏰ Start time: ${new Date().toISOString()}`);
    console.log("🤖".repeat(80));

    try {
        await connectDB();
        console.log(`[CRON-${cronId}] ✅ Database connected`);

        try {
            const { syncStuckResellerPendingOrders } = require('@/lib/resellerApiOrderSync');
            const resellerSync = await syncStuckResellerPendingOrders({ limit: 15 });
            if (resellerSync.length) {
                console.log(`[CRON-${cronId}] Reseller pending sync:`, JSON.stringify(resellerSync));
            }
        } catch (resellerSyncErr) {
            console.warn(`[CRON-${cronId}] Reseller pending sync skipped:`, resellerSyncErr.message);
        }

        // ADVPS "assignment pending" follow-up: /api/admin/advps-pending-cron (separate schedule; saves ADVPS rate limit)

        const provisioningService = new AutoProvisioningService();
        const results = [];
        const maxOrdersPerRun = 5;
        let totalRetries = 0;

        for (let n = 0; n < maxOrdersPerRun; n++) {
            if (Date.now() - startTime > CONFIG.maxProcessingTime) break;

            const lockedOrder = await acquireDatabaseLock();
            if (!lockedOrder) {
                if (n === 0) {
                    console.log(`[CRON-${cronId}] ⏸️ No valid orders available for provisioning`);
                    return NextResponse.json({
                        success: true,
                        message: 'No valid orders available for provisioning (all processed, locked, or lack proper configuration)',
                        processed: 0,
                        cronId,
                        timestamp: new Date().toISOString()
                    });
                }
                break;
            }

            console.log(`[CRON-${cronId}] 🔓 Lock acquired (${n + 1}/${maxOrdersPerRun}): ${lockedOrder._id} — ${lockedOrder.productName}`);

            const orderStartTime = Date.now();
            let attempt = 1;
            let success = false;
            let lastError = null;
            let result = null;

            while (attempt <= CONFIG.maxRetries && !success) {
                if (Date.now() - startTime > CONFIG.maxProcessingTime) {
                    lastError = new Error('Processing time limit reached');
                    break;
                }

                try {
                    console.log(`[CRON-${cronId}] 🚀 ${lockedOrder._id} attempt ${attempt}/${CONFIG.maxRetries}`);
                    const provisionResult = await provisioningService.provisionServer(lockedOrder._id.toString());
                    if (provisionResult.success) {
                        success = true;
                        result = {
                            orderId: lockedOrder._id.toString(),
                            success: true,
                            attempts: attempt,
                            processingTime: Date.now() - orderStartTime,
                            serviceId: provisionResult.serviceId,
                            ipAddress: provisionResult.ipAddress,
                            productId: lockedOrder._validationInfo.productId
                        };
                        if (!provisionResult.alreadyProvisioned) {
                            WhatsAppService.notifyOrderViaWhatsApp(lockedOrder.user, lockedOrder).catch(() => {});
                        }
                    } else {
                        throw new Error(provisionResult.error || 'Unknown provisioning error');
                    }
                } catch (error) {
                    lastError = error;
                    console.error(`[CRON-${cronId}] ❌ ${lockedOrder._id} attempt ${attempt} failed:`, error.message);
                    if (attempt < CONFIG.maxRetries && isRetryableError(error.message)) {
                        await sleep(CONFIG.retryDelayMs);
                        attempt++;
                        totalRetries++;
                    } else {
                        result = {
                            orderId: lockedOrder._id.toString(),
                            success: false,
                            attempts: attempt,
                            processingTime: Date.now() - orderStartTime,
                            error: error.message,
                            retryable: isRetryableError(error.message),
                            productId: lockedOrder._validationInfo.productId
                        };
                        await releaseDatabaseLock(lockedOrder._id, 'failed', `CRON: ${error.message}`);
                        break;
                    }
                }
            }

            if (!success && !result) {
                result = {
                    orderId: lockedOrder._id.toString(),
                    success: false,
                    attempts: attempt,
                    processingTime: Date.now() - orderStartTime,
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

            results.push(result);
        }

        const totalTime = Date.now() - startTime;
        const summary = {
            successful: results.filter((r) => r?.success).length,
            failed: results.filter((r) => r && !r.success).length,
            retries: totalRetries,
            totalTime,
            processed: results.length
        };

        console.log(`[CRON-${cronId}] 🎯 DONE processed=${summary.processed} ok=${summary.successful} fail=${summary.failed} time=${totalTime}ms`);

        return NextResponse.json({
            success: true,
            message: `Processed ${summary.processed} order(s): ${summary.successful} ok, ${summary.failed} failed`,
            summary,
            results,
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

// GET — same as POST (lock + provision one order). ADVPS pending poll: /api/admin/advps-pending-cron
export async function GET(request) {
    const cronDenied = enforceCronSecret(request);
    if (cronDenied) return cronDenied;

    const { searchParams } = new URL(request.url);
    const statsOnly = searchParams.get('stats') === '1';

    // If ?stats=1, return health-check stats without running the cron
    if (statsOnly) {
        try {
            await connectDB();
            const [totalOrders, confirmedOrders, currentlyProvisioning, activeProvisioned, failedProvisioning, configFailures, advpsPendingCount, staleLocks] = await Promise.all([
                Order.countDocuments(),
                Order.countDocuments({ status: 'confirmed' }),
                Order.countDocuments({ provisioningStatus: 'provisioning' }),
                Order.countDocuments({ autoProvisioned: true, provisioningStatus: 'active' }),
                Order.countDocuments({ autoProvisioned: true, provisioningStatus: 'failed' }),
                Order.countDocuments({ provisioningError: { $regex: /^CONFIG:/ } }),
                Order.countDocuments({
                    advpsOrderId: { $exists: true, $ne: '' },
                    status: 'confirmed',
                    provisioningStatus: 'provisioning',
                    provisioningError: { $regex: /^ADVPS_PENDING/ },
                    ipAddress: { $in: [null, '', undefined] },
                }),
                Order.countDocuments({
                    provisioningStatus: 'provisioning',
                    provisioningError: { $not: { $regex: /^ADVPS_PENDING/ } },
                    updatedAt: { $lt: new Date(Date.now() - CONFIG.lockTimeoutMs) }
                }),
            ]);
            return NextResponse.json({
                success: true, status: 'healthy',
                statistics: { totalOrders, confirmedOrders, currentlyProvisioning, advpsPending: advpsPendingCount, staleLocks, activeProvisioned, failedProvisioning, configFailures },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            return NextResponse.json({ success: false, status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() }, { status: 500 });
        }
    }

    return POST(request);
}