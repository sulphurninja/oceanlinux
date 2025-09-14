// /src/services/autoProvisioningService.js

const HostycareAPI = require('./hostycareApi');
const SmartVpsAPI = require('./smartvpsApi');              // <-- NEW
const connectDB = require('@/lib/db').default;             // <- add .default
const Order = require('@/models/orderModel').default;      // <- add .default
const IPStock = require('@/models/ipStockModel');          // CJS, no change

class AutoProvisioningService {
  constructor() {
    this.hostycareApi = new HostycareAPI();
    this.smartvpsApi = new SmartVpsAPI();                 // <-- NEW
    console.log('[AUTO-PROVISION-SERVICE] 🏗️ AutoProvisioningService instance created');
  }

  // ULTRA-SIMPLE password generator (kept)
  generateCredentials(productName = '') {
    console.log('[AUTO-PROVISION-SERVICE] 🔐 Generating ultra-simple credentials...');

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

    console.log('[AUTO-PROVISION-SERVICE] ✅ Ultra-simple credentials generated:');
    console.log(`   - Username: ${username}`);
    console.log(`   - Password: ${password.substring(0, 4)}**** (12 chars, ONLY @#&$ specials)`);
    return { username, password };
  }

  generateHostname(productName, memory) {
    console.log('[AUTO-PROVISION-SERVICE] 🌐 Generating hostname...');
    const cleanName = String(productName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const memoryCode = String(memory || '').toLowerCase().replace('gb', '');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const hostname = `${cleanName}-${memoryCode}gb-${randomSuffix}.com`;
    console.log('[AUTO-PROVISION-SERVICE] ✅ Generated hostname:', hostname);
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
  // Convention: a tag "smartvps" (case-insensitive) marks SmartVPS products.
  isSmartVpsStock(ipStock) {
    const tags = Array.isArray(ipStock?.tags) ? ipStock.tags : [];
    return tags.some(t => String(t).toLowerCase() === 'smartvps');
  }

  // SmartVPS sometimes returns a raw string, or a stringified JSON,
  // or a normal JSON. This normalizer tries to get a usable object/string.
  normalizeSmartVpsResponse(payload) {
    try {
      if (typeof payload === 'string') {
        // Try direct JSON.parse
        const maybe = JSON.parse(payload);
        return maybe;
      }
      return payload;
    } catch {
      // If it was a string with embedded JSON quotes, try to strip quotes and parse again
      try {
        const unquoted = payload.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
        return JSON.parse(unquoted);
      } catch {
        return payload; // return as-is (string)
      }
    }
  }

  // Extract first IPv4 from any string/object
  extractIp(from) {
    const text = typeof from === 'string' ? from : JSON.stringify(from);
    const m = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    return m ? m[0] : null;
  }

  // Extract RAM number (e.g. "8GB" -> 8, "4096 MB" -> 4096? BUT SmartVPS expects GB string/number)
  extractRam(orderMemory) {
    if (!orderMemory) return null;
    // Prefer GB integer
    const gb = String(orderMemory).match(/(\d+)\s*gb/i);
    if (gb) return gb[1]; // as string, SmartVPS accepts string
    // fallback: if it's MB, convert to GB (ceil)
    const mb = String(orderMemory).match(/(\d+)\s*mb/i);
    if (mb) {
      const g = Math.max(1, Math.ceil(parseInt(mb[1], 10) / 1024));
      return String(g);
    }
    // last resort: any number
    const any = String(orderMemory).match(/(\d+)/);
    return any ? any[1] : null;
  }

  // Call SmartVPS ipstock and pick a candidate IP (best-effort)
  async pickSmartVpsIp() {
    try {
      const res = await this.smartvpsApi.ipstock();
      const data = this.normalizeSmartVpsResponse(res);

      // If it's already an object/array with IPs
      const text = typeof data === 'string' ? data : JSON.stringify(data);

      // Try to find the FIRST IPv4 in the structure
      const ip = this.extractIp(text);
      if (!ip) throw new Error('No available IP found in SmartVPS ipstock');
      return ip;
    } catch (e) {
      throw new Error(`SmartVPS ipstock failed: ${e.message}`);
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
    console.log("[AUTO-PROVISION] ✅ Database connected");

    try {
      // STEP 1: Find the order
      console.log(`[AUTO-PROVISION] 📋 STEP 1: Finding order ${orderId}...`);
      const order = await Order.findById(orderId);
      if (!order) throw new Error(`Order ${orderId} not found in database`);

      console.log(`[AUTO-PROVISION] ✅ Order found:`);
      console.log(`   - Product: ${order.productName}`);
      console.log(`   - Memory: ${order.memory}`);
      console.log(`   - Price: ₹${order.price}`);
      console.log(`   - Current OS: ${order.os || 'Default'}`);
      console.log(`   - IP Stock ID: ${order.ipStockId || 'NOT SET'}`);

      // STEP 2: Find IP Stock configuration (to decide provider)
      console.log(`[AUTO-PROVISION] 📦 STEP 2: Finding IP Stock configuration...`);
      let ipStock = null;

      if (order.ipStockId) {
        console.log(`[AUTO-PROVISION] 🔍 Looking for IP Stock by ID: ${order.ipStockId}`);
        ipStock = await IPStock.findById(order.ipStockId);
      }
      if (!ipStock) {
        console.log(`[AUTO-PROVISION] 🔍 Searching IP Stock by product name: "${order.productName}"`);
        ipStock = await IPStock.findOne({ name: { $regex: new RegExp(order.productName, 'i') } });
      }
      if (!ipStock) throw new Error(`IPStock configuration not found for product: ${order.productName}`);

      console.log(`[AUTO-PROVISION] ✅ Found IP Stock: ${ipStock.name}`);
      const smartVps = this.isSmartVpsStock(ipStock);
      console.log(`[AUTO-PROVISION] 🧭 Provider route: ${smartVps ? 'SmartVPS' : 'Hostycare'}`);

      // If SMARTVPS → run the SmartVPS path and finish; else run Hostycare path as-is
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

  async provisionViaSmartVps(order, ipStock, startTime) {
    console.log(`[SMARTVPS] 🧭 Entering SmartVPS provisioning path for order ${order._id}`);

    // Decide OS for UX (SmartVPS will report actual OS in status)
    const isWindowsProduct = /windows|rdp|vps/i.test(String(order.productName));
    const targetOS = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      os: targetOS
    });

    // RAM to pass to buyVps
    const ram = this.extractRam(order.memory);
    if (!ram) throw new Error(`Unable to parse RAM from memory "${order.memory}" for SmartVPS`);

    // 1) pick an IP from SmartVPS ipstock
    console.log('[SMARTVPS] 📡 Fetching ipstock...');
    const candidateIp = await this.pickSmartVpsIp();
    console.log(`[SMARTVPS] ✅ Selected IP candidate: ${candidateIp}`);

    // 2) buyVps(ip, ram)
    console.log('[SMARTVPS] 🛒 Calling buyVps...');
    const buyRes = await this.smartvpsApi.buyVps(candidateIp, ram);
    const buyText = typeof buyRes === 'string' ? buyRes : JSON.stringify(buyRes);
    console.log('[SMARTVPS] 📦 buyVps response:', buyText);

    // Some responses: "success|Congratulations ... Your ip is: 103.195.26.51"
    const boughtIp = this.extractIp(buyText) || candidateIp;
    if (!boughtIp) throw new Error('SmartVPS buyVps did not return an IP');

    // 3) status(ip) → credentials
    console.log('[SMARTVPS] 🔍 Fetching status for credentials...');
    const statusRaw = await this.smartvpsApi.status(boughtIp);
    const statusNormalized = this.normalizeSmartVpsResponse(statusRaw);

    // statusNormalized might still be a string with escaped JSON. Normalize again if needed.
    let statusObj = statusNormalized;
    if (typeof statusObj === 'string') {
      try {
        statusObj = JSON.parse(statusObj);
      } catch {
        // Some endpoints double-wrap – attempt unescape approach:
        try {
          const unquoted = statusObj.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
          statusObj = JSON.parse(unquoted);
        } catch {
          // last resort: parse keys by regex
          statusObj = {};
        }
      }
    }

    // Keys seen: IP, OS, "Usernane" (typo!), Password, ExpiryDate, PowerStatus...
    const ipAddress = statusObj.IP || boughtIp;
    const username =
      statusObj.Usernane || statusObj.Username || this.getLoginUsernameFromProductName(order.productName);
    const password = statusObj.Password || '';
    const os = statusObj.OS || targetOS;
    const expiryDate =
      statusObj.ExpiryDate ? new Date(statusObj.ExpiryDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    console.log('[SMARTVPS] 🔐 Credentials from status():');
    console.log(`  - IP: ${ipAddress}`);
    console.log(`  - Username: ${username}`);
    console.log(`  - Password: ${password ? password.substring(0, 4) + '****' : '(blank)'} `);
    console.log(`  - OS: ${os}`);
    console.log(`  - Expiry: ${expiryDate.toISOString()}`);

    // 4) Save to order
    const updateData = {
      status: 'active',
      provisioningStatus: 'active',
      hostycareServiceId: undefined, // not used in SmartVPS
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
    console.log(`[SMARTVPS] ✅ PROVISIONING COMPLETED SUCCESSFULLY!`);
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
  }

  // --- HOSTYCARE PATH (UNCHANGED, just moved into a helper) ----------------

  async provisionViaHostycare(order, ipStock, startTime) {
    console.log(`[HOSTYCARE] 🧭 Entering Hostycare provisioning path for order ${order._id}`);

    // STEP: Determine OS based on productName and update order status
    const productNameLower = String(order.productName).toLowerCase();
    const isWindowsProduct =
      productNameLower.includes('windows') ||
      productNameLower.includes('rdp') ||
      productNameLower.includes('vps');

    const targetOS = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';

    console.log(`[HOSTYCARE] 🖥️ Product analysis:`);
    console.log(`   - Product Name: "${order.productName}"`);
    console.log(`   - Is Windows Product: ${isWindowsProduct}`);
    console.log(`   - Target OS: ${targetOS}`);

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      os: targetOS
    });

    // STEP: Parse memoryOptions from IPStock (your robust handling kept)
    console.log(`[HOSTYCARE] 📦 Getting memory configuration...`);
    let memoryOptions = {};
    if (ipStock.memoryOptions) {
      if (ipStock.memoryOptions instanceof Map) {
        memoryOptions = Object.fromEntries(ipStock.memoryOptions.entries());
      } else if (typeof ipStock.memoryOptions.toObject === 'function') {
        memoryOptions = ipStock.memoryOptions.toObject();
      } else if (ipStock.memoryOptions?.constructor?.name === 'Map') {
        try {
          for (const [k, v] of ipStock.memoryOptions) memoryOptions[k] = v;
        } catch {}
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

    let memoryConfig = memoryOptions[order.memory];
    if (!memoryConfig) {
      const vars = [
        order.memory.toLowerCase(),
        order.memory.toUpperCase(),
        order.memory.replace('GB', 'gb'),
        order.memory.replace('gb', 'GB'),
      ];
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

    console.log(`[HOSTYCARE] ✅ Using Hostycare Product ID: ${productId}`);
    console.log(`[HOSTYCARE] ✅ Product Name: ${memoryConfig.hostycareProductName || 'N/A'}`);

    const credentials = this.generateCredentials(order.productName);
    const hostname = this.generateHostname(order.productName, order.memory);

    console.log(`[HOSTYCARE] 🔐 Generated credentials: ${credentials.username} / ${credentials.password.substring(0, 4)}****`);
    console.log(`[HOSTYCARE] 🌐 Generated hostname: ${hostname}`);

    // Create server via Hostycare
    console.log(`[HOSTYCARE] 🚀 Creating server via Hostycare API...`);
    const orderData = {
      cycle: 'monthly',
      hostname,
      username: credentials.username,
      password: credentials.password,
      fields: this.toPlainObject(memoryConfig.fields || ipStock.defaultConfigurations || {}),
      configurations: this.toPlainObject(memoryConfig.configurations || ipStock.defaultConfigurations || {})
    };

    try {
      const apiResponse = await this.hostycareApi.createServer(productId, orderData);
      const serviceId = apiResponse?.data?.service?.id || apiResponse?.service?.id || apiResponse?.id;
      if (!serviceId) throw new Error(`Service ID not found in API response. Response: ${JSON.stringify(apiResponse)}`);
      console.log(`[HOSTYCARE] 🆔 Service ID: ${serviceId}`);

      // Try to obtain IP (may be delayed)
      let ipAddress =
        apiResponse?.data?.service?.dedicatedip ||
        apiResponse?.data?.service?.dedicatedIp ||
        apiResponse?.service?.dedicatedip ||
        apiResponse?.service?.dedicatedIp ||
        apiResponse?.dedicatedip ||
        apiResponse?.dedicatedIp ||
        null;

      if (!ipAddress) {
        console.log(`[HOSTYCARE] ⌛ IP not present in create response, will appear later.`);
      }

      const updateData = {
        status: 'active',
        provisioningStatus: 'active',
        hostycareServiceId: serviceId,
        username: credentials.username,
        password: credentials.password,
        autoProvisioned: true,
        provisioningError: '',
        ipAddress: ipAddress || 'Pending - Server being provisioned',
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      await Order.findByIdAndUpdate(order._id, updateData);

      const totalTime = Date.now() - startTime;
      console.log("\n" + "✅".repeat(80));
      console.log(`[HOSTYCARE] ✅ PROVISIONING COMPLETED SUCCESSFULLY!`);
      console.log(`   - Order ID: ${order._id}`);
      console.log(`   - Service ID: ${serviceId}`);
      console.log(`   - IP Status: ${updateData.ipAddress}`);
      console.log(`   - Username: ${credentials.username}`);
      console.log(`   - Product ID: ${productId}`);
      console.log(`   - Hostname: ${hostname}`);
      console.log(`   - Total Time: ${totalTime}ms`);
      console.log("✅".repeat(80));

      // If IP pending, background checks (kept)
      if (!ipAddress) {
        const backgroundChecks = [300000, 600000, 900000]; // 5m, 10m, 15m
        backgroundChecks.forEach((delay, index) => {
          setTimeout(async () => {
            console.log(`[HOSTYCARE] 🔍 Background check ${index + 1} for service ${serviceId}...`);
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
      console.error(`[HOSTYCARE] 💥 Hostycare API Error:`, apiError.message);
      throw new Error(`Hostycare API Error: ${apiError.message}`);
    }
  }

  // --- BACKGROUND IP CHECK (Hostycare) -------------------------------------

  async checkAndUpdateIP(orderId, serviceId) {
    try {
      console.log(`[BACKGROUND-IP] 🔍 Checking IP for order ${orderId}, service ${serviceId}`);
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
        console.log(`[BACKGROUND-IP] ✅ IP updated for order ${orderId}: ${ip}`);
      } else {
        console.log(`[BACKGROUND-IP] ⌛ IP still not ready for service ${serviceId}`);
      }
    } catch (error) {
      if (String(error.message || '').includes('Details unavailable')) {
        console.log(`[BACKGROUND-IP] ⌛ Server still being provisioned for service ${serviceId}`);
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
      console.log(`[AUTO-PROVISION] 🔍 Checking status for service ${serviceId}, order ${orderId}`);
      const serviceDetails = await this.hostycareApi.getServiceDetails(serviceId);
      const ip =
        serviceDetails?.data?.service?.dedicatedip ||
        serviceDetails?.service?.dedicatedip ||
        serviceDetails?.dedicatedip ||
        serviceDetails?.ipAddress ||
        null;

      if (ip) {
        await Order.findByIdAndUpdate(orderId, { ipAddress: ip });
        console.log(`[AUTO-PROVISION] ✅ Updated IP address for order ${orderId}: ${ip}`);
      } else {
        console.log(`[AUTO-PROVISION] ⚠️ IP address still not available for service ${serviceId}`);
      }
    } catch (error) {
      console.error(`[AUTO-PROVISION] ❌ Failed to check service status for order ${orderId}:`, error);
    }
  }

  // Bulk provision (kept)
  async bulkProvision(orderIds) {
    console.log(`[AUTO-PROVISION] 📦 Starting bulk provisioning for ${orderIds.length} orders...`);
    const results = [];
    for (const orderId of orderIds) {
      console.log(`[AUTO-PROVISION] 🔄 Processing order ${orderId}...`);
      const result = await this.provisionServer(orderId);
      results.push({ orderId, ...result });
      console.log(`[AUTO-PROVISION] ✅ Order ${orderId} completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log(`[AUTO-PROVISION] 🏁 Bulk provisioning completed: ${results.filter(r => r.success).length} successful, ${results.filter(r => !r.success).length} failed`);
    return results;
  }
}

module.exports = AutoProvisioningService;
