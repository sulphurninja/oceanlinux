class HostycareAPI {
  constructor() {
    this.endpoint = "https://www.hostycare.com/manage/modules/addons/ProductsReseller/api/index.php";
    this.username = process.env.HOSTYCARE_USERNAME;
    this.apiKey = process.env.HOSTYCARE_API_KEY;

    console.log('[HOSTYCARE] Constructor:');
    console.log('  Username:', this.username ? 'SET' : 'MISSING');
    console.log('  API Key:', this.apiKey ? 'SET (length: ' + (this.apiKey?.length || 0) + ')' : 'MISSING');
  }

  // Helper: serialize nested params like configurations[key]=value, fields[key]=value, nsprefix[]=ns1
  buildFormParams(obj, parentKey = '', params = new URLSearchParams()) {
    const isPlainObject = (v) => Object.prototype.toString.call(v) === '[object Object]';
    const isMap = (v) => v && typeof v === 'object' && typeof v.forEach === 'function' && typeof v.get === 'function';

    const entries = isMap(obj) ? Array.from(obj.entries()) : Object.entries(obj || {});

    for (const [key, value] of entries) {
      const fullKey = parentKey ? `${parentKey}[${key}]` : key;
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        for (const v of value) {
          if (isPlainObject(v) || isMap(v)) {
            this.buildFormParams(v, `${fullKey}[]`, params);
          } else {
            params.append(`${fullKey}[]`, String(v));
          }
        }
      } else if (isPlainObject(value) || isMap(value)) {
        this.buildFormParams(value, fullKey, params);
      } else {
        params.append(fullKey, String(value));
      }
    }
    return params;
  }

  generateToken() {
    const crypto = require('crypto');

    const now = new Date();
    const year = now.getUTCFullYear().toString().slice(-2);
    const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = now.getUTCDate().toString().padStart(2, '0');
    const hour = now.getUTCHours().toString().padStart(2, '0');
    const currentTime = `${year}-${month}-${day} ${hour}`;

    const key = `${this.username}:${currentTime}`;
    const data = this.apiKey;

    const hash = crypto.createHmac('sha256', key).update(data).digest('hex');
    const token = Buffer.from(hash).toString('base64');

    console.log('[HOSTYCARE] Token generation:');
    console.log('  Current Time (UTC):', currentTime);
    console.log('  Base64 Token (trimmed):', token.substring(0, 10) + '...' + token.substring(token.length - 10));

    return token;
  }

  async makeRequest(action, method = 'GET', params = {}) {
    try {
      console.log(`[HOSTYCARE] Making ${method} request to: ${this.endpoint}${action}`);

      const token = this.generateToken();
      const headers = {
        'username': this.username,
        'token': token,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      };

      const config = { method, headers };

      if (method === 'POST') {
        config.body = params instanceof URLSearchParams ? params : this.buildFormParams(params);
        console.log('[HOSTYCARE] Encoded form body (debug):', config.body?.toString());
      }

      const response = await fetch(`${this.endpoint}${action}`, config);
      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${responseText}`);
      }

      // Throw if Hostycare embeds error in JSON even with HTTP 200
      if (!response.ok || data?.error || data?.success === false) {
        const msg = data?.error || data?.message || `API request failed with status ${response.status}`;
        throw new Error(msg);
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
    // withpricing=1 as query parameter per docs
    return await this.makeRequest('/products?withpricing=1');
  }

  // Create a new service/server
  async createServer(productId, orderData) {
    // orderData may include: cycle, hostname, username, password, nsprefix (array), fields (object), configurations (object)
    // Ensure only expected keys and proper nesting
    const body = {
      cycle: orderData.cycle || 'monthly',
      hostname: orderData.hostname,
      username: orderData.username,
      password: orderData.password,
    };

    if (Array.isArray(orderData.nsprefix)) {
      body.nsprefix = orderData.nsprefix;
    }
    if (orderData.fields && typeof orderData.fields === 'object') {
      body.fields = orderData.fields;
    }
    if (orderData.configurations && typeof orderData.configurations === 'object') {
      body.configurations = orderData.configurations;
    }

    return await this.makeRequest(`/order/products/${productId}`, 'POST', body);
  }

  // Get service details
  async getServiceDetails(serviceId) {
    return await this.makeRequest(`/services/${serviceId}`);
  }

  async getServiceInfo(serviceId) {
    return await this.makeRequest(`/services/${serviceId}/getInfo`);
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

  // Renew a service
  async renewService(serviceId) {
    return await this.makeRequest(`/services/${serviceId}/renew`, 'POST');
  }

  // Change password
  async changePassword(serviceId, newPassword) {
    return await this.makeRequest(`/services/${serviceId}/changepassword`, 'POST', {
      password: newPassword
    });
  }

  // Get templates for reinstall - Using proper API endpoint
  async getReinstallTemplates(serviceId) {
    console.log(`[HOSTYCARE] Getting reinstall templates for service: ${serviceId}`);
    return await this.makeRequest(`/services/${serviceId}/reinstall`, 'GET');
  }

  // Reinstall service - Using proper API endpoint
  async reinstallService(serviceId, password, templateId = null) {
    console.log(`[HOSTYCARE] Reinstalling service: ${serviceId} with template: ${templateId}`);
    
    const body = {
      password: password
    };

    // If templateId is provided, include it
    if (templateId) {
      body.template = templateId; // or templateId, depending on API expectation
      // You might need to adjust this field name based on actual API requirements
    }

    return await this.makeRequest(`/services/${serviceId}/reinstall`, 'POST', body);
  }

  // Get account credit
  async getCredit() {
    return await this.makeRequest('/billing/credit');
  }
}

module.exports = HostycareAPI;