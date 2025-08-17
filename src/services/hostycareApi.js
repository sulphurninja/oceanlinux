class HostycareAPI {
  constructor() {
    this.endpoint = "https://www.hostycare.com/manage/modules/addons/ProductsReseller/api/index.php";
    this.username = process.env.HOSTYCARE_USERNAME;
    this.apiKey = process.env.HOSTYCARE_API_KEY;

    console.log('[HOSTYCARE] Constructor:');
    console.log('  Username:', this.username ? 'SET' : 'MISSING');
    console.log('  API Key:', this.apiKey ? 'SET (length: ' + (this.apiKey?.length || 0) + ')' : 'MISSING');
  }

generateToken() {
  const crypto = require('crypto');

  // Use gmdate format as per Hostycare docs: gmdate("y-m-d H")
  const now = new Date();
  const year = now.getUTCFullYear().toString().slice(-2);
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  const hour = now.getUTCHours().toString().padStart(2, '0');
  const currentTime = `${year}-${month}-${day} ${hour}`;

  // The key is email:time
  const key = `${this.username}:${currentTime}`;

  // The data is the API key
  const data = this.apiKey;

  // According to PHP docs: hash_hmac("sha256", api_key, email:time)
  // In Node.js: createHmac(algorithm, key).update(data)
  const hash = crypto.createHmac('sha256', key).update(data).digest('hex');
  const token = Buffer.from(hash).toString('base64');

  // Debug logging
  console.log('[HOSTYCARE] Token generation (CORRECTED):');
  console.log('  Username:', this.username);
  console.log('  API Key length:', this.apiKey?.length);
  console.log('  Current Time (UTC):', currentTime);
  console.log('  HMAC Key (email:time):', key);
  console.log('  HMAC Data (api-key):', data);
  console.log('  HMAC Hash (hex):', hash);
  console.log('  Base64 Token:', token);

  return token;
}

  async makeRequest(action, method = 'GET', params = {}) {
    try {
      console.log(`[HOSTYCARE] Making ${method} request to: ${this.endpoint}${action}`);

      const token = this.generateToken();
      const headers = {
        'username': this.username,
        'token': token,
        'Content-Type': 'application/x-www-form-urlencoded'
      };

      console.log('[HOSTYCARE] Request headers (sanitized):', {
        username: this.username,
        token: token.substring(0, 10) + '...' + token.substring(token.length - 10),
        'Content-Type': headers['Content-Type']
      });

      const config = {
        method,
        headers
      };

      if (method === 'POST' && Object.keys(params).length > 0) {
        config.body = new URLSearchParams(params);
        console.log('[HOSTYCARE] Request body params:', params);
      }

      console.log('[HOSTYCARE] Full request URL:', `${this.endpoint}${action}`);
      const response = await fetch(`${this.endpoint}${action}`, config);
      console.log('[HOSTYCARE] Response status:', response.status, response.statusText);

      // Log response headers for debugging
      console.log('[HOSTYCARE] Response headers:', Object.fromEntries(response.headers.entries()));

      let data;
      const responseText = await response.text();
      console.log('[HOSTYCARE] Raw response:', responseText);

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[HOSTYCARE] Failed to parse JSON response:', parseError);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }

      console.log('[HOSTYCARE] Parsed response data:', data);

      if (!response.ok) {
        throw new Error(data.message || `API request failed with status ${response.status}: ${responseText}`);
      }

      return data;
    } catch (error) {
      console.error('[HOSTYCARE] API Error details:', {
        message: error.message,
        stack: error.stack,
        username: this.username,
        apiKeyPresent: !!this.apiKey,
        endpoint: this.endpoint + action
      });
      throw error;
    }
  }

  // Test connection
  async testConnection() {
    return await this.makeRequest('/testConnection');
  }

  // Get available products
  async getProducts() {
    return await this.makeRequest('/products?withpricing=1');
  }

  // Create a new service/server
  async createServer(productId, orderData) {
    const params = {
      cycle: orderData.cycle || 'monthly',
      hostname: orderData.hostname,
      username: orderData.username,
      password: orderData.password,
      ...orderData.configurations
    };

    return await this.makeRequest(`/order/products/${productId}`, 'POST', params);
  }

  // Get service details
  async getServiceDetails(serviceId) {
    return await this.makeRequest(`/services/${serviceId}`);
  }

  // Start a service
  async startService(serviceId) {
    return await this.makeRequest(`/services/${serviceId}/start`, 'POST');
  }

  // Stop a service
  async stopService(serviceId) {
    return await this.makeRequest(`/services/${serviceId}/stop`, 'POST');
  }

  // Reboot a service
  async rebootService(serviceId) {
    return await this.makeRequest(`/services/${serviceId}/reboot`, 'POST');
  }

  // Suspend a service
  async suspendService(serviceId) {
    return await this.makeRequest(`/services/${serviceId}/suspend`, 'POST');
  }

  // Unsuspend a service
  async unsuspendService(serviceId) {
    return await this.makeRequest(`/services/${serviceId}/unsuspend`, 'POST');
  }

  // Terminate a service
  async terminateService(serviceId) {
    return await this.makeRequest(`/services/${serviceId}/terminate`, 'POST');
  }

  // Change password
  async changePassword(serviceId, newPassword) {
    return await this.makeRequest(`/services/${serviceId}/changepassword`, 'POST', {
      password: newPassword
    });
  }

  // Get templates for reinstall
  async getReinstallTemplates(serviceId) {
    return await this.makeRequest(`/services/${serviceId}/reinstall`);
  }

  // Reinstall service
  async reinstallService(serviceId, password) {
    return await this.makeRequest(`/services/${serviceId}/reinstall`, 'POST', {
      password
    });
  }

  // Test connection
  async testConnection() {
    return await this.makeRequest('/testConnection');
  }

  // Get account credit
  async getCredit() {
    return await this.makeRequest('/billing/credit');
  }
}

module.exports = HostycareAPI;
