// /src/services/autoProvisioningService.js

const HostycareAPI = require('./hostycareApi');
const SmartVpsAPI = require('./smartvpsApi');              // SmartVPS client (with its own logging)
const connectDB = require('@/lib/db').default;
const Order = require('@/models/orderModel').default;
const IPStock = require('@/models/ipStockModel');

const L = {
  head: (label) => {
    console.log("\n" + "🔎".repeat(80));
    console.log(`[AUTO-PROVISION] ${label}`);
    console.log("🔎".repeat(80));
  },
  kv: (k, v) => console.log(`[AUTO-PROVISION] ${k}:`, v),
  line: (msg = '') => console.log(`[AUTO-PROVISION] ${msg}`),
};

// CRITICAL: In-memory lock to prevent race conditions when provisioning from the same package
// This ensures only ONE order can provision from a specific SmartVPS package at a time
const provisioningLocks = new Map(); // Key: packageName, Value: { locked: true, orderId: "..." }

class AutoProvisioningService {
  constructor() {
    this.hostycareApi = new HostycareAPI();
    this.smartvpsApi = new SmartVpsAPI();
    console.log('[AUTO-PROVISION-SERVICE] 🏗️ AutoProvisioningService instance created');
  }

  // Acquire a lock for a specific SmartVPS package
  async acquirePackageLock(packageName, orderId, maxWaitMs = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      const existingLock = provisioningLocks.get(packageName);
      
      if (!existingLock) {
        // No lock exists, acquire it
        provisioningLocks.set(packageName, { locked: true, orderId, acquiredAt: new Date() });
        L.line(`[LOCK] 🔒 Acquired lock for package "${packageName}" (order: ${orderId})`);
        return true;
      }
      
      // Lock exists, check if it's stale (older than 2 minutes = likely crashed)
      const lockAge = Date.now() - new Date(existingLock.acquiredAt).getTime();
      if (lockAge > 120000) {
        L.line(`[LOCK] ⚠️ Stale lock detected for "${packageName}" (age: ${lockAge}ms), releasing...`);
        provisioningLocks.delete(packageName);
        continue;
      }
      
      // Lock is held by another order, wait
      L.line(`[LOCK] ⏳ Package "${packageName}" is locked by order ${existingLock.orderId}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }
    
    // Timeout
    throw new Error(`Failed to acquire lock for package "${packageName}" after ${maxWaitMs}ms. Another order is currently provisioning from this package.`);
  }

  // Release a lock for a specific SmartVPS package
  releasePackageLock(packageName, orderId) {
    const existingLock = provisioningLocks.get(packageName);
    
    if (existingLock && existingLock.orderId === orderId) {
      provisioningLocks.delete(packageName);
      L.line(`[LOCK] 🔓 Released lock for package "${packageName}" (order: ${orderId})`);
    } else {
      L.line(`[LOCK] ⚠️ Attempted to release lock for "${packageName}" but it's not held by order ${orderId}`);
    }
  }

