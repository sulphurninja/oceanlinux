const HostycareAPI = require('./hostycareApi');
const connectDB = require('@/lib/db').default;       // <- add .default
const Order = require('@/models/orderModel').default; // <- add .default
const IPStock = require('@/models/ipStockModel');     // CJS, no change

class AutoProvisioningService {
  constructor() {
    this.hostycareApi = new HostycareAPI();
    console.log('[AUTO-PROVISION-SERVICE] 🏗️ AutoProvisioningService instance created');
  }

  // NEW: Determine OS from product name
  getOSFromProductName(productName = '') {
    const s = String(productName).toLowerCase();
    const isWindows = s.includes('vps') || s.includes('rdp') || s.includes('windows');
    return isWindows ? 'Windows 2022 64' : 'Ubuntu 22';
  }



  // REPLACE the generateCredentials method completely
  generateCredentials(productName = '') {
    console.log('[AUTO-PROVISION-SERVICE] 🔐 Generating safe credentials...');

    const upperCase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowerCase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';

    // ONLY these 4 special characters - NOTHING ELSE!
    const safeSpecialChars = '@#&$';

    let password = '';

    // Ensure at least one character from each category
    password += upperCase[Math.floor(Math.random() * upperCase.length)];
    password += lowerCase[Math.floor(Math.random() * lowerCase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += safeSpecialChars[Math.floor(Math.random() * safeSpecialChars.length)];

    // Fill the rest randomly (16 characters total)
    const allChars = upperCase + lowerCase + numbers + safeSpecialChars;
    for (let i = password.length; i < 16; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    password = password.split('').sort(() => 0.5 - Math.random()).join('');

    // Use context-aware username
    const username = this.getLoginUsernameFromProductName(productName);

    const credentials = {
      username: username,
      password: password
    };

    console.log('[AUTO-PROVISION-SERVICE] ✅ Safe credentials generated:');
    console.log(`   - Username: ${credentials.username}`);
    console.log(`   - Password: ${credentials.password.substring(0, 4)}**** (16 chars, ONLY @#&$ specials)`);

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

      // STEP 2: Update status to provisioning
      console.log(`[AUTO-PROVISION] 📝 STEP 2: Updating order status to 'provisioning'...`);
      await Order.findByIdAndUpdate(orderId, {
        provisioningStatus: 'provisioning',
        provisioningError: '',
        autoProvisioned: true
      });

      // STEP 3: Find IP Stock configuration
      console.log(`[AUTO-PROVISION] 📦 STEP 3: Finding IP Stock configuration...`);
      let ipStock;

      if (order.ipStockId) {
        console.log(`[AUTO-PROVISION] 🔍 Looking for IP Stock by ID: ${order.ipStockId}`);
        ipStock = await IPStock.findById(order.ipStockId);
      }

      if (!ipStock) {
        console.log(`[AUTO-PROVISION] 🔍 Searching IP Stock by product name: "${order.productName}"`);
        ipStock = await IPStock.findOne({
          name: { $regex: new RegExp(order.productName, 'i') }
        });
      }

      if (!ipStock) {
        throw new Error(`IPStock configuration not found for product: ${order.productName}`);
      }

      console.log(`[AUTO-PROVISION] ✅ Found IP Stock: ${ipStock.name}`);

      // STEP 4: Get memory configuration - FIXED FOR MAP OBJECTS
      console.log(`[AUTO-PROVISION] 📦 STEP 4: Getting memory configuration...`);
      console.log(`[AUTO-PROVISION] 🔍 Raw memoryOptions:`, ipStock.memoryOptions);
      console.log(`[AUTO-PROVISION] 🔍 memoryOptions type:`, typeof ipStock.memoryOptions);

      // Handle Map objects properly
      let memoryOptions;
      if (ipStock.memoryOptions instanceof Map) {
        // Convert Map to plain object
        memoryOptions = Object.fromEntries(ipStock.memoryOptions.entries());
        console.log(`[AUTO-PROVISION] ✅ Converted Map to object`);
      } else if (typeof ipStock.memoryOptions.toObject === 'function') {
        memoryOptions = ipStock.memoryOptions.toObject();
        console.log(`[AUTO-PROVISION] ✅ Used toObject() method`);
      } else if (typeof ipStock.memoryOptions === 'object') {
        memoryOptions = JSON.parse(JSON.stringify(ipStock.memoryOptions));
        console.log(`[AUTO-PROVISION] ✅ Used JSON stringify/parse`);
      } else {
        memoryOptions = {};
        console.log(`[AUTO-PROVISION] ⚠️ Used empty fallback`);
      }

      console.log(`[AUTO-PROVISION] 🧠 Converted memoryOptions:`, memoryOptions);
      console.log(`[AUTO-PROVISION] 🧠 Available memory options:`, Object.keys(memoryOptions));
      console.log(`[AUTO-PROVISION] 🔍 Looking for memory: "${order.memory}"`);

      let memoryConfig = memoryOptions[order.memory];

      if (!memoryConfig) {
        // Try variations if exact match fails
        console.log(`[AUTO-PROVISION] ⚠️ Exact match failed, trying variations...`);

        const memoryVariations = [
          order.memory.toLowerCase(),
          order.memory.toUpperCase(),
          order.memory.replace('GB', 'gb'),
          order.memory.replace('gb', 'GB'),
        ];

        console.log(`[AUTO-PROVISION] 🔄 Trying variations:`, memoryVariations);

        for (const variation of memoryVariations) {
          if (memoryOptions[variation]) {
            console.log(`[AUTO-PROVISION] ✅ Found memory config with variation: "${variation}"`);
            memoryConfig = memoryOptions[variation];
            break;
          }
        }
      }

      if (!memoryConfig) {
        const availableKeys = Object.keys(memoryOptions);
        console.error(`[AUTO-PROVISION] ❌ Memory config not found!`);
        console.error(`   Requested: "${order.memory}"`);
        console.error(`   Available: [${availableKeys.join(', ')}]`);
        console.error(`   IP Stock: ${ipStock.name}`);

        throw new Error(
          `Memory configuration not found!\n` +
          `Requested: "${order.memory}"\n` +
          `Available options: [${availableKeys.join(', ')}]\n` +
          `IP Stock: ${ipStock.name}`
        );
      }

      console.log(`[AUTO-PROVISION] ✅ Found memory config:`, memoryConfig);

      // Check for hostycareProductId (your field name) or productId (fallback)
      const productId = memoryConfig.hostycareProductId || memoryConfig.productId;

      if (!productId) {
        throw new Error(
          `Memory configuration for "${order.memory}" is missing hostycareProductId!\n` +
          `Current config: ${JSON.stringify(memoryConfig, null, 2)}\n` +
          `IP Stock: ${ipStock.name}`
        );
      }

      console.log(`[AUTO-PROVISION] ✅ Using Hostycare Product ID: ${productId}`);
      console.log(`[AUTO-PROVISION] ✅ Product Name: ${memoryConfig.hostycareProductName || 'N/A'}`);

      // STEP 5: Generate credentials and hostname
      const credentials = this.generateCredentials(order.productName);
      const hostname = this.generateHostname(order.productName, order.memory);

      console.log(`[AUTO-PROVISION] 🔐 Generated credentials: ${credentials.username} / ${credentials.password.substring(0, 4)}****`);
      console.log(`[AUTO-PROVISION] 🌐 Generated hostname: ${hostname}`);

      // STEP 6: Create server via Hostycare API
      console.log(`[AUTO-PROVISION] 🚀 STEP 6: Creating server via Hostycare API...`);

      const orderData = {
        cycle: 'monthly',
        hostname: hostname,
        username: credentials.username,
        password: credentials.password,
        fields: this.toPlainObject(memoryConfig.fields || ipStock.defaultConfigurations || {}),
        configurations: this.toPlainObject(memoryConfig.configurations || ipStock.defaultConfigurations || {})
      };

      console.log(`[AUTO-PROVISION] 📦 Order data:`, orderData);

      try {
        const apiResponse = await this.hostycareApi.createServer(productId, orderData);
        console.log(`[AUTO-PROVISION] ✅ Server created successfully:`, apiResponse);

        const serviceId = apiResponse?.data?.service?.id || apiResponse?.service?.id || apiResponse?.id;

        if (!serviceId) {
          throw new Error(`Service ID not found in API response. Response: ${JSON.stringify(apiResponse)}`);
        }

        console.log(`[AUTO-PROVISION] 🆔 Service ID: ${serviceId}`);

        // STEP 7: Get IP address (with patient retry strategy)
        console.log(`[AUTO-PROVISION] 🔍 STEP 7: Getting IP address...`);
        let ipAddress = null;

        // First, try to get IP from the creation response
        ipAddress = apiResponse?.data?.service?.dedicatedip ||
          apiResponse?.data?.service?.dedicatedIp ||
          apiResponse?.service?.dedicatedip ||
          apiResponse?.service?.dedicatedIp ||
          apiResponse?.dedicatedip ||
          apiResponse?.dedicatedIp ||
          null;

        if (ipAddress) {
          console.log(`[AUTO-PROVISION] ✅ IP found in creation response: ${ipAddress}`);
        } else {
          console.log(`[AUTO-PROVISION] 📋 IP not in creation response - this is normal for new servers`);
          console.log(`[AUTO-PROVISION] ⏳ Server is being provisioned, will attempt to get IP with patience...`);

          // Patient retry strategy - servers can take 5-15 minutes to be ready
          const maxRetries = 5;
          const retryDelays = [10000, 20000, 30000, 60000, 120000]; // 10s, 20s, 30s, 1m, 2m

          for (let attempt = 1; attempt <= maxRetries && !ipAddress; attempt++) {
            const delay = retryDelays[attempt - 1];

            console.log(`[AUTO-PROVISION] ⏳ Waiting ${delay / 1000} seconds before attempt ${attempt}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, delay));

            try {
              console.log(`[AUTO-PROVISION] 🔄 Checking server status (attempt ${attempt}/${maxRetries})...`);

              const serviceDetails = await this.hostycareApi.getServiceDetails(serviceId);
              console.log(`[AUTO-PROVISION] 📊 Service details received:`, JSON.stringify(serviceDetails, null, 2));

              ipAddress = serviceDetails?.data?.service?.dedicatedip ||
                serviceDetails?.data?.service?.dedicatedIp ||
                serviceDetails?.service?.dedicatedip ||
                serviceDetails?.service?.dedicatedIp ||
                serviceDetails?.dedicatedip ||
                serviceDetails?.dedicatedIp ||
                null;

              if (ipAddress) {
                console.log(`[AUTO-PROVISION] 🎉 IP address obtained: ${ipAddress} (after ${attempt} attempts)`);
                break;
              } else {
                console.log(`[AUTO-PROVISION] ⌛ Server still provisioning... (attempt ${attempt}/${maxRetries})`);

                // Log what we got to help debug
                if (serviceDetails) {
                  console.log(`[AUTO-PROVISION] 🔍 Available fields in response:`, Object.keys(serviceDetails));
                  if (serviceDetails.data) {
                    console.log(`[AUTO-PROVISION] 🔍 Available fields in data:`, Object.keys(serviceDetails.data));
                  }
                  if (serviceDetails.service) {
                    console.log(`[AUTO-PROVISION] 🔍 Available fields in service:`, Object.keys(serviceDetails.service));
                  }
                }
              }
            } catch (error) {
              if (error.message.includes('Details unavailable')) {
                console.log(`[AUTO-PROVISION] ⌛ Server still being set up (attempt ${attempt}/${maxRetries}) - this is expected`);
              } else {
                console.log(`[AUTO-PROVISION] ⚠️ Unexpected error on attempt ${attempt}: ${error.message}`);
              }
            }
          }
        }

        // Don't fail the entire provisioning if IP isn't available yet
        const ipStatus = ipAddress ? `IP: ${ipAddress}` : 'IP will be assigned when server is ready';
        console.log(`[AUTO-PROVISION] 🌐 Final status: ${ipStatus}`);

        // STEP 8: Update order with success (even if IP is pending)
        console.log(`[AUTO-PROVISION] 💾 STEP 8: Updating order with provisioning success...`);

        // Determine OS from product name
        const detectedOS = this.getOSFromProductName(order.productName);
        console.log(`[AUTO-PROVISION] 🖥️ Detected OS from product "${order.productName}": ${detectedOS}`);

        const updateData = {
          status: 'active',
          provisioningStatus: 'active',
          hostycareServiceId: serviceId,
          username: credentials.username,
          password: credentials.password,
          autoProvisioned: true,
          provisioningError: '',
          os: detectedOS // Add OS detection
        };

        if (ipAddress) {
          updateData.ipAddress = ipAddress;
        } else {
          // Set a placeholder to indicate IP is pending
          updateData.ipAddress = 'Pending - Server being provisioned';
        }

        // Set expiry date (30 days from now)
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        updateData.expiryDate = expiryDate;

        await Order.findByIdAndUpdate(orderId, updateData);

        const totalTime = Date.now() - startTime;
        console.log("\n" + "✅".repeat(80));
        console.log(`[AUTO-PROVISION] ✅ PROVISIONING COMPLETED SUCCESSFULLY!`);
        console.log(`   - Order ID: ${orderId}`);
        console.log(`   - Service ID: ${serviceId}`);
        console.log(`   - IP Status: ${ipAddress || 'Will be assigned automatically'}`);
        console.log(`   - Username: ${credentials.username}`);
        console.log(`   - OS: ${detectedOS}`); // Log detected OS
        console.log(`   - Product ID: ${productId}`);
        console.log(`   - Product Name: ${memoryConfig.hostycareProductName || 'N/A'}`);
        console.log(`   - Hostname: ${hostname}`);
        console.log(`   - Total Time: ${totalTime}ms`);
        console.log(`   - Note: ${ipAddress ? 'Server ready!' : 'Server is being set up, IP will be available soon'}`);
        console.log("✅".repeat(80));

        // Schedule background IP monitoring if IP is not available yet
        if (!ipAddress) {
          console.log(`[AUTO-PROVISION] 🔄 Starting background IP monitoring for service ${serviceId}...`);

          // Schedule multiple background checks
          const backgroundChecks = [300000, 600000, 900000]; // 5min, 10min, 15min

          backgroundChecks.forEach((delay, index) => {
            setTimeout(async () => {
              console.log(`[AUTO-PROVISION] 🔍 Background check ${index + 1} for service ${serviceId}...`);
              await this.checkAndUpdateIP(orderId, serviceId);
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
        console.error(`[AUTO-PROVISION] 💥 Hostycare API Error:`, apiError.message);
        throw new Error(`Hostycare API Error: ${apiError.message}`);
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error("\n" + "💥".repeat(80));
      console.error(`[AUTO-PROVISION] 💥 PROVISIONING FAILED for order ${orderId}:`);
      console.error(`   - Error: ${error.message}`);
      console.error(`   - Time elapsed: ${totalTime}ms`);
      console.error("💥".repeat(80));

      // Update order with error status
      try {
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'failed',
          provisioningError: error.message,
          autoProvisioned: true
        });
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
  // New method for background IP checking
  async checkAndUpdateIP(orderId, serviceId) {
    try {
      console.log(`[BACKGROUND-IP] 🔍 Checking IP for order ${orderId}, service ${serviceId}`);

      const serviceDetails = await this.hostycareApi.getServiceDetails(serviceId);

      const ip = serviceDetails?.data?.service?.dedicatedip ||
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
      if (error.message.includes('Details unavailable')) {
        console.log(`[BACKGROUND-IP] ⌛ Server still being provisioned for service ${serviceId}`);
      } else {
        console.error(`[BACKGROUND-IP] ❌ Error checking IP for service ${serviceId}:`, error.message);
      }
    }
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
