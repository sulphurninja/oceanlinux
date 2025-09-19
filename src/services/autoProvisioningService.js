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

class AutoProvisioningService {
  constructor() {
    this.hostycareApi = new HostycareAPI();
    this.smartvpsApi = new SmartVpsAPI();
    console.log('[AUTO-PROVISION-SERVICE] 🏗️ AutoProvisioningService instance created');
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

  async pickSmartVpsIp() {
    try {
      L.line('[SMARTVPS] Calling ipstock() …');
      const res = await this.smartvpsApi.ipstock();
      const data = this.normalizeSmartVpsResponse(res);
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      L.kv('[SMARTVPS] ipstock() normalized', text?.slice(0, 400));
      const ip = this.extractIp(text);
      if (!ip) throw new Error('No available IP found in SmartVPS ipstock');
      L.line(`[SMARTVPS] Selected IP: ${ip}`);
      return ip;
    } catch (e) {
      throw new Error(`SmartVPS ipstock failed: ${e.message}`);
    }
  }

  // BEFORE: pickSmartVpsIp() tries to regex IPv4 from ipstock
  // AFTER: pick a package by name/id, return a descriptor

  async pickSmartVpsPackage(ipStock, order) {
    try {
      L.line('[SMARTVPS] Calling ipstock() …');
      const res = await this.smartvpsApi.ipstock();
      const data = this.normalizeSmartVpsResponse(res);

      const obj = typeof data === 'string' ? JSON.parse(data) : data;
      L.kv('[SMARTVPS] ipstock() normalized', JSON.stringify(obj).slice(0, 600));

      const packages = Array.isArray(obj?.packages) ? obj.packages : [];
      if (!packages.length) throw new Error('No packages in ipstock');

      // Try to select package matching the IPStock/product name
      const want = (ipStock?.name || order?.productName || '').toString();
      const wantDigits = want.replace(/[^\d.]/g, ''); // "🏅 103.195" -> "103.195"

      // Prefer exact/contains match on name, otherwise first active
      let selected =
        packages.find(p => String(p.name).includes(wantDigits)) ||
        packages.find(p => String(p.name).toLowerCase().includes('103.195')) || // optional extra hint
        packages.find(p => String(p.status).toLowerCase() === 'active') ||
        packages[0];

      if (!selected) throw new Error('Could not choose a package from ipstock');

      L.kv('[SMARTVPS] Selected package', selected); // {id,name,ipv4,status}
      return { id: selected.id, name: selected.name };
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
    L.line('✅ Database connected');

    try {
      // STEP 1: Find the order
      L.head('STEP 1: LOAD ORDER');
      const order = await Order.findById(orderId);
      if (!order) throw new Error(`Order ${orderId} not found in database`);
      L.kv('Order._id', order._id.toString());
      L.kv('Order.productName', order.productName);
      L.kv('Order.memory', order.memory);
      L.kv('Order.price', order.price);
      L.kv('Order.status', order.status);
      L.kv('Order.os', order.os || '(Default)');
      L.kv('Order.ipStockId', order.ipStockId || '(NOT SET)');

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

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      os: targetOS
    });

    const ram = this.extractRam(order.memory);
    L.kv('[SMARTVPS] parsed RAM (GB)', ram);
    if (!ram) throw new Error(`Unable to parse RAM from memory "${order.memory}" for SmartVPS`);

    // Get package with retry logic
    const pkg = await this.pickSmartVpsPackage(ipStock, order);
    L.kv('[SMARTVPS] Using package for buy', pkg);

    // Buy VPS with timeout and retry logic
    let buyRes, boughtIp;
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        L.line(`[SMARTVPS] Calling buyVps(${pkg.name}, ${ram}) - attempt ${attempt}/${maxRetries} …`);

        // Add timeout wrapper around the API call
        buyRes = await this.withTimeout(
          this.smartvpsApi.buyVps(pkg.name, ram),
          45000, // 45 second timeout
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

        // Success - break out of retry loop
        L.line(`[SMARTVPS] ✅ buyVps succeeded on attempt ${attempt}`);
        break;

      } catch (error) {
        lastError = error;
        L.line(`[SMARTVPS] ❌ buyVps attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxRetries) {
          const delay = attempt * 5000; // 5s, 10s delay between retries
          L.line(`[SMARTVPS] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If all retries failed
    if (!buyRes || !boughtIp) {
      throw new Error(`SmartVPS buyVps failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown'}`);
    }

    // Get credentials with retry logic
    let statusObj = {};
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        L.line(`[SMARTVPS] Calling status(${boughtIp}) - attempt ${attempt}/${maxRetries} …`);

        const statusRaw = await this.withTimeout(
          this.smartvpsApi.status(boughtIp),
          30000, // 30 second timeout for status
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
          const delay = attempt * 3000; // 3s, 6s delay between retries
          L.line(`[SMARTVPS] Waiting ${delay}ms before retry...`);
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
      os: targetOS
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