  // ULTRA-SIMPLE password generator (kept)
  generateCredentials(productName = '') {
    L.line('🔐 Generating ultra-simple credentials...');
    const upperCase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowerCase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const safeSpecialChars = '@#&$';

    let password = '';
    password += upperCase[Math.floor(Math.random() * upperCase.length)];
    password += lowerCase[Math.floor(Math.random() * lowerCase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += safeSpecialChars[Math.floor(Math.random() * safeSpecialChars.length)];

    const allSafe = upperCase + lowerCase + numbers + safeSpecialChars;
    for (let i = 4; i < 12; i++) password += allSafe[Math.floor(Math.random() * allSafe.length)];
    password = password.split('').sort(() => 0.5 - Math.random()).join('');

    const username = this.getLoginUsernameFromProductName(productName);
    L.line(`✅ Credentials generated — username=${username}, password=${password.substring(0, 4)}****`);
    return { username, password };
  }

  generateHostname(productName, memory) {
    L.line('🌐 Generating hostname...');
    const cleanName = String(productName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const memoryCode = String(memory || '').toLowerCase().replace('gb', '');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const hostname = `${cleanName}-${memoryCode}gb-${randomSuffix}.com`;
    L.line(`✅ Hostname: ${hostname}`);
    return hostname;
  }

  toPlainObject(mapOrObj) {
    if (!mapOrObj) return {};
    if (typeof mapOrObj.toObject === 'function') return mapOrObj.toObject();
    if (mapOrObj instanceof Map) return Object.fromEntries(mapOrObj.entries());
    if (typeof mapOrObj === 'object') return { ...mapOrObj };
    return {};
  }

  getLoginUsernameFromProductName(productName = '') {
    const s = String(productName).toLowerCase();
    const isWindowsLike = s.includes('windows') || s.includes('rdp') || s.includes('vps');
    return isWindowsLike ? 'administrator' : 'root';
  }

  // --- SMARTVPS HELPERS ----------------------------------------------------

  // Decide if this IPStock belongs to SmartVPS
  // 1) tags include "smartvps" (case-insensitive)
  // 2) provider field equals "smartvps" (case-insensitive)
  // 3) name includes "smartvps"
  // 4) productName includes "smartvps" (last resort)
  isSmartVpsStock(ipStock, order) {
    const tags = Array.isArray(ipStock?.tags) ? ipStock.tags : [];
    const provider = (ipStock?.provider || '').toString().toLowerCase();
    const name = (ipStock?.name || '').toString().toLowerCase();
    const product = (order?.productName || '').toString().toLowerCase();

    const tagged = tags.some(t => String(t).toLowerCase() === 'smartvps');
    const byProvider = provider === 'smartvps';
    const byName = name.includes('smartvps');
    const byProduct = product.includes('smartvps');

    L.kv('IPStock.tags', tags);
    L.kv('IPStock.provider', ipStock?.provider || '(missing)');
    L.kv('IPStock.name', ipStock?.name || '(missing)');
    L.kv('Order.productName', order?.productName || '(missing)');
    L.kv('SmartVPS detection', { tagged, byProvider, byName, byProduct });

    return tagged || byProvider || byName || byProduct;
  }

  // SmartVPS response normalizer
  normalizeSmartVpsResponse(payload) {
    if (payload == null) return payload;
    try {
      if (typeof payload === 'string') {
        try {
          return JSON.parse(payload);
        } catch { }
        const unquoted = payload.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
        try {
          return JSON.parse(unquoted);
        } catch { }
      }
      return payload;
    } catch {
      return payload;
    }
  }

  extractIp(from) {
    const text = typeof from === 'string' ? from : JSON.stringify(from);
    const m = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    return m ? m[0] : null;
  }

  extractRam(orderMemory) {
    if (!orderMemory) return null;
    const gb = String(orderMemory).match(/(\d+)\s*gb/i);
    if (gb) return gb[1];
    const mb = String(orderMemory).match(/(\d+)\s*mb/i);
    if (mb) {
      const g = Math.max(1, Math.ceil(parseInt(mb[1], 10) / 1024));
      return String(g);
    }
    const any = String(orderMemory).match(/(\d+)/);
    return any ? any[1] : null;
  }

  /**
   * Pick an IP from SmartVPS ipstock that matches the requested package.
   * SmartVPS expects us to first fetch ipstock and then call buyvps with a concrete IP.
   * We match on octets:
   * - If package name has 3 numeric octets (e.g., 103.181.91), match first 3 octets.
   * - Otherwise fall back to first 2 octets.
   */
  async pickSmartVpsIpForPackage(pkgName) {
    try {
      L.line('[SMARTVPS] Calling ipstock() …');
      const res = await this.smartvpsApi.ipstock();
      const data = this.normalizeSmartVpsResponse(res);
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      L.kv('[SMARTVPS] ipstock() normalized', text?.slice(0, 400));

      const parts = String(pkgName).split('.');
      const numericParts = parts.filter(p => /^\d+$/.test(p));
      const useThree = numericParts.length >= 3;
      const prefix = useThree
        ? numericParts.slice(0, 3).join('.')
        : numericParts.slice(0, 2).join('.');

      // Build regex: for 3-octet prefix -> 103\.181\.91\.\d{1,3}
      // For 2-octet prefix -> 103\.181\.\d{1,3}\.\d{1,3}
      const regex =
        useThree
          ? new RegExp(`\\b${prefix.replace(/\./g, '\\.')}\\.\\d{1,3}\\b`)
          : new RegExp(`\\b${prefix.replace(/\./g, '\\.')}\\.\\d{1,3}\\.\\d{1,3}\\b`);

      const match = text.match(regex);
      const ip = match?.[0];

      L.kv('[SMARTVPS] Desired package prefix', prefix);
      L.kv('[SMARTVPS] Matched IP from ipstock', ip || '(none)');

      if (!ip) {
        throw new Error(`No available IP in SmartVPS ipstock matching prefix ${prefix}`);
      }

      return ip;
    } catch (e) {
      throw new Error(`SmartVPS ipstock failed: ${e.message}`);
    }
  }

  // BEFORE: pickSmartVpsIp() tries to regex IPv4 from ipstock
  // AFTER: pick a package by name/id, return a descriptor

  async pickSmartVpsPackage(ipStock, order) {
    try {
      // CRITICAL: Use EXACT package ID and name from IPStock configuration
      // This ensures customer gets EXACTLY what they ordered
      const smartvpsConfig = ipStock?.defaultConfigurations?.get?.('smartvps') || 
                            ipStock?.defaultConfigurations?.smartvps;
      
      if (!smartvpsConfig) {
        throw new Error('IPStock missing SmartVPS configuration (defaultConfigurations.smartvps)');
      }

      const storedPid = String(smartvpsConfig.packagePid || '');
      const storedName = String(smartvpsConfig.packageName || '');

      if (!storedPid || !storedName) {
        throw new Error(`IPStock ${ipStock._id} has invalid SmartVPS config: pid="${storedPid}", name="${storedName}"`);
      }

      L.line(`[SMARTVPS] Using EXACT package from IPStock config:`);
      L.kv('[SMARTVPS]   → Package ID (PID)', storedPid);
      L.kv('[SMARTVPS]   → Package Name', storedName);
      L.kv('[SMARTVPS]   → IPStock ID', ipStock._id);
      L.kv('[SMARTVPS]   → IPStock Name', ipStock.name);

      // Verify the package still exists in the API (optional safety check)
      L.line('[SMARTVPS] Verifying package exists in API...');
      const res = await this.smartvpsApi.ipstock();
      const data = this.normalizeSmartVpsResponse(res);
      const obj = typeof data === 'string' ? JSON.parse(data) : data;
      const packages = Array.isArray(obj?.packages) ? obj.packages : [];

      // Find the EXACT package by ID (PID is the primary unique identifier)
      const exactMatch = packages.find(p => String(p.id) === storedPid);

      if (!exactMatch) {
        L.line(`[SMARTVPS] ⚠️ WARNING: Package not found in current API response!`);
        L.kv('[SMARTVPS]   Searched for PID', storedPid);
        L.kv('[SMARTVPS]   Expected Name', storedName);
        L.kv('[SMARTVPS]   Available packages', packages.map(p => `${p.id}::${p.name}`));
        throw new Error(`Package with PID ${storedPid} no longer available in SmartVPS API. Customer ordered product that is now unavailable.`);
      }

      // SAFETY CHECK: Warn if package name changed (SmartVPS renamed it)
      if (String(exactMatch.name) !== storedName) {
        L.line(`[SMARTVPS] ⚠️ NOTICE: SmartVPS renamed this package!`);
        L.kv('[SMARTVPS]   PID (matched)', storedPid);
        L.kv('[SMARTVPS]   Old name (stored)', storedName);
        L.kv('[SMARTVPS]   New name (current)', exactMatch.name);
        L.line(`[SMARTVPS]   → Provisioning will continue with PID ${storedPid}`);
        L.line(`[SMARTVPS]   → Consider updating IPStock to sync new name`);
      }

      // Verify package is active and has available IPs
      if (String(exactMatch.status).toLowerCase() !== 'active') {
        throw new Error(`Package "${storedName}" (PID: ${storedPid}) is not active. Status: ${exactMatch.status}`);
      }

      if (Number(exactMatch.ipv4 || 0) <= 0) {
        throw new Error(`Package "${storedName}" (PID: ${storedPid}) has no available IPs. IPv4 count: ${exactMatch.ipv4}`);
      }

      // SAFETY: Warn if running low on IPs (potential race condition risk)
      const ipCount = Number(exactMatch.ipv4 || 0);
      if (ipCount <= 5) {
        L.line(`[SMARTVPS] ⚠️ WARNING: Package running low on IPs!`);
        L.kv('[SMARTVPS]   → Available IPv4', ipCount);
        L.line(`[SMARTVPS]   → Risk: Concurrent orders may cause SmartVPS to assign from different package`);
      }

      L.line(`[SMARTVPS] ✅ Exact package verified and available:`);
      L.kv('[SMARTVPS]   → ID', exactMatch.id);
      L.kv('[SMARTVPS]   → Name', exactMatch.name);
      L.kv('[SMARTVPS]   → Status', exactMatch.status);
      L.kv('[SMARTVPS]   → Available IPv4', exactMatch.ipv4);

      return { id: exactMatch.id, name: exactMatch.name };
    } catch (e) {
      throw new Error(`SmartVPS package selection failed: ${e.message}`);
    }
  }


  // --- MAIN PROVISION METHOD ----------------------------------------------

  async provisionServer(orderId) {
    const startTime = Date.now();
    console.log("\n" + "🚀".repeat(80));
    console.log(`[AUTO-PROVISION] 🚀 STARTING AUTO-PROVISIONING for order: ${orderId}`);
    console.log(`[AUTO-PROVISION] ⏰ Start time: ${new Date().toISOString()}`);
    console.log("🚀".repeat(80));

    await connectDB();
    L.line('✅ Database connected');

    try {
      // STEP 1: Find the order
      L.head('STEP 1: LOAD ORDER & DUPLICATE CHECK');
      const order = await Order.findById(orderId);
      if (!order) throw new Error(`Order ${orderId} not found in database`);
      
      L.kv('Order._id', order._id.toString());
      L.kv('Order.productName', order.productName);
      L.kv('Order.memory', order.memory);
      L.kv('Order.price', order.price);
      L.kv('Order.status', order.status);
      L.kv('Order.provisioningStatus', order.provisioningStatus || 'none');
      L.kv('Order.ipAddress', order.ipAddress || 'none');
      L.kv('Order.provider', order.provider || 'none');
      L.kv('Order.os', order.os || '(Default)');
      L.kv('Order.ipStockId', order.ipStockId || '(NOT SET)');

      // === CRITICAL: Prevent duplicate provisioning ===
      if (order.provisioningStatus === 'active' && order.ipAddress) {
        L.line(`\n⚠️⚠️⚠️ ORDER ALREADY PROVISIONED ⚠️⚠️⚠️`);
        L.kv('  → IP Address', order.ipAddress);
        L.kv('  → Provider', order.provider);
        L.kv('  → Username', order.username);
        L.line(`⚠️⚠️⚠️ SKIPPING PROVISIONING ⚠️⚠️⚠️\n`);
        
        return {
          success: true,
          alreadyProvisioned: true,
          ipAddress: order.ipAddress,
          credentials: { username: order.username, password: order.password },
          message: 'Order was already provisioned successfully',
          totalTime: Date.now() - startTime
        };
      }

      // Check if currently being provisioned (within last 10 minutes)
      // IMPORTANT: Only block if status is 'provisioning' (not 'failed')
      // This allows manual retries for failed orders
      if (order.provisioningStatus === 'provisioning' && order.lastProvisionAttempt) {
        const timeSinceAttempt = Date.now() - new Date(order.lastProvisionAttempt).getTime();
        if (timeSinceAttempt < 10 * 60 * 1000) { // 10 minutes
          L.line(`\n⏳⏳⏳ ORDER CURRENTLY BEING PROVISIONED ⏳⏳⏳`);
          L.kv('  → Time since attempt', `${Math.round(timeSinceAttempt / 1000)}s ago`);
          L.line(`⏳⏳⏳ ABORTING TO PREVENT DUPLICATE ⏳⏳⏳\n`);
          
          throw new Error(`Order is currently being provisioned by another process (started ${Math.round(timeSinceAttempt / 1000)}s ago). Please wait.`);
        } else {
          L.line(`⚠️ Order stuck in 'provisioning' state for ${Math.round(timeSinceAttempt / 60000)} minutes, allowing retry...`);
        }
      } else if (order.provisioningStatus === 'failed') {
        L.line(`✅ Order has 'failed' status, allowing manual retry...`);
      }

      L.line(`✅ Duplicate check passed, proceeding with provisioning...`);

      // STEP 2: Find IP Stock configuration (to decide provider)
      L.head('STEP 2: LOAD IPSTOCK & DETECT PROVIDER');
      let ipStock = null;

      if (order.ipStockId) {
        L.line(`Looking up IPStock by ID: ${order.ipStockId}`);
        ipStock = await IPStock.findById(order.ipStockId);
      }
      if (!ipStock) {
        L.line(`No IPStock by ID; searching by product name: "${order.productName}"`);
        ipStock = await IPStock.findOne({ name: { $regex: new RegExp(order.productName, 'i') } });
      }
      if (!ipStock) throw new Error(`IPStock configuration not found for product: ${order.productName}`);

      // Safe snapshot of ipStock for logs
      const snapshot = {
        _id: ipStock._id?.toString?.() || '(n/a)',
        name: ipStock.name,
        provider: ipStock.provider,
        tags: ipStock.tags,
        memoryOptionsType: ipStock.memoryOptions?.constructor?.name || typeof ipStock.memoryOptions
      };
      L.kv('IPStock snapshot', snapshot);

      const smartVps = this.isSmartVpsStock(ipStock, order);
      L.line(`➡ Provider route selected: ${smartVps ? 'SmartVPS' : 'Hostycare'}`);

      // Branch
      if (smartVps) {
        return await this.provisionViaSmartVps(order, ipStock, startTime);
      } else {
        return await this.provisionViaHostycare(order, ipStock, startTime);
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error("\n" + "💥".repeat(80));
      console.error(`[AUTO-PROVISION] 💥 PROVISIONING FAILED for order ${orderId}:`);
      console.error(`   - Error: ${error.message}`);
      console.error(`   - Time elapsed: ${totalTime}ms`);
      console.error("💥".repeat(80));

      try {
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'failed',
          provisioningError: error.message,
          autoProvisioned: true
        });
      } catch (updateError) {
        console.error(`[AUTO-PROVISION] ❌ Failed to update order status:`, updateError);
      }

      return { success: false, error: error.message, totalTime };
    }
  }

  // --- SMARTVPS PATH -------------------------------------------------------

// ... existing code ...

  // --- SMARTVPS PATH -------------------------------------------------------

  async provisionViaSmartVps(order, ipStock, startTime) {
    L.head(`SMARTVPS PATH — order ${order._id}`);

    const isWindowsProduct = /windows|rdp|vps/i.test(String(order.productName));
    const targetOS = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';
    L.kv('[SMARTVPS] isWindowsProduct', isWindowsProduct);
    L.kv('[SMARTVPS] targetOS', targetOS);

    const ram = this.extractRam(order.memory);
    L.kv('[SMARTVPS] parsed RAM (GB)', ram);
    if (!ram) throw new Error(`Unable to parse RAM from memory "${order.memory}" for SmartVPS`);

    // Get package with retry logic
    const pkg = await this.pickSmartVpsPackage(ipStock, order);
    L.kv('[SMARTVPS] Using package for buy', pkg);

    // Fetch an IP from SmartVPS that matches the package prefix
    const selectedIp = await this.pickSmartVpsIpForPackage(pkg.name);
    L.kv('[SMARTVPS] Using IP for buy', selectedIp);

    // CRITICAL: Acquire lock to prevent race conditions
    // This ensures only ONE order provisions from this package at a time
    let lockAcquired = false;
    try {
      await this.acquirePackageLock(pkg.name, order._id.toString());
      lockAcquired = true;
    } catch (lockError) {
      L.line(`[SMARTVPS] ❌ Failed to acquire lock: ${lockError.message}`);
      
      // Mark order as failed since we can't acquire lock
      await Order.findByIdAndUpdate(order._id, {
        provisioningStatus: 'failed',
        provisioningError: `Lock acquisition failed: ${lockError.message}`,
        autoProvisioned: true,
        provider: 'smartvps'
      });
      
      throw new Error(`Cannot provision: ${lockError.message}. Please try again in a moment.`);
    }

    // NOW set order to provisioning status AFTER acquiring lock
    // This prevents orders from getting stuck in 'provisioning' if lock fails
    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      os: targetOS,
      provider: 'smartvps'  // Set provider at the start
    });

    // Wrap entire provisioning in try-finally to ensure lock is released
    try {
      // Buy VPS with timeout and retry logic
      let buyRes, boughtIp;
      const maxRetries = 3;
      let lastError;
      let safetyCheckFailed = false; // Flag to track if safety check failed

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        L.line(`[SMARTVPS] Calling buyVps(${pkg.name}, ${ram}) - attempt ${attempt}/${maxRetries} …`);

        // Add timeout wrapper around the API call
        // Longer timeout for SmartVPS to fully process
        buyRes = await this.withTimeout(
          this.smartvpsApi.buyVps(selectedIp, ram),
          120000, // 2 minute timeout (was 45s)
          `SmartVPS buyVps timeout (attempt ${attempt})`
        );

        const buyText = typeof buyRes === 'string' ? buyRes : JSON.stringify(buyRes);
        L.kv(`[SMARTVPS] buyVps attempt ${attempt} response`, buyText.slice(0, 500));

        // Extract the assigned IP from the buy response
        boughtIp = this.extractIp(buyText);
        L.kv('[SMARTVPS] assigned/bought IP', boughtIp);

        if (!boughtIp) {
          throw new Error('SmartVPS buyVps did not return an assigned IP');
        }

        // CRITICAL SAFETY CHECK: Verify the IP belongs to the requested package
        // We only check the FIRST 2 OCTETS (e.g., "103.83")
        // Package "103.83.x" or "103.83.249" → Accept any IP starting with "103.83"
        // Package "103.181.91" → Accept any IP starting with "103.181" (e.g., 103.181.90, 103.181.91, etc.)
        const requestedPackage = pkg.name; // e.g., "103.83.x" or "103.181.91"
        const ipParts = boughtIp.split('.'); // e.g., ["103", "83", "249", "120"]
        
        // Extract first 2 octets from package name (remove 'x', 'X', trailing dots, etc.)
        const packageParts = requestedPackage.split('.');
        const packageFirstTwo = packageParts.slice(0, 2).join('.'); // e.g., "103.83" or "103.181"
        
        // Extract first 2 octets from assigned IP
        const ipFirstTwo = ipParts.slice(0, 2).join('.'); // e.g., "103.83"
        
        const ipMatches = (ipFirstTwo === packageFirstTwo);
        
        L.kv('[SMARTVPS]   → Requested package', requestedPackage);
        L.kv('[SMARTVPS]   → Package first 2 octets', packageFirstTwo);
        L.kv('[SMARTVPS]   → Assigned IP', boughtIp);
        L.kv('[SMARTVPS]   → IP first 2 octets', ipFirstTwo);
        L.kv('[SMARTVPS]   → Match', ipMatches ? '✅ MATCH' : '❌ NO MATCH');
        
        if (!ipMatches) {
          L.line(`[SMARTVPS] ❌ CRITICAL: SmartVPS assigned IP from WRONG package!`);
          L.line(`[SMARTVPS]   → This indicates the requested package ran out of IPs`);
          L.line(`[SMARTVPS]   → SmartVPS API fallback behavior detected!`);
          L.line(`[SMARTVPS]   → ORDER WILL BE MARKED AS FAILED (not provisioned)`);
          
          // Set flag to prevent continuation after loop
          safetyCheckFailed = true;
          
          // Mark order as failed immediately
          await Order.findByIdAndUpdate(order._id, {
            provisioningStatus: 'failed',
            provisioningError: `WRONG PACKAGE ASSIGNED: Customer ordered "${requestedPackage}" (${packageFirstTwo}.*) but SmartVPS assigned "${boughtIp}" (${ipFirstTwo}.*). Package likely ran out of IPs. DO NOT provision this order.`,
            status: 'failed',
            autoProvisioned: true,
            failedAt: new Date(),
          });
          
          // Throw error that will NOT be retried
          const safetyError = new Error(
            `❌ PROVISIONING BLOCKED: SmartVPS assigned IP from wrong package! ` +
            `Customer ordered "${requestedPackage}" (${packageFirstTwo}.*) but received "${boughtIp}" (${ipFirstTwo}.*). ` +
            `This order has been marked as FAILED and will NOT be provisioned. ` +
            `Reason: Package ran out of IPs or SmartVPS API bug. Admin must manually resolve.`
          );
          safetyError.isSafetyCheckFailure = true; // Mark as safety failure
          throw safetyError;
        }

        // Success - break out of retry loop
        L.line(`[SMARTVPS] ✅ buyVps succeeded on attempt ${attempt}`);
        L.line(`[SMARTVPS] ✅ IP verification passed: ${boughtIp} matches package ${requestedPackage}`);
        break;

      } catch (error) {
        lastError = error;
        L.line(`[SMARTVPS] ❌ buyVps attempt ${attempt} failed: ${error.message}`);

        // CRITICAL: If safety check failed, do NOT retry - abort immediately
        if (error.isSafetyCheckFailure || safetyCheckFailed) {
          L.line(`[SMARTVPS] ❌ Safety check failure - aborting all retries`);
          break; // Exit loop immediately, do not retry
        }

        if (attempt < maxRetries) {
          // STRATEGIC DELAYS: Give SmartVPS API time to fully process and prevent race conditions
          // Attempt 1 → Wait 2 minutes before retry 2
          // Attempt 2 → Wait 3 minutes before retry 3
          const delayMinutes = attempt + 1; // 2 min, 3 min
          const delay = delayMinutes * 60 * 1000;
          
          L.line(`[SMARTVPS] ⏳ Strategic delay: Waiting ${delayMinutes} minute(s) (${delay}ms) before retry...`);
          L.line(`[SMARTVPS] 💡 This allows SmartVPS API to fully process and prevents race conditions`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // CRITICAL: If safety check failed, abort provisioning entirely
    if (safetyCheckFailed) {
      L.line(`[SMARTVPS] ❌ ABORTING: Safety check failed - wrong IP package assigned`);
      throw lastError; // Re-throw the safety check error
    }

    // If all retries failed
    if (!buyRes || !boughtIp) {
      throw new Error(`SmartVPS buyVps failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown'}`);
    }

    // Get credentials with retry logic
    // SmartVPS needs time to provision and make credentials available
    let statusObj = {};
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        L.line(`[SMARTVPS] Calling status(${boughtIp}) - attempt ${attempt}/${maxRetries} …`);

        const statusRaw = await this.withTimeout(
          this.smartvpsApi.status(boughtIp),
          90000, // 90 second timeout for status (was 30s)
          `SmartVPS status timeout (attempt ${attempt})`
        );

        const statusNormalized = this.normalizeSmartVpsResponse(statusRaw);
        L.kv(`[SMARTVPS] status attempt ${attempt} normalized`, statusNormalized);

        statusObj = statusNormalized;
        if (typeof statusObj === 'string') {
          try {
            statusObj = JSON.parse(statusObj);
          } catch {
            try {
              const unquoted = statusObj.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
              statusObj = JSON.parse(unquoted);
            } catch {
              statusObj = {};
            }
          }
        }

        // Success - break out of retry loop
        L.line(`[SMARTVPS] ✅ status succeeded on attempt ${attempt}`);
        break;

      } catch (error) {
        L.line(`[SMARTVPS] ❌ status attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxRetries) {
          // STRATEGIC DELAYS: Server may still be provisioning
          // Attempt 1 → Wait 1 minute before retry 2
          // Attempt 2 → Wait 2 minutes before retry 3
          const delayMinutes = attempt; // 1 min, 2 min
          const delay = delayMinutes * 60 * 1000;
          
          L.line(`[SMARTVPS] ⏳ Strategic delay: Waiting ${delayMinutes} minute(s) (${delay}ms) before retry...`);
          L.line(`[SMARTVPS] 💡 Server may still be provisioning, giving it time to complete`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    const ipAddress = statusObj.IP || boughtIp;
    const username = statusObj.Usernane || statusObj.Username || this.getLoginUsernameFromProductName(order.productName);
    const password = statusObj.Password || '';
    const os = statusObj.OS || targetOS;
    const expiryDate = statusObj.ExpiryDate ? new Date(statusObj.ExpiryDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    L.kv('[SMARTVPS] extracted.ip', ipAddress);
    L.kv('[SMARTVPS] extracted.username', username);
    L.kv('[SMARTVPS] extracted.password(masked)', password ? password.substring(0, 4) + '****' : '(blank)');
    L.kv('[SMARTVPS] extracted.os', os);
    L.kv('[SMARTVPS] extracted.expiryDate', expiryDate.toISOString());

    const updateData = {
      status: 'active',
      provisioningStatus: 'active',
      provider: 'smartvps',  // Explicitly set provider
      hostycareServiceId: undefined,
      username,
      password,
      ipAddress,
      autoProvisioned: true,
      provisioningError: '',
      os,
      expiryDate
    };
    await Order.findByIdAndUpdate(order._id, updateData);

      const totalTime = Date.now() - startTime;
      console.log("\n" + "✅".repeat(80));
      console.log(`[SMARTVPS] ✅ PROVISIONING COMPLETED`);
      console.log(`   - Order ID: ${order._id}`);
      console.log(`   - IP: ${ipAddress}`);
      console.log(`   - Username: ${username}`);
      console.log(`   - OS: ${os}`);
      console.log(`   - Total Time: ${totalTime}ms`);
      console.log("✅".repeat(80));

      return {
        success: true,
        serviceId: null,
        ipAddress,
        credentials: { username, password },
        hostname: null,
        productId: null,
        totalTime
      };

    } finally {
      // ALWAYS release the lock, even if provisioning failed
      if (lockAcquired) {
        this.releasePackageLock(pkg.name, order._id.toString());
      }
    }
  }

  // --- UTILITY METHODS -----------------------------------------------------

  // Timeout wrapper for API calls
  async withTimeout(promise, timeoutMs, errorMessage) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  // ... rest of existing code ...

  // --- HOSTYCARE PATH (same logic, extra logs) -----------------------------

  async provisionViaHostycare(order, ipStock, startTime) {
    L.head(`HOSTYCARE PATH — order ${order._id}`);

    const productNameLower = String(order.productName).toLowerCase();
    const isWindowsProduct =
      productNameLower.includes('windows') ||
      productNameLower.includes('rdp') ||
      productNameLower.includes('vps');

    const targetOS = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';
    L.kv('[HOSTYCARE] isWindowsProduct', isWindowsProduct);
    L.kv('[HOSTYCARE] targetOS', targetOS);

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      os: targetOS,
      provider: 'hostycare'  // Set provider at the start
    });

    L.line('[HOSTYCARE] Resolve memoryOptions …');
    let memoryOptions = {};
    if (ipStock.memoryOptions) {
      if (ipStock.memoryOptions instanceof Map) {
        memoryOptions = Object.fromEntries(ipStock.memoryOptions.entries());
      } else if (typeof ipStock.memoryOptions.toObject === 'function') {
        memoryOptions = ipStock.memoryOptions.toObject();
      } else if (ipStock.memoryOptions?.constructor?.name === 'Map') {
        try {
          for (const [k, v] of ipStock.memoryOptions) memoryOptions[k] = v;
        } catch { }
      } else if (typeof ipStock.memoryOptions === 'object' && ipStock.memoryOptions !== null) {
        memoryOptions = JSON.parse(JSON.stringify(ipStock.memoryOptions));
      }
      if (Object.keys(memoryOptions).length === 0) {
        const common = ['2GB', '4GB', '8GB', '16GB', '32GB'];
        for (const size of common) {
          if (ipStock.memoryOptions[size] || ipStock.memoryOptions.get?.(size)) {
            memoryOptions[size] = ipStock.memoryOptions[size] || ipStock.memoryOptions.get(size);
          }
        }
      }
    }
    L.kv('[HOSTYCARE] memoryOptions keys', Object.keys(memoryOptions));

    let memoryConfig = memoryOptions[order.memory];
    if (!memoryConfig) {
      const vars = [
        order.memory.toLowerCase(),
        order.memory.toUpperCase(),
        order.memory.replace('GB', 'gb'),
        order.memory.replace('gb', 'GB'),
      ];
      L.kv('[HOSTYCARE] trying variations', vars);
      for (const v of vars) {
        if (memoryOptions[v]) {
          memoryConfig = memoryOptions[v];
          break;
        }
      }
      if (!memoryConfig) {
        for (const v of [order.memory, ...vars]) {
          if (ipStock.memoryOptions?.[v] || ipStock.memoryOptions?.get?.(v)) {
            memoryConfig = ipStock.memoryOptions[v] || ipStock.memoryOptions.get(v);
            break;
          }
        }
      }
    }
    if (!memoryConfig) {
      const availableKeys = Object.keys(memoryOptions);
      throw new Error(
        `Memory configuration not found!\nRequested: "${order.memory}"\nAvailable options: [${availableKeys.join(', ')}]\nIP Stock: ${ipStock.name}`
      );
    }

    const productId = memoryConfig.hostycareProductId || memoryConfig.productId;
    if (!productId || String(productId).trim() === '') {
      throw new Error(
        `Memory configuration for "${order.memory}" is missing hostycareProductId!\nCurrent config: ${JSON.stringify(memoryConfig, null, 2)}\nIP Stock: ${ipStock.name}`
      );
    }

    L.kv('[HOSTYCARE] productId', productId);
    L.kv('[HOSTYCARE] productName', memoryConfig.hostycareProductName || 'N/A');

    const credentials = this.generateCredentials(order.productName);
    const hostname = this.generateHostname(order.productName, order.memory);

    L.kv('[HOSTYCARE] username', credentials.username);
    L.kv('[HOSTYCARE] password(masked)', credentials.password.substring(0, 4) + '****');
    L.kv('[HOSTYCARE] hostname', hostname);

    const orderData = {
      cycle: 'monthly',
      hostname,
      username: credentials.username,
      password: credentials.password,
      fields: this.toPlainObject(memoryConfig.fields || ipStock.defaultConfigurations || {}),
      configurations: this.toPlainObject(memoryConfig.configurations || ipStock.defaultConfigurations || {})
    };

    try {
      L.line('[HOSTYCARE] createServer(payload) …');
      const apiResponse = await this.hostycareApi.createServer(productId, orderData);
      const serviceId = apiResponse?.data?.service?.id || apiResponse?.service?.id || apiResponse?.id;
      if (!serviceId) throw new Error(`Service ID not found in API response. Response: ${JSON.stringify(apiResponse)}`);
      L.kv('[HOSTYCARE] serviceId', serviceId);

      let ipAddress =
        apiResponse?.data?.service?.dedicatedip ||
        apiResponse?.data?.service?.dedicatedIp ||
        apiResponse?.service?.dedicatedip ||
        apiResponse?.service?.dedicatedIp ||
        apiResponse?.dedicatedip ||
        apiResponse?.dedicatedIp ||
        null;

      if (!ipAddress) L.line('[HOSTYCARE] IP not present in create response, will appear later.');

      // Format IP address with port if needed (Windows requires :49965)
      const { formatIpAddress } = await import('../lib/ipAddressHelper.js');
      const formattedIpAddress = formatIpAddress(
        ipAddress || 'Pending - Server being provisioned',
        'hostycare',
        targetOS  // Use targetOS (the newly set OS) instead of order.os (old value)
      );

      const updateData = {
        status: 'active',
        provisioningStatus: 'active',
        hostycareServiceId: serviceId,
        provider: 'hostycare',  // Explicitly set provider
        username: credentials.username,
        password: credentials.password,
        autoProvisioned: true,
        provisioningError: '',
        ipAddress: formattedIpAddress,
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      await Order.findByIdAndUpdate(order._id, updateData);

      const totalTime = Date.now() - startTime;
      console.log("\n" + "✅".repeat(80));
      console.log(`[HOSTYCARE] ✅ PROVISIONING COMPLETED`);
      console.log(`   - Order ID: ${order._id}`);
      console.log(`   - Service ID: ${serviceId}`);
      console.log(`   - IP Status: ${updateData.ipAddress}`);
      console.log(`   - Username: ${credentials.username}`);
      console.log(`   - Product ID: ${productId}`);
      console.log(`   - Hostname: ${hostname}`);
      console.log(`   - Total Time: ${totalTime}ms`);
      console.log("✅".repeat(80));

      if (!ipAddress) {
        const backgroundChecks = [300000, 600000, 900000];
        backgroundChecks.forEach((delay, index) => {
          setTimeout(async () => {
            L.line(`[HOSTYCARE] Background IP check ${index + 1} for service ${serviceId} …`);
            await this.checkAndUpdateIP(order._id, serviceId);
          }, delay);
        });
      }

      return {
        success: true,
        serviceId,
        ipAddress,
        credentials,
        hostname,
        productId,
        totalTime
      };

    } catch (apiError) {
      console.error(`[HOSTYCARE] 💥 API Error:`, apiError.message);
      throw new Error(`Hostycare API Error: ${apiError.message}`);
    }
  }

  // --- BACKGROUND IP CHECK (Hostycare) -------------------------------------

  async checkAndUpdateIP(orderId, serviceId) {
    try {
      L.line(`[BACKGROUND-IP] Checking service ${serviceId} for order ${orderId} …`);
      const serviceDetails = await this.hostycareApi.getServiceDetails(serviceId);
      const ip =
        serviceDetails?.data?.service?.dedicatedip ||
        serviceDetails?.data?.service?.dedicatedIp ||
        serviceDetails?.service?.dedicatedip ||
        serviceDetails?.service?.dedicatedIp ||
        serviceDetails?.dedicatedip ||
        serviceDetails?.dedicatedIp ||
        null;

      if (ip && ip !== 'Pending - Server being provisioned') {
        await Order.findByIdAndUpdate(orderId, { ipAddress: ip });
        L.line(`[BACKGROUND-IP] ✅ Updated IP for order ${orderId}: ${ip}`);
      } else {
        L.line(`[BACKGROUND-IP] ⌛ IP still not ready for service ${serviceId}`);
      }
    } catch (error) {
      if (String(error.message || '').includes('Details unavailable')) {
        L.line(`[BACKGROUND-IP] ⌛ Service ${serviceId} still provisioning`);
      } else {
        console.error(`[BACKGROUND-IP] ❌ Error checking IP for service ${serviceId}:`, error.message);
      }
    }
  }

  // Retryable error helper (kept)
  isRetryableError(errorMessage) {
    const retryable = [
      'Password strength should not be less than 100',
      'The following IP(s) are used by another VPS'
    ];
    return retryable.some(e => String(errorMessage || '').toLowerCase().includes(e.toLowerCase()));
  }

  // Status check for Hostycare (kept)
  async checkServiceStatus(orderId, serviceId) {
    try {
      L.line(`[STATUS] Checking service ${serviceId} for order ${orderId} …`);
      const serviceDetails = await this.hostycareApi.getServiceDetails(serviceId);
      const ip =
        serviceDetails?.data?.service?.dedicatedip ||
        serviceDetails?.service?.dedicatedip ||
        serviceDetails?.dedicatedip ||
        serviceDetails?.ipAddress ||
        null;

      if (ip) {
        await Order.findByIdAndUpdate(orderId, { ipAddress: ip });
        L.line(`[STATUS] ✅ Updated IP for order ${orderId}: ${ip}`);
      } else {
        L.line(`[STATUS] ⚠️ IP not available yet for service ${serviceId}`);
      }
    } catch (error) {
      console.error(`[STATUS] ❌ Failed to check service ${serviceId} for order ${orderId}:`, error);
    }
  }

  // Bulk provision (kept)
  async bulkProvision(orderIds) {
    L.head(`BULK PROVISION: ${orderIds.length} orders`);
    const results = [];
    for (const orderId of orderIds) {
      L.line(`Processing ${orderId} …`);
      const result = await this.provisionServer(orderId);
      results.push({ orderId, ...result });
      L.line(`Result for ${orderId}: ${result.success ? 'SUCCESS' : `FAILED: ${result.error}`}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    L.line(`Bulk done — success=${results.filter(r => r.success).length}, failed=${results.filter(r => !r.success).length}`);
    return results;
  }
}

module.exports = AutoProvisioningService;
