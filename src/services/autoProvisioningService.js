// /src/services/autoProvisioningService.js

const HostycareAPI = require('./hostycareApi');
const SmartVpsAPI = require('./smartvpsApi');              // SmartVPS client (with its own logging)
const AdvpsAPI = require('./advpsApi');
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
    this.advpsApi = new AdvpsAPI();
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

  // --- ADVPS HELPERS --------------------------------------------------------

  isAdvpsStock(ipStock, order) {
    const tags = Array.isArray(ipStock?.tags) ? ipStock.tags : [];
    const provider = (ipStock?.provider || '').toString().toLowerCase();
    const name = (ipStock?.name || '').toString();
    const product = (order?.productName || '').toString();

    const taggedAdvps = tags.some(t => String(t).toLowerCase() === 'advps');
    const byProvider = provider === 'advps';
    const byNameEmoji = name.startsWith('⚡');
    const byProductEmoji = product.startsWith('⚡');

    const hasAdvpsConfig = !!(ipStock?.defaultConfigurations?.advps ||
      ipStock?.defaultConfigurations?.get?.('advps'));

    const isAdvps = taggedAdvps || byProvider || byNameEmoji || hasAdvpsConfig || byProductEmoji;

    L.kv('ADVPS detection', {
      taggedAdvps, byProvider, byNameEmoji, hasAdvpsConfig, byProductEmoji,
      result: isAdvps
    });

    return isAdvps;
  }

  /**
   * Fetch available OS options from ADVPS and match the target OS string.
   * @param {string} targetOS - e.g. "Ubuntu 22", "Windows 2022 64"
   * @param {string} vmType - "LXC" or "VM" (maps to ADVPS type "lxc" or "vps")
   */
  async resolveAdvpsOsId(targetOS, vmType) {
    L.line(`[ADVPS] Resolving OS ID for target: "${targetOS}" (vmType: ${vmType})`);
    try {
      const osType = String(vmType).toUpperCase() === 'VM' ? 'vps' : 'lxc';
      const res = await this.advpsApi.listOs(osType);
      const osList = res?.data?.os || res?.data || [];

      if (!Array.isArray(osList) || osList.length === 0) {
        L.line(`[ADVPS] OS list empty or unexpected format, will skip osId`);
        return null;
      }

      L.kv('[ADVPS] Available OS options', osList.map(o => `${o.id}: ${o.name}`));

      const target = String(targetOS).toLowerCase();

      let bestMatch = null;
      let bestScore = 0;
      for (const os of osList) {
        const osName = String(os.name || '').toLowerCase();
        let score = 0;

        if (target.includes('ubuntu')) {
          if (osName.includes('ubuntu')) score = 1;
          if (osName.includes('ubuntu') && osName.includes('22')) score = 3;
        } else if (target.includes('centos')) {
          if (osName.includes('centos')) score = 1;
          if (osName.includes('centos') && osName.includes('7')) score = 3;
        } else if (target.includes('windows')) {
          if (osName.includes('windows')) score = 1;
          if (osName.includes('windows') && osName.includes('2022')) score = 3;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = os;
        }
      }

      if (bestMatch) {
        L.kv('[ADVPS] Matched OS', { name: bestMatch.name, id: bestMatch.id, score: bestScore });
        return bestMatch.id;
      }

      const fallback = osList[0];
      L.line(`[ADVPS] No OS match found, using fallback: ${fallback.name} (${fallback.id})`);
      return fallback.id;
    } catch (e) {
      L.line(`[ADVPS] Failed to fetch OS list: ${e.message}`);
      return null;
    }
  }

  /**
   * Fallback: search ADVPS product stock API for a product matching the base name + RAM.
   * Used when the pre-synced variant mapping doesn't have the requested RAM.
   */
  async findAdvpsProductByRam(baseName, ram, vmType) {
    L.line(`[ADVPS] Fallback product search: baseName="${baseName}", ram="${ram}", vmType="${vmType}"`);
    try {
      const type = String(vmType).toUpperCase() === 'VM' ? 'vps' : 'linux';
      const allProducts = await this.advpsApi.productStockAll({ type });
      L.kv('[ADVPS] Products from API', allProducts.length);

      const ramNum = String(ram).replace(/[^0-9]/g, '');

      for (const product of allProducts) {
        const pName = String(product.name || '');
        const pRam = String(pName.match(/(\d+)\s*GB/i)?.[1] || '');

        if (pRam === ramNum) {
          const pBaseName = pName.replace(/\s*\d+\s*GB\s*/i, ' ').replace(/\s+/g, ' ').trim();
          if (pBaseName.toLowerCase() === baseName.toLowerCase()) {
            L.kv('[ADVPS] Fallback match found', { id: product.id, name: pName, stock: product.stock });
            if (Number(product.stock || 0) <= 0 && product.stockStatus === 'OUT_OF_STOCK') {
              L.line(`[ADVPS] ⚠️ Matched product is OUT_OF_STOCK, continuing search...`);
              continue;
            }
            return { productId: String(product.id), productName: pName };
          }
        }
      }

      // Broader search: match any product with matching RAM across all base names
      for (const product of allProducts) {
        const pName = String(product.name || '');
        const pRam = String(pName.match(/(\d+)\s*GB/i)?.[1] || '');

        if (pRam === ramNum && Number(product.stock || 0) > 0) {
          const pBaseName = pName.replace(/\s*\d+\s*GB\s*/i, ' ').replace(/\s+/g, ' ').trim();
          // Check if product name partially matches the IPStock base name
          const baseWords = baseName.toLowerCase().split(/\s+/);
          const pWords = pBaseName.toLowerCase().split(/\s+/);
          const overlap = baseWords.filter(w => pWords.includes(w)).length;
          if (overlap >= Math.min(2, baseWords.length)) {
            L.kv('[ADVPS] Fallback partial match', { id: product.id, name: pName, overlap });
            return { productId: String(product.id), productName: pName };
          }
        }
      }

      return null;
    } catch (e) {
      L.line(`[ADVPS] Fallback product search failed: ${e.message}`);
      return null;
    }
  }

  // --- SMARTVPS HELPERS ----------------------------------------------------

  // Decide if this IPStock belongs to SmartVPS
  // Detection methods:
  // 1) tags include "smartvps" OR "ocean linux" (Ocean Linux = SmartVPS)
  // 2) provider field equals "smartvps"
  // 3) name starts with 🌊 (Ocean Linux emoji)
  // 4) has defaultConfigurations.smartvps block
  // 5) productName starts with 🌊
  isSmartVpsStock(ipStock, order) {
    const tags = Array.isArray(ipStock?.tags) ? ipStock.tags : [];
    const provider = (ipStock?.provider || '').toString().toLowerCase();
    const name = (ipStock?.name || '').toString();
    const product = (order?.productName || '').toString();

    // Check tags - both 'smartvps' and 'ocean linux' indicate SmartVPS
    const taggedSmartVps = tags.some(t => String(t).toLowerCase() === 'smartvps');
    const taggedOceanLinux = tags.some(t => String(t).toLowerCase() === 'ocean linux');

    // Check provider field
    const byProvider = provider === 'smartvps';

    // Check name starts with 🌊 (Ocean Linux naming convention)
    const byNameEmoji = name.startsWith('🌊');

    // Check if has smartvps config block
    const hasSmartVpsConfig = !!(ipStock?.defaultConfigurations?.smartvps ||
      ipStock?.defaultConfigurations?.get?.('smartvps'));

    // Check product name starts with 🌊
    const byProductEmoji = product.startsWith('🌊');

    const isSmartVps = taggedSmartVps || taggedOceanLinux || byProvider ||
      byNameEmoji || hasSmartVpsConfig || byProductEmoji;

    L.kv('IPStock.tags', tags);
    L.kv('IPStock.provider', ipStock?.provider || '(missing)');
    L.kv('IPStock.name', ipStock?.name || '(missing)');
    L.kv('Order.productName', order?.productName || '(missing)');
    L.kv('SmartVPS detection', {
      taggedSmartVps, taggedOceanLinux, byProvider,
      byNameEmoji, hasSmartVpsConfig, byProductEmoji,
      result: isSmartVps
    });

    return isSmartVps;
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
/**
 * CORRECTED VERSION - Pick a package from Smart VPS ipstock
 * 
 * KEY INSIGHT: The ipstock API returns PACKAGE NAMES and IP COUNTS, not individual IPs!
 * 
 * Example response:
 * {
 *   "packages": [
 *     {"id": 5, "name": "103.82.72", "ipv4": 71, "status": "active"}
 *   ]
 * }
 * 
 * We search for a matching package and return its NAME (e.g., "103.82.72"),
 * then buyVps("103.82.72", "16") will assign a random IP from that package's pool.
 */async pickSmartVpsIpForPackage(pkgName) {
    try {
      L.line('[SMARTVPS] Calling ipstock() …');
      const res = await this.smartvpsApi.ipstock();
      const data = this.normalizeSmartVpsResponse(res);

      // Parse response to get packages array
      let parsed = data;
      if (typeof data === 'string') {
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          L.line(`[SMARTVPS] Failed to parse ipstock response: ${e.message}`);
          throw new Error('Invalid ipstock response format');
        }
      }

      const packages = parsed?.packages || [];
      L.line(`[SMARTVPS] Found ${packages.length} packages in ipstock`);

      if (packages.length === 0) {
        throw new Error('No packages available in SmartVPS ipstock');
      }

      // Strategy: Try to find exact match first, then similar packages
      const requestedPrefix = String(pkgName).trim();
      const parts = requestedPrefix.split('.');
      const numericParts = parts.filter(p => /^\d+$/.test(p));

      let selectedPackage = null;
      let matchStrategy = null;

      // 1. Try EXACT match (e.g., "103.82.72" === "103.82.72")
      selectedPackage = packages.find(pkg =>
        pkg.name === requestedPrefix &&
        pkg.status === 'active' &&
        Number(pkg.ipv4 || 0) > 0
      );

      if (selectedPackage) {
        matchStrategy = `exact match`;
      } else if (numericParts.length >= 3) {
        // 2. Try exact 3-octet match (e.g., "103.82.72" matches "103.82.72")
        const prefix3 = numericParts.slice(0, 3).join('.');
        selectedPackage = packages.find(pkg => {
          const pkgName = String(pkg.name || '').replace(/[^0-9.]/g, '');
          return pkgName.startsWith(prefix3) &&
            pkg.status === 'active' &&
            Number(pkg.ipv4 || 0) > 0;
        });

        if (selectedPackage) {
          matchStrategy = `3-octet prefix match (${prefix3})`;
        } else {
          // 3. Fallback to 2-octet match (e.g., "103.82.*")
          const prefix2 = numericParts.slice(0, 2).join('.');
          selectedPackage = packages.find(pkg => {
            const pkgName = String(pkg.name || '').replace(/[^0-9.]/g, '');
            return pkgName.startsWith(prefix2) &&
              pkg.status === 'active' &&
              Number(pkg.ipv4 || 0) > 0;
          });

          if (selectedPackage) {
            matchStrategy = `2-octet prefix match (${prefix2})`;
            L.line(`[SMARTVPS] ⚠️ No exact match for ${requestedPrefix}, using fallback`);
          }
        }
      } else {
        // Only 2 octets requested, try prefix match
        const prefix2 = numericParts.slice(0, 2).join('.');
        selectedPackage = packages.find(pkg => {
          const pkgName = String(pkg.name || '').replace(/[^0-9.]/g, '');
          return pkgName.startsWith(prefix2) &&
            pkg.status === 'active' &&
            Number(pkg.ipv4 || 0) > 0;
        });

        if (selectedPackage) {
          matchStrategy = `2-octet prefix match`;
        }
      }

      L.kv('[SMARTVPS] Requested package', requestedPrefix);
      L.kv('[SMARTVPS] Match strategy', matchStrategy || 'none');

      if (selectedPackage) {
        L.kv('[SMARTVPS] Selected package name', selectedPackage.name);
        L.kv('[SMARTVPS] Available IPs in package', selectedPackage.ipv4);
        L.line(`[SMARTVPS] ✅ Will request package "${selectedPackage.name}" and SmartVPS will assign an IP from its pool`);

        // Return the PACKAGE NAME (not a full IP) - SmartVPS will assign an IP from this package
        return selectedPackage.name;
      }

      // No match found
      L.line(`[SMARTVPS] ❌ No matching package found`);
      L.line(`[SMARTVPS] Available packages:`);
      packages.filter(p => p.status === 'active').slice(0, 10).forEach(p => {
        L.line(`  - ${p.name} (${p.ipv4} IPs available)`);
      });

      throw new Error(`No package matching or similar to "${requestedPrefix}" found in ipstock`);

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
      L.kv('[SMARTVPS]   → Name (current in API)', exactMatch.name);
      L.kv('[SMARTVPS]  → Name (customer ordered)', storedName);
      L.kv('[SMARTVPS]   → Status', exactMatch.status);
      L.kv('[SMARTVPS]   → Available IPv4', exactMatch.ipv4);

      // CRITICAL: Return the STORED name (what customer ordered), not the current API name
      // Even if SmartVPS renamed the package, we need to search for IPs matching what the customer ordered
      return { id: exactMatch.id, name: storedName };
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
      // =====================================================================
      // STEP 1: ATOMIC DATABASE LOCK - Prevents duplicate provisioning
      // This is CRITICAL for serverless environments where in-memory locks don't work
      // We use MongoDB's findOneAndUpdate with conditions to atomically acquire a lock
      // =====================================================================
      L.head('STEP 1: ATOMIC DATABASE LOCK & DUPLICATE CHECK');

      // Generate a unique lock ID for this provisioning attempt
      const lockId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      L.kv('Lock ID', lockId);

      // Attempt to atomically acquire the provisioning lock
      // This will ONLY succeed if:
      // 1. provisioningStatus is NOT 'provisioning' or 'active'
      // 2. OR if 'provisioning' status is older than 5 minutes (stale lock)
      // 3. AND order exists
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const lockedOrder = await Order.findOneAndUpdate(
        {
          _id: orderId,
          $or: [
            // Order not yet provisioned or provisioning
            { provisioningStatus: { $nin: ['provisioning', 'active'] } },
            // OR stale provisioning lock (older than 5 minutes)
            {
              provisioningStatus: 'provisioning',
              lastProvisionAttempt: { $lt: fiveMinutesAgo }
            }
          ],
          // Extra safety: Don't provision if already has IP address
          ipAddress: { $in: [null, '', undefined] }
        },
        {
          $set: {
            provisioningStatus: 'provisioning',
            lastProvisionAttempt: new Date(),
            provisioningLockId: lockId,
            autoProvisioned: true
          }
        },
        {
          new: true,
          runValidators: false
        }
      );

      // If we couldn't acquire the lock, check why
      if (!lockedOrder) {
        const existingOrder = await Order.findById(orderId);

        if (!existingOrder) {
          throw new Error(`Order ${orderId} not found in database`);
        }

        // Check if already provisioned successfully
        if (existingOrder.provisioningStatus === 'active' && existingOrder.ipAddress) {
          L.line(`\n⚠️⚠️⚠️ ORDER ALREADY PROVISIONED ⚠️⚠️⚠️`);
          L.kv('  → IP Address', existingOrder.ipAddress);
          L.kv('  → Provider', existingOrder.provider);
          L.kv('  → Username', existingOrder.username);
          L.line(`⚠️⚠️⚠️ SKIPPING PROVISIONING ⚠️⚠️⚠️\n`);

          return {
            success: true,
            alreadyProvisioned: true,
            ipAddress: existingOrder.ipAddress,
            credentials: { username: existingOrder.username, password: existingOrder.password },
            message: 'Order was already provisioned successfully',
            totalTime: Date.now() - startTime
          };
        }

        // Check if currently being provisioned by another process
        if (existingOrder.provisioningStatus === 'provisioning') {
          const timeSinceAttempt = existingOrder.lastProvisionAttempt
            ? Date.now() - new Date(existingOrder.lastProvisionAttempt).getTime()
            : 0;

          L.line(`\n⏳⏳⏳ ORDER CURRENTLY BEING PROVISIONED BY ANOTHER PROCESS ⏳⏳⏳`);
          L.kv('  → Lock ID', existingOrder.provisioningLockId || 'unknown');
          L.kv('  → Time since attempt', `${Math.round(timeSinceAttempt / 1000)}s ago`);
          L.line(`⏳⏳⏳ ABORTING TO PREVENT DUPLICATE ⏳⏳⏳\n`);

          return {
            success: false,
            alreadyProvisioning: true,
            message: `Order is currently being provisioned by another process (lock: ${existingOrder.provisioningLockId})`,
            totalTime: Date.now() - startTime
          };
        }

        // Check if order already has an IP (somehow)
        if (existingOrder.ipAddress) {
          L.line(`\n⚠️⚠️⚠️ ORDER ALREADY HAS IP ADDRESS ⚠️⚠️⚠️`);
          L.kv('  → IP Address', existingOrder.ipAddress);
          L.line(`⚠️⚠️⚠️ SKIPPING PROVISIONING ⚠️⚠️⚠️\n`);

          return {
            success: true,
            alreadyProvisioned: true,
            ipAddress: existingOrder.ipAddress,
            message: 'Order already has an IP address assigned',
            totalTime: Date.now() - startTime
          };
        }

        throw new Error(`Failed to acquire provisioning lock for order ${orderId}. Current status: ${existingOrder.provisioningStatus}`);
      }

      // Lock acquired successfully!
      const order = lockedOrder;
      L.line(`\n🔒🔒🔒 PROVISIONING LOCK ACQUIRED 🔒🔒🔒`);
      L.kv('  → Lock ID', lockId);
      L.kv('  → Order ID', order._id.toString());

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

      L.line(`✅ Database lock acquired, proceeding with provisioning...`);

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

      const advps = this.isAdvpsStock(ipStock, order);
      const smartVps = !advps && this.isSmartVpsStock(ipStock, order);
      const providerName = advps ? 'ADVPS' : smartVps ? 'SmartVPS' : 'Hostycare';
      L.line(`➡ Provider route selected: ${providerName}`);

      // Branch
      if (advps) {
        return await this.provisionViaAdvps(order, ipStock, startTime);
      } else if (smartVps) {
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

  // --- ADVPS PATH -----------------------------------------------------------

  async provisionViaAdvps(order, ipStock, startTime) {
    L.head(`ADVPS PATH — order ${order._id}`);

    const productNameLower = String(order.productName).toLowerCase();
    const isWindowsProduct =
      productNameLower.includes('windows') ||
      productNameLower.includes('rdp') ||
      productNameLower.includes('vps');

    const targetOS = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';
    L.kv('[ADVPS] isWindowsProduct', isWindowsProduct);
    L.kv('[ADVPS] targetOS', targetOS);

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      os: targetOS,
      provider: 'advps'
    });

    // --- Resolve ADVPS config from IPStock ---
    const advpsConfig = ipStock?.defaultConfigurations?.get?.('advps') ||
      ipStock?.defaultConfigurations?.advps;

    if (!advpsConfig) {
      throw new Error('IPStock missing ADVPS configuration (defaultConfigurations.advps)');
    }

    const vmType = String(advpsConfig.vmType || '').toUpperCase();
    const isVps = vmType === 'VM';
    L.kv('[ADVPS] vmType', vmType);
    L.kv('[ADVPS] isVps', isVps);

    // --- Resolve ADVPS product ID ---
    // ADVPS products are NOT named with RAM (e.g. "Turbo VPS (103.109.XX.X)").
    // Each product ID supports multiple RAM sizes — the purchase API's `ram`
    // parameter selects the variation internally. So we just need ANY variant's
    // productId from the config, then pass the customer's requested RAM to the API.
    const variants = advpsConfig.variants instanceof Map
      ? Object.fromEntries(advpsConfig.variants)
      : (advpsConfig.variants || {});

    const ram = order.memory;
    const availableRams = Object.keys(variants);
    L.kv('[ADVPS] Order RAM', ram);
    L.kv('[ADVPS] Synced variant keys', availableRams);

    // Try exact RAM key match first, then fall back to ANY variant's productId
    let advpsProductId;
    const ramVariations = [
      ram, ram?.toLowerCase(), ram?.toUpperCase(),
      ram?.replace('GB', 'gb'), ram?.replace('gb', 'GB'),
    ].filter(Boolean);

    for (const v of ramVariations) {
      if (variants[v]?.productId) {
        advpsProductId = String(variants[v].productId);
        L.kv('[ADVPS] Exact RAM match', { ram: v, productId: advpsProductId });
        break;
      }
    }

    if (!advpsProductId) {
      // Use ANY variant's productId — ADVPS products have a single ID for all RAM sizes
      const anyVariant = Object.values(variants).find(v => v?.productId);
      if (anyVariant) {
        advpsProductId = String(anyVariant.productId);
        L.line(`[ADVPS] RAM "${ram}" not a synced key [${availableRams.join(', ')}] — using product ID from existing variant (same product handles all RAM sizes)`);
        L.kv('[ADVPS] Product ID (from variant)', advpsProductId);
        L.kv('[ADVPS] Product name', anyVariant.productName || '(unknown)');
      }
    }

    if (!advpsProductId) {
      throw new Error(
        `ADVPS config has no variants with a productId. ` +
        `IPStock: ${ipStock.name} (${ipStock._id}). ` +
        `Run /api/advps/sync to refresh product catalog.`
      );
    }

    // --- Resolve OS ID ---
    const osId = await this.resolveAdvpsOsId(targetOS, vmType);
    L.kv('[ADVPS] Resolved osId', osId || '(none — will let API pick default)');

    // --- Check if purchase was already made (idempotent re-entry from cron) ---
    const existingAdvpsOrderId = order.advpsOrderId;
    let advpsOrderId;
    let initialPassword = '';

    if (existingAdvpsOrderId) {
      L.line(`[ADVPS] Purchase already made — advpsOrderId=${existingAdvpsOrderId}, skipping purchase`);
      advpsOrderId = existingAdvpsOrderId;
      initialPassword = order.password || '';
    } else {
      // --- Place the purchase ---
      const ramFormatted = String(ram).replace(/(\d+)\s*gb/i, '$1 GB');
      const remark = `Auto-provisioned order ${order._id}`;
      let purchaseRes;

      if (isVps) {
        let customerName = order.customerName || order.webhookCustomerName || '';
        let customerEmail = order.customerEmail || order.webhookCustomerEmail || '';

        if (!customerName || !customerEmail) {
          try {
            const User = require('@/models/userModel').default;
            const user = await User.findById(order.user).select('name email').lean();
            if (user) {
              customerName = customerName || user.name || 'Customer';
              customerEmail = customerEmail || user.email || '';
            }
          } catch (e) {
            L.line(`[ADVPS] Could not load user for customer info: ${e.message}`);
          }
        }

        if (!customerEmail) {
          throw new Error('Cannot purchase ADVPS VPS: no customer email available on order or user');
        }

        L.line(`[ADVPS] Purchasing VPS: productId=${advpsProductId}, ram=${ramFormatted}, osId=${osId}, name=${customerName}, email=${customerEmail}`);
        purchaseRes = await this.advpsApi.purchaseVps({
          productId: advpsProductId, ram: ramFormatted, osId,
          quantity: 1, name: customerName, email: customerEmail,
          validity: 30, remark,
        });
      } else {
        L.line(`[ADVPS] Purchasing Linux: productId=${advpsProductId}, ram=${ramFormatted}, osId=${osId}`);
        purchaseRes = await this.advpsApi.purchaseLinux({
          productId: advpsProductId, ram: ramFormatted, osId,
          quantity: 1, validity: 30, remark,
        });
      }

      L.kv('[ADVPS] Purchase response status', purchaseRes?.status);
      const purchaseData = purchaseRes?.data || purchaseRes;
      const advpsOrder = purchaseData?.order;

      if (!advpsOrder || !advpsOrder.orderId) {
        throw new Error(`ADVPS purchase did not return an order ID. Response: ${JSON.stringify(purchaseRes).slice(0, 500)}`);
      }

      advpsOrderId = advpsOrder.orderId;
      initialPassword = purchaseData?.password || '';

      L.kv('[ADVPS] Purchase order ID', advpsOrderId);
      L.kv('[ADVPS] Purchase status', advpsOrder.status);
      L.kv('[ADVPS] Total amount', advpsOrder.totalAmount);
      if (initialPassword) {
        L.kv('[ADVPS] Initial password from purchase', initialPassword.substring(0, 4) + '****');
      }

      // Persist immediately so cron can resume without re-purchasing
      await Order.findByIdAndUpdate(order._id, {
        advpsOrderId,
        advpsProductId,
        provider: 'advps',
        autoProvisioned: true,
        ...(initialPassword ? { password: initialPassword } : {}),
      });
    }

    // --- Quick poll: check order details 3 times (total ~65s) ---
    // If ADVPS hasn't assigned yet, mark as failed so the cron retries later.
    L.line(`[ADVPS] Checking order details for ${advpsOrderId}...`);

    const pollDelays = [15000, 20000, 30000];
    let assignedService = null;

    for (let i = 0; i < pollDelays.length; i++) {
      await new Promise(resolve => setTimeout(resolve, pollDelays[i]));

      try {
        const detailsRes = await this.advpsApi.getOrderDetails(advpsOrderId);
        const orderDetails = detailsRes?.data || detailsRes;
        const orderStatus = orderDetails?.order?.status || '';
        const services = orderDetails?.services || [];

        L.line(`[ADVPS] Poll ${i + 1}/${pollDelays.length}: status=${orderStatus}, services=${services.length}`);

        if (services.length > 0 && services[0].ip) {
          assignedService = services[0];
          L.line(`[ADVPS] Service assigned with IP: ${assignedService.ip}`);
          break;
        }

        if (orderStatus === 'ASSIGNED' && services.length > 0) {
          assignedService = services[0];
          L.line(`[ADVPS] Order ASSIGNED, service found`);
          break;
        }

        if (orderStatus === 'FAILED' || orderStatus === 'CANCELLED' || orderStatus === 'REJECTED') {
          throw new Error(`ADVPS order ${advpsOrderId} reached terminal status: ${orderStatus}`);
        }
      } catch (pollErr) {
        if (pollErr.message.includes('terminal status')) throw pollErr;
        L.line(`[ADVPS] Poll ${i + 1} error: ${pollErr.message}`);
      }
    }

    // --- Extract credentials if assigned ---
    let ipAddress = '';
    let username = '';
    let password = initialPassword;
    let advpsServiceId = '';
    let expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (assignedService) {
      ipAddress = assignedService.ip || '';
      username = assignedService.username || (isWindowsProduct ? 'Administrator' : 'root');
      password = assignedService.password || initialPassword || '';
      advpsServiceId = assignedService.id || '';
      if (assignedService.expiryDate) expiryDate = new Date(assignedService.expiryDate);

      L.kv('[ADVPS] Service ID', advpsServiceId);
      L.kv('[ADVPS] IP', ipAddress);
      L.kv('[ADVPS] Username', username);
      L.kv('[ADVPS] Password (masked)', password ? password.substring(0, 4) + '****' : '(blank)');
      L.kv('[ADVPS] Expiry', expiryDate.toISOString());

      // If service assigned but no password, try generate-password once
      if (!password && advpsServiceId) {
        L.line(`[ADVPS] No password in order details, trying generate-password...`);
        try {
          await this.advpsApi.start(advpsServiceId);
        } catch (_) { /* may already be running */ }
        await new Promise(r => setTimeout(r, 15000));
        try {
          const passRes = await this.advpsApi.generatePassword(advpsServiceId);
          const pd = passRes?.data || {};
          password = pd.password || pd.newPassword || pd.existingPassword || '';
          if (password) L.kv('[ADVPS] Password generated', password.substring(0, 4) + '****');
        } catch (passErr) {
          L.line(`[ADVPS] generate-password: ${passErr.message}`);
        }
      }

      // If assigned but no IP, try get-ip
      if (!ipAddress && advpsServiceId) {
        try {
          const ipRes = await this.advpsApi.getIp(advpsServiceId);
          ipAddress = ipRes?.data?.ip || '';
          if (ipAddress) L.kv('[ADVPS] IP from get-ip', ipAddress);
        } catch (e) {
          L.line(`[ADVPS] get-ip failed: ${e.message}`);
        }
      }
    }

    // --- Update order ---
    const fullyProvisioned = !!(ipAddress && advpsServiceId);
    const resolvedUsername = username || (isWindowsProduct ? 'Administrator' : 'root');
    const updateData = {
      status: fullyProvisioned ? 'active' : 'confirmed',
      provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
      provisioningError: fullyProvisioned ? '' : `ADVPS_PENDING: Order ${advpsOrderId} placed, awaiting assignment. Cron will check.`,
      provider: 'advps',
      advpsServiceId: advpsServiceId || undefined,
      advpsOrderId,
      advpsProductId,
      username: resolvedUsername,
      password,
      ipAddress: ipAddress || '',
      autoProvisioned: true,
      os: targetOS,
      expiryDate,
    };

    if (!fullyProvisioned) {
      updateData.provisioningLockId = undefined;
      updateData.lastProvisionAttempt = new Date();
    }

    await Order.findByIdAndUpdate(order._id, updateData);

    const totalTime = Date.now() - startTime;
    console.log("\n" + "✅".repeat(80));
    console.log(`[ADVPS] ✅ PROVISIONING ${fullyProvisioned ? 'COMPLETED' : 'PENDING — cron will check'}`);
    console.log(`   - Order ID: ${order._id}`);
    console.log(`   - ADVPS Order: ${advpsOrderId}`);
    console.log(`   - ADVPS Service: ${advpsServiceId || 'pending'}`);
    console.log(`   - IP: ${ipAddress || 'pending'}`);
    console.log(`   - Username: ${resolvedUsername}`);
    console.log(`   - OS: ${targetOS}`);
    console.log(`   - Total Time: ${totalTime}ms`);
    console.log("✅".repeat(80));

    return {
      success: fullyProvisioned,
      advpsPending: !fullyProvisioned,
      serviceId: advpsServiceId || null,
      ipAddress: ipAddress || null,
      credentials: { username: resolvedUsername, password },
      hostname: null,
      productId: advpsProductId,
      totalTime,
      ...(fullyProvisioned ? {} : { error: `ADVPS order ${advpsOrderId} pending assignment, cron will check` }),
    };
  }

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

    // Extract IP prefix from product name (e.g., "🌊 103.82.72" -> "103.82.72")
    // Remove emoji, spaces, and extract the IP pattern
    const productNameClean = String(order.productName || '').replace(/[^\d.]/g, '');
    const requestedIpPrefix = productNameClean.trim();

    L.line(`[SMARTVPS] Customer ordered product: ${order.productName}`);
    L.kv('[SMARTVPS] Extracted IP prefix', requestedIpPrefix);

    if (!requestedIpPrefix || !requestedIpPrefix.match(/^\d+\.\d+/)) {
      throw new Error(`Cannot extract IP prefix from product name "${order.productName}". Expected format like "🌊 103.82.72"`);
    }

    // CRITICAL: Pick a SPECIFIC IP from ipstock matching what customer ordered
    // We don't care about package IDs or package names - just find IPs in the requested range!
    // According to SmartVPS docs: "First you need to call ipstock api to get the available ip 
    // and then call this api to buy the vps"
    let specificIpToBuy;
    try {
      L.line(`[SMARTVPS] Searching ipstock for available IPs matching: ${requestedIpPrefix}.*`);
      specificIpToBuy = await this.pickSmartVpsIpForPackage(requestedIpPrefix);
      L.kv('[SMARTVPS] Specific IP selected from ipstock', specificIpToBuy);

      if (!specificIpToBuy) {
        throw new Error(`No available IP found matching ${requestedIpPrefix}.*. Package may be out of stock.`);
      }
    } catch (ipstockError) {
      L.line(`[SMARTVPS] ❌ Failed to get IP from ipstock: ${ipstockError.message}`);

      // Mark order as failed BEFORE purchasing anything
      await Order.findByIdAndUpdate(order._id, {
        provisioningStatus: 'failed',
        provisioningError: `No available IPs matching "${requestedIpPrefix}.*". SmartVPS may be out of stock for this IP range. Error: ${ipstockError.message}`,
        autoProvisioned: true,
        provider: 'smartvps'
      });

      throw new Error(`Cannot provision: ${ipstockError.message}. No financial loss - purchase was not attempted.`);
    }

    L.line(`[SMARTVPS] ✅ Will purchase specific IP: ${specificIpToBuy} with ${ram}GB RAM`);

    // CRITICAL: Acquire lock to prevent race conditions
    // This ensures only ONE order provisions from this IP range at a time
    let lockAcquired = false;
    try {
      await this.acquirePackageLock(requestedIpPrefix, order._id.toString());
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
          // Use the SPECIFIC IP we selected from ipstock, not just package name
          L.line(`[SMARTVPS] Calling buyVps(${specificIpToBuy}, ${ram}) - attempt ${attempt}/${maxRetries} …`);

          // buyVps API has 3 minute timeout built-in, no extra wrapper needed
          buyRes = await this.smartvpsApi.buyVps(specificIpToBuy, ram);

          const buyText = typeof buyRes === 'string' ? buyRes : JSON.stringify(buyRes);
          L.kv(`[SMARTVPS] buyVps attempt ${attempt} response`, buyText.slice(0, 500));

          // Extract the assigned IP from the buy response
          boughtIp = this.extractIp(buyText);
          L.kv('[SMARTVPS] assigned/bought IP', boughtIp);
          if (!boughtIp) {
            throw new Error('SmartVPS buyVps did not return an assigned IP');
          }

          // CRITICAL SAFETY CHECK: Verify the assigned IP belongs to the requested package
          // We requested a PACKAGE NAME (e.g., "103.82.72" or "103.109.18x")
          // SmartVPS uses 'x' as a wildcard, so normalize before checking
          // 
          // Matching Strategy (lenient):
          //   1. Try exact 3-octet match (e.g., "103.82.72" matches "103.82.72.116")
          //   2. Fallback to 2-octet match (e.g., "103.181.91" matches "103.181.90.21" - close enough!)
          //
          // This prevents failures when SmartVPS assigns from neighboring packages
          const normalizedPackage = String(specificIpToBuy).replace(/x+$/i, ''); // Strip trailing 'x' wildcards
          const packageParts = normalizedPackage.split('.');
          const ipParts = String(boughtIp).split('.');

          // Check 3-octet match first
          const prefix3 = packageParts.slice(0, 3).join('.');
          const ipPrefix3 = ipParts.slice(0, 3).join('.');
          const exact3Match = ipPrefix3.startsWith(prefix3) || String(boughtIp).startsWith(normalizedPackage);

          // Fallback: Check 2-octet match (e.g., 103.181.* matches 103.181.90.21)
          const prefix2 = packageParts.slice(0, 2).join('.');
          const ipPrefix2 = ipParts.slice(0, 2).join('.');
          const fallback2Match = (prefix2 === ipPrefix2);

          const ipMatches = exact3Match || fallback2Match;
          const matchType = exact3Match ? 'exact (3-octet)' : (fallback2Match ? 'fallback (2-octet)' : 'none');

          L.kv('[SMARTVPS]   → Requested package', specificIpToBuy);
          L.kv('[SMARTVPS]   → Normalized package prefix', normalizedPackage);
          L.kv('[SMARTVPS]   → Assigned IP from SmartVPS', boughtIp);
          L.kv('[SMARTVPS]   → Match type', matchType);
          L.kv('[SMARTVPS]   → IP accepted', ipMatches ? '✅ YES' : '❌ NO');

          if (!ipMatches) {
            L.line(`[SMARTVPS] ❌ CRITICAL: SmartVPS assigned IP from WRONG package!`);
            L.line(`[SMARTVPS]   → We requested package: ${specificIpToBuy}`);
            L.line(`[SMARTVPS]   → SmartVPS gave us IP: ${boughtIp}`);
            L.line(`[SMARTVPS]   → This IP does not belong to the requested package!`);
            L.line(`[SMARTVPS]   → ORDER WILL BE MARKED AS FAILED (not provisioned)`);

            // Set flag to prevent continuation after loop
            safetyCheckFailed = true;

            // Mark order as failed immediately
            await Order.findByIdAndUpdate(order._id, {
              provisioningStatus: 'failed',
              provisioningError: `WRONG IP ASSIGNED: Customer ordered IP range "${requestedIpPrefix}.*" and we requested IP "${specificIpToBuy}" but SmartVPS assigned "${boughtIp}". This IP does not match. DO NOT provision this order. Likely cause: IP became unavailable between ipstock check and purchase.`,
              status: 'failed',
              autoProvisioned: true,
              failedAt: new Date(),
            });

            // Throw error that will NOT be retried
            const safetyError = new Error(
              `❌ PROVISIONING BLOCKED: SmartVPS assigned wrong IP! ` +
              `Requested: "${specificIpToBuy}" but received: "${boughtIp}". ` +
              `IP range ordered: "${requestedIpPrefix}.*". Order marked as FAILED and will NOT be provisioned. ` +
              `Likely cause: IP became unavailable between ipstock check and purchase, or SmartVPS API bug. Admin must manually resolve.`
            );
            safetyError.isSafetyCheckFailure = true; // Mark as safety failure
            throw safetyError;
          }

          // Success - break out of retry loop
          L.line(`[SMARTVPS] ✅ buyVps succeeded on attempt ${attempt}`);
          L.line(`[SMARTVPS] ✅ IP verification passed: ${boughtIp} matches requested IP ${specificIpToBuy}`);
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
            // Shorter delays since buyVps API now has 3 minute timeout built-in
            // Attempt 1 → Wait 30 seconds before retry 2
            // Attempt 2 → Wait 45 seconds before retry 3
            const delaySeconds = attempt === 1 ? 30 : 45;
            const delay = delaySeconds * 1000;

            L.line(`[SMARTVPS] ⏳ Waiting ${delaySeconds}s before retry...`);
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
        this.releasePackageLock(requestedIpPrefix, order._id.toString());
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
