const HostycareAPI = require('./hostycareApi');
const connectDB = require('@/lib/db').default;       // <- add .default
const Order = require('@/models/orderModel').default; // <- add .default
const IPStock = require('@/models/ipStockModel');     // CJS, no change

class AutoProvisioningService {
  constructor() {
    this.hostycareApi = new HostycareAPI();
    console.log('[AUTO-PROVISION-SERVICE] 🏗️ AutoProvisioningService instance created');
  }

  // Generate random credentials
  generateCredentials() {
    console.log('[AUTO-PROVISION-SERVICE] 🔐 Generating credentials...');

    const generatePassword = (length = 12) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      let password = '';
      for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    const generateUsername = () => {
      const prefixes = ['user', 'admin', 'root', 'client'];
      const randomNum = Math.floor(Math.random() * 10000);
      return `${prefixes[Math.floor(Math.random() * prefixes.length)]}${randomNum}`;
    };

    const credentials = {
      username: generateUsername(),
      password: generatePassword()
    };

    console.log('[AUTO-PROVISION-SERVICE] ✅ Credentials generated:');
    console.log(`   - Username: ${credentials.username}`);
    console.log(`   - Password: ${credentials.password.substring(0, 4)}****`);

    return credentials;
  }

  // Generate hostname
  generateHostname(productName, memory) {
    console.log('[AUTO-PROVISION-SERVICE] 🌐 Generating hostname...');

    const cleanName = productName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const memoryCode = memory.toLowerCase().replace('gb', '');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const hostname = `${cleanName}-${memoryCode}gb-${randomSuffix}.com`;

    console.log('[AUTO-PROVISION-SERVICE] ✅ Generated hostname:', hostname);
    return hostname;
  }
  // Utility: convert Mongoose Map or plain object to a plain object
  toPlainObject(mapOrObj) {
    if (!mapOrObj) return {};
    if (typeof mapOrObj.toObject === 'function') return mapOrObj.toObject();
    if (mapOrObj instanceof Map) return Object.fromEntries(mapOrObj.entries());
    if (typeof mapOrObj === 'object') return { ...mapOrObj };
    return {};
  }
  // NEW: Decide login username from productName
  // If productName includes 'vps', 'windows', or 'rdp' -> administrator, else root
  getLoginUsernameFromProductName(productName = '') {
    const s = String(productName).toLowerCase();
    const isWindowsLike = s.includes('windows') || s.includes('rdp') || s.includes('vps');
    return isWindowsLike ? 'administrator' : 'root';
  }


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

      if (!order) {
        throw new Error(`Order ${orderId} not found in database`);
      }

      console.log(`[AUTO-PROVISION] ✅ Order found:`);
      console.log(`   - Product: ${order.productName}`);
      console.log(`   - Memory: ${order.memory}`);
      console.log(`   - Price: ₹${order.price}`);
      console.log(`   - IP Stock ID: ${order.ipStockId || 'NOT SET'}`);
      console.log(`   - Status: ${order.status}`);

      // STEP 2: Update status to provisioning
      console.log(`[AUTO-PROVISION] 📝 STEP 2: Updating order status to 'provisioning'...`);
      await Order.findByIdAndUpdate(orderId, {
        provisioningStatus: 'provisioning'
      });
      console.log(`[AUTO-PROVISION] ✅ Order status updated to 'provisioning'`);

      // STEP 3: Find IP Stock configuration
      console.log(`[AUTO-PROVISION] 📦 STEP 3: Finding IP Stock configuration...`);
      let ipStock;

      if (order.ipStockId) {
        console.log(`[AUTO-PROVISION] 🔍 Looking for IP Stock by ID: ${order.ipStockId}`);
        ipStock = await IPStock.findById(order.ipStockId);

        if (ipStock) {
          console.log(`[AUTO-PROVISION] ✅ Found IP Stock by ID: ${ipStock.name}`);
        } else {
          console.log(`[AUTO-PROVISION] ⚠️ IP Stock not found by ID, trying name search...`);
        }
      }

      if (!ipStock) {
        console.log(`[AUTO-PROVISION] 🔍 Searching IP Stock by product name: "${order.productName}"`);
        ipStock = await IPStock.findOne({
          name: { $regex: new RegExp(order.productName, 'i') }
        });

        if (ipStock) {
          console.log(`[AUTO-PROVISION] ✅ Found IP Stock by name search: ${ipStock.name}`);
        }
      }

      if (!ipStock) {
        throw new Error(`IPStock configuration not found for product: ${order.productName}`);
      }

      console.log(`[AUTO-PROVISION] 📊 IP Stock details:`);
      console.log(`   - Name: ${ipStock.name}`);
      console.log(`   - Available: ${ipStock.available}`);
      console.log(`   - Memory Options:`, Object.keys(ipStock.memoryOptions.toObject ? ipStock.memoryOptions.toObject() : ipStock.memoryOptions));

