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
      console.log(`   - Provisioning Status: ${order.provisioningStatus || 'NOT SET'}`);
      console.log(`   - Auto Provisioned: ${order.autoProvisioned || false}`);

      // 🚨 CRITICAL SAFETY CHECKS - PREVENT DUPLICATE PROVISIONING
      console.log(`[AUTO-PROVISION] 🔒 STEP 1.5: Safety checks to prevent duplicates...`);

      // Check if already provisioned successfully
      if (order.autoProvisioned && order.provisioningStatus === 'active' && order.ipAddress && order.username) {
        console.log(`[AUTO-PROVISION] ⚠️ DUPLICATE PREVENTION: Order already provisioned successfully`);
        console.log(`   - IP Address: ${order.ipAddress}`);
        console.log(`   - Username: ${order.username}`);
        console.log(`   - Service ID: ${order.hostycareServiceId || 'N/A'}`);
        return {
          success: true,
          message: 'Order already provisioned successfully',
          serviceId: order.hostycareServiceId,
          ipAddress: order.ipAddress,
          credentials: { username: order.username, password: order.password },
          alreadyProvisioned: true
        };
      }

      // Check if currently being provisioned by another process
      if (order.provisioningStatus === 'provisioning') {
        console.log(`[AUTO-PROVISION] ⚠️ RACE CONDITION PREVENTION: Order is currently being provisioned by another process`);
        return {
          success: false,
          message: 'Order is currently being provisioned by another process',
          inProgress: true
        };
      }

      // STEP 2: Atomically update status to provisioning (with race condition protection)
      console.log(`[AUTO-PROVISION] 📝 STEP 2: Atomically updating order status to 'provisioning'...`);

      const updateResult = await Order.findOneAndUpdate(
        {
          _id: orderId,
          // Only update if not already being processed
          $or: [
            { provisioningStatus: { $ne: 'provisioning' } },
            { provisioningStatus: { $exists: false } }
          ]
        },
        {
          provisioningStatus: 'provisioning',
          provisioningError: '',
          autoProvisioned: true
        },
        { new: true }
      );

      if (!updateResult) {
        console.log(`[AUTO-PROVISION] 🚫 CONCURRENT ACCESS PREVENTION: Order is already being processed by another instance`);
        return {
          success: false,
          message: 'Order is already being processed by another instance',
          concurrentAccess: true
        };
      }

      console.log(`[AUTO-PROVISION] ✅ Order status atomically updated to 'provisioning'`);

      // STEP 3: Find IP Stock configuration (unchanged)
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

      // ... rest of the existing code remains exactly the same ...

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
          autoProvisioned: true // Changed from false to true - we attempted auto-provisioning
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

  // Enhanced password generation for better success rate
  generateEnhancedCredentials() {
    console.log('[AUTO-PROVISION-SERVICE] 🔐 Generating enhanced credentials...');

    // Generate a stronger password that meets requirements
    const upperCase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowerCase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let password = '';

    // Ensure at least one character from each category
    password += upperCase[Math.floor(Math.random() * upperCase.length)];
    password += lowerCase[Math.floor(Math.random() * lowerCase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += specialChars[Math.floor(Math.random() * specialChars.length)];

    // Fill the rest randomly (minimum 16 characters total for better strength)
    const allChars = upperCase + lowerCase + numbers + specialChars;
    for (let i = password.length; i < 16; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    password = password.split('').sort(() => 0.5 - Math.random()).join('');

    const credentials = {
      username: 'root',
      password: password
    };

    console.log('[AUTO-PROVISION-SERVICE] ✅ Enhanced credentials generated:');
    console.log(`   - Username: ${credentials.username}`);
    console.log(`   - Password: ${credentials.password.substring(0, 4)}**** (${credentials.password.length} chars)`);

    return credentials;
  }

  // Update the existing generateCredentials method to use enhanced version
  generateCredentials() {
    return this.generateEnhancedCredentials();
  }

  // Check if an error is retryable
  isRetryableError(errorMessage) {
    const retryableErrors = [
      'Password strength should not be less than 100',
      'The following IP(s) are used by another VPS'
    ];

    return retryableErrors.some(error =>
      errorMessage.toLowerCase().includes(error.toLowerCase())
    );
  }

  // ... rest of existing code remains the same ...

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
