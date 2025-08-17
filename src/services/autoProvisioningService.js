const HostycareAPI = require('./hostycareApi');
const connectDB = require('@/lib/db');
const Order = require('@/models/orderModel');
const IPStock = require('@/models/ipStockModel');

class AutoProvisioningService {
  constructor() {
    this.hostycareApi = new HostycareAPI();
  }

  // Generate random credentials
  generateCredentials() {
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

    return {
      username: generateUsername(),
      password: generatePassword()
    };
  }

  // Generate hostname
  generateHostname(productName, memory) {
    const cleanName = productName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const memoryCode = memory.toLowerCase().replace('gb', '');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${cleanName}-${memoryCode}gb-${randomSuffix}.example.com`;
  }

  // Main provisioning function
  async provisionServer(orderId) {
    await connectDB();

    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      console.log(`[AUTO-PROVISION] Starting provisioning for order ${orderId}`);

      // Update status to provisioning
      await Order.findByIdAndUpdate(orderId, {
        provisioningStatus: 'provisioning'
      });

      let ipStock;

      // Try to find IPStock by ID first (if provided), then by name
      if (order.ipStockId) {
        ipStock = await IPStock.findById(order.ipStockId);
        console.log(`[AUTO-PROVISION] Found IPStock by ID: ${order.ipStockId}`);
      }

      if (!ipStock) {
        // Fallback: find by product name (for backward compatibility)
        ipStock = await IPStock.findOne({
          name: { $regex: new RegExp(order.productName, 'i') }
        });
        console.log(`[AUTO-PROVISION] Found IPStock by name search: ${order.productName}`);
      }

      if (!ipStock) {
        throw new Error('IPStock configuration not found');
      }

      // Get the Hostycare product ID for this memory configuration
      const memoryOption = ipStock.memoryOptions.get(order.memory);
      if (!memoryOption || !memoryOption.hostycareProductId) {
        throw new Error(`Hostycare product ID not configured for ${order.memory} in ${ipStock.name}`);
      }

      console.log(`[AUTO-PROVISION] Using Hostycare product ID: ${memoryOption.hostycareProductId} for ${order.memory}`);

      // Generate credentials and hostname
      const credentials = this.generateCredentials();
      const hostname = this.generateHostname(order.productName, order.memory);

      // Prepare order data for Hostycare
      const orderData = {
        cycle: 'monthly',
        hostname: hostname,
        username: credentials.username,
        password: credentials.password,
        configurations: ipStock.defaultConfigurations || {}
      };

      console.log(`[AUTO-PROVISION] Creating server via Hostycare API...`);

      // Create server via Hostycare API
      const hostycareResponse = await this.hostycareApi.createServer(
        memoryOption.hostycareProductId,
        orderData
      );

      console.log('[AUTO-PROVISION] Hostycare response:', hostycareResponse);

      // Extract service details from response
      let serviceId = null;
      let ipAddress = null;

      // The response structure may vary, adjust according to Hostycare's actual response
      if (hostycareResponse.service) {
        serviceId = hostycareResponse.service.id;
        ipAddress = hostycareResponse.service.ipAddress;
      } else if (hostycareResponse.id) {
        serviceId = hostycareResponse.id;
      }

      // Update order with provisioning results
      const updateData = {
        hostycareServiceId: serviceId,
        hostycareProductId: memoryOption.hostycareProductId,
        username: credentials.username,
        password: credentials.password,
        ipAddress: ipAddress || 'Pending', // IP might be assigned later
        provisioningStatus: 'active',
        status: 'active',
        autoProvisioned: true,
        os: 'Ubuntu 22' // Default OS, can be made configurable
      };

      await Order.findByIdAndUpdate(orderId, updateData);

      console.log(`[AUTO-PROVISION] Successfully provisioned server for order ${orderId}`);

      // If IP address is not immediately available, schedule a check
      if (!ipAddress && serviceId) {
        setTimeout(() => {
          this.checkServiceStatus(orderId, serviceId);
        }, 30000); // Check after 30 seconds
      }

      return {
        success: true,
        serviceId,
        credentials,
        hostname,
        ipAddress
      };

    } catch (error) {
      console.error(`[AUTO-PROVISION] Failed for order ${orderId}:`, error);

      // Update order with error status
      await Order.findByIdAndUpdate(orderId, {
        provisioningStatus: 'failed',
        provisioningError: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check service status and update IP address if needed
  async checkServiceStatus(orderId, serviceId) {
    try {
      console.log(`[AUTO-PROVISION] Checking status for service ${serviceId}, order ${orderId}`);
      const serviceDetails = await this.hostycareApi.getServiceDetails(serviceId);

      if (serviceDetails.ipAddress) {
        await Order.findByIdAndUpdate(orderId, {
          ipAddress: serviceDetails.ipAddress
        });
        console.log(`[AUTO-PROVISION] Updated IP address for order ${orderId}: ${serviceDetails.ipAddress}`);
      }
    } catch (error) {
      console.error(`[AUTO-PROVISION] Failed to check service status for order ${orderId}:`, error);
    }
  }

  // Bulk provision multiple orders
  async bulkProvision(orderIds) {
    const results = [];

    for (const orderId of orderIds) {
      const result = await this.provisionServer(orderId);
      results.push({ orderId, ...result });

      // Add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return results;
  }
}

module.exports = AutoProvisioningService;