      // STEP 4: Get Hostycare product mapping
      console.log(`[AUTO-PROVISION] 🔗 STEP 4: Getting Hostycare product mapping for ${order.memory}...`);
      const memoryOption = ipStock.memoryOptions.get(order.memory);

      if (!memoryOption) {
        console.error(`[AUTO-PROVISION] ❌ Memory option '${order.memory}' not found in IP Stock`);
        console.log(`[AUTO-PROVISION] 📋 Available memory options:`, Object.keys(ipStock.memoryOptions.toObject ? ipStock.memoryOptions.toObject() : ipStock.memoryOptions));
        throw new Error(`Memory option ${order.memory} not configured in ${ipStock.name}`);
      }

      if (!memoryOption.hostycareProductId) {
        throw new Error(`Hostycare product ID not configured for ${order.memory} in ${ipStock.name}`);
      }

      console.log(`[AUTO-PROVISION] ✅ Found Hostycare mapping:`);
      console.log(`   - Memory: ${order.memory}`);
      console.log(`   - Hostycare Product ID: ${memoryOption.hostycareProductId}`);
      console.log(`   - Price: ₹${memoryOption.price}`);

      // STEP 5: Generate server details
      console.log(`[AUTO-PROVISION] 🔧 STEP 5: Generating server details...`);
      const credentials = this.generateCredentials();
      const hostname = this.generateHostname(order.productName, order.memory);

      // Decide login username by product name (Windows/RDP/VPS => administrator, else root)
      const loginUsername = this.getLoginUsernameFromProductName(order.productName);

      // STEP 6: Prepare order data for Hostycare
      const orderData = {
        cycle: 'monthly',
        hostname: hostname,
        username: loginUsername, // use fixed username based on product name
        password: credentials.password,
        configurations: ipStock.defaultConfigurations || {}
      };

      console.log(`[AUTO-PROVISION] 📤 STEP 6: Preparing Hostycare API request...`);
      console.log(`   - Product ID: ${memoryOption.hostycareProductId}`);
      console.log(`   - Cycle: ${orderData.cycle}`);
      console.log(`   - Hostname: ${orderData.hostname}`);
      console.log(`   - Username: ${orderData.username}`);
      console.log(`   - Password: ${orderData.password.substring(0, 4)}****`);

      // STEP 7: Create server via Hostycare API
      console.log(`[AUTO-PROVISION] 🌐 STEP 7: Creating server via Hostycare API...`);
      console.log(`[AUTO-PROVISION] 📡 Making API call to Hostycare...`);

      const apiCallStart = Date.now();
      const hostycareResponse = await this.hostycareApi.createServer(
        memoryOption.hostycareProductId,
        orderData
      );
      const apiCallTime = Date.now() - apiCallStart;

      console.log(`[AUTO-PROVISION] ✅ Hostycare API response received in ${apiCallTime}ms:`);
      console.log(JSON.stringify(hostycareResponse, null, 2));

      // STEP 8: Parse response and extract service details
      console.log(`[AUTO-PROVISION] 🔍 STEP 8: Parsing Hostycare response...`);
      let serviceId = null;
      let ipAddress = null;

      // Prefer nested data.service when present
      if (hostycareResponse?.service) {
        serviceId = hostycareResponse.service.id;
        ipAddress = hostycareResponse.service.dedicatedip || hostycareResponse.service.ipAddress;
        console.log(`[AUTO-PROVISION] ✅ Extracted from response.service:`);
      } else if (hostycareResponse?.data) {
        serviceId = hostycareResponse.data.id || hostycareResponse.data.serviceId;
        const svc = hostycareResponse.data.service || {};
        ipAddress = svc.dedicatedip || svc.ipAddress || hostycareResponse.data.ipAddress;
        console.log(`[AUTO-PROVISION] ✅ Extracted from response.data:`);
      } else if (hostycareResponse?.id) {
        serviceId = hostycareResponse.id;
        console.log(`[AUTO-PROVISION] ✅ Extracted from response.id:`);
      } else {
        console.log(`[AUTO-PROVISION] ⚠️ Service ID extraction: checking all response fields...`);
        console.log(`[AUTO-PROVISION] Response keys:`, Object.keys(hostycareResponse));
      }

      console.log(`   - Service ID: ${serviceId || 'NOT FOUND'}`);
      console.log(`   - IP Address: ${ipAddress || 'NOT FOUND'}`);

      // If we still didn't get a serviceId, treat as failure
      if (!serviceId) {
        throw new Error('Hostycare did not return a service ID (provisioning failed)');
      }

      // STEP 9: Update order with provisioning results
      console.log(`[AUTO-PROVISION] 💾 STEP 9: Updating order with provisioning results...`);
      const updateData = {
        hostycareServiceId: String(serviceId),
        hostycareProductId: memoryOption.hostycareProductId,
        username: loginUsername, // save standard username for customers
        password: credentials.password,
        ipAddress: ipAddress || 'Pending', // IP might be assigned later
        provisioningStatus: 'active',
        status: 'active',
        autoProvisioned: true,
        os: order.os || 'Ubuntu 22'
      };

      console.log(`[AUTO-PROVISION] 📝 Update data:`);
      Object.entries(updateData).forEach(([key, value]) => {
        if (key === 'password') {
          console.log(`   - ${key}: ${String(value).substring(0, 4)}****`);
        } else {
          console.log(`   - ${key}: ${value}`);
        }
      });

      await Order.findByIdAndUpdate(orderId, updateData);

      const totalTime = Date.now() - startTime;
      console.log("\n" + "🎉".repeat(80));
      console.log(`[AUTO-PROVISION] 🎉 PROVISIONING COMPLETED SUCCESSFULLY!`);
      console.log(`[AUTO-PROVISION] ⏱️ Total time: ${totalTime}ms`);
      console.log(`[AUTO-PROVISION] 📊 Final results:`);
      console.log(`   - Order ID: ${orderId}`);
      console.log(`   - Service ID: ${serviceId}`);
      console.log(`   - IP Address: ${ipAddress || 'Pending'}`);
      console.log(`   - Username: ${loginUsername}`);
      console.log(`   - Status: active`);
      console.log("🎉".repeat(80));

      // If IP address is not immediately available, schedule a check
      if (!ipAddress && serviceId) {
        console.log(`[AUTO-PROVISION] ⏰ Scheduling IP address check in 30 seconds...`);
        setTimeout(() => {
          this.checkServiceStatus(orderId, serviceId);
        }, 30000);
      }

      return {
        success: true,
        serviceId,
        credentials: { username: loginUsername, password: credentials.password },
        hostname,
        ipAddress,
        totalTime
      };

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error("\n" + "💥".repeat(80));
      console.error(`[AUTO-PROVISION] 💥 PROVISIONING FAILED for order ${orderId}:`);
      console.error(`   - Error: ${error.message}`);
      console.error(`   - Time elapsed: ${totalTime}ms`);
      console.error(`   - Stack trace:`, error.stack);
      console.error("💥".repeat(80));

      // Update order with error status (do not store credentials)
      try {
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'failed',
          provisioningError: error.message,
          autoProvisioned: false
        });
        console.log(`[AUTO-PROVISION] ✅ Order ${orderId} marked as failed`);
      } catch (updateError) {
        console.error(`[AUTO-PROVISION] ❌ Failed to update order status:`, updateError);
      }

      return {
        success: false,
        error: error.message,
        totalTime
      };
    }
  }

  // Check service status and update IP address if needed
  async checkServiceStatus(orderId, serviceId) {
    try {
      console.log(`[AUTO-PROVISION] 🔍 Checking status for service ${serviceId}, order ${orderId}`);
      const serviceDetails = await this.hostycareApi.getServiceDetails(serviceId);

      console.log(`[AUTO-PROVISION] 📊 Service details:`, serviceDetails);

      // Prefer dedicatedip if present
      const ip =
        serviceDetails?.data?.service?.dedicatedip ||
        serviceDetails?.service?.dedicatedip ||
        serviceDetails?.dedicatedip ||
        serviceDetails?.ipAddress ||
        null;

      if (ip) {
        await Order.findByIdAndUpdate(orderId, {
          ipAddress: ip
        });
        console.log(`[AUTO-PROVISION] ✅ Updated IP address for order ${orderId}: ${ip}`);
      } else {
        console.log(`[AUTO-PROVISION] ⚠️ IP address still not available for service ${serviceId}`);
      }
    } catch (error) {
      console.error(`[AUTO-PROVISION] ❌ Failed to check service status for order ${orderId}:`, error);
    }
  }

  // Bulk provision multiple orders
  async bulkProvision(orderIds) {
    console.log(`[AUTO-PROVISION] 📦 Starting bulk provisioning for ${orderIds.length} orders...`);
    const results = [];

    for (const orderId of orderIds) {
      console.log(`[AUTO-PROVISION] 🔄 Processing order ${orderId}...`);
      const result = await this.provisionServer(orderId);
      results.push({ orderId, ...result });

      console.log(`[AUTO-PROVISION] ✅ Order ${orderId} completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);

      // Add delay between requests to avoid rate limiting
      console.log(`[AUTO-PROVISION] ⏱️ Waiting 2 seconds before next order...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`[AUTO-PROVISION] 🏁 Bulk provisioning completed: ${results.filter(r => r.success).length} successful, ${results.filter(r => !r.success).length} failed`);
    return results;
  }
}

module.exports = AutoProvisioningService;
