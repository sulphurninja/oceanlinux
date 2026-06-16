function extractHostycareApiError(data) {
  if (!data || typeof data !== 'object') return null;

  if (data.success === false) {
    return data.message || (typeof data.error === 'string' ? data.error : null) || 'Hostycare API returned success=false';
  }

  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error.trim();
  }

  // ModulesGarden action responses use status: "success" | "error" (not VM power state)
  if (typeof data.status === 'string') {
    const s = data.status.toLowerCase();
    if (s === 'error' || s === 'failed' || s === 'fail') {
      return data.message || `Hostycare API status=${data.status}`;
    }
  }

  if (typeof data.result === 'string') {
    const r = data.result.toLowerCase();
    if (r === 'error' || r === 'failed' || r === 'fail') {
      return data.message || `Hostycare API result=${data.result}`;
    }
  }

  return null;
}

function encodeHostycareServiceId(serviceId) {
  return encodeURIComponent(String(serviceId));
}

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
      if (!this.username || !this.apiKey) {
        throw new Error(
          'Hostycare API credentials missing. Restore HOSTYCARE_USERNAME and HOSTYCARE_API_KEY in .env on the server, then pm2 restart oceanlinux.'
        );
      }

      console.log(`[HOSTYCARE] Making ${method} request to: ${this.endpoint}${action}`);

      const token = this.generateToken();
      const headers = {
        'username': this.username,
        'token': token,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'OceanLinux/1.0 (Server; Reseller API Client)',
      };

      const config = { method, headers };

      if (method === 'POST') {
        const bodyParams = params instanceof URLSearchParams ? params : this.buildFormParams(params);
        const encoded = bodyParams.toString();
        if (encoded) {
          config.body = bodyParams;
          console.log('[HOSTYCARE] Encoded form body (debug):', encoded);
        } else {
          // start/stop/reboot have no params — omit empty form body (some WAF rules block it)
          delete headers['Content-Type'];
        }
      }

      const response = await fetch(`${this.endpoint}${action}`, config);
      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        // Cloudflare challenge pages return HTML instead of JSON
        if (responseText.includes('Just a moment') || responseText.includes('cf_chl_opt') || responseText.includes('challenge-platform')) {
          console.error('[HOSTYCARE] Cloudflare challenge detected — server IP may need whitelisting');
          const postHint = method === 'POST'
            ? ' GET calls (test/status) may work while POST power actions (start/stop/reboot) are blocked — ask Hostycare to whitelist your server IP for POST requests.'
            : '';
          throw new Error(`Hostycare API blocked by Cloudflare protection. Server IP may need whitelisting.${postHint}`);
        }
        throw new Error(`Invalid response from Hostycare API (status ${response.status})`);
      }

      console.log('[HOSTYCARE] Response:', JSON.stringify(data).substring(0, 500));

      const embeddedError = extractHostycareApiError(data);
      if (!response.ok || embeddedError) {
        throw new Error(embeddedError || data?.message || `API request failed with status ${response.status}`);
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

  async makeRawRequest(action, method = 'GET', params = {}) {
    try {
      const token = this.generateToken();
      const headers = {
        'username': this.username,
        'token': token,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'OceanLinux/1.0 (Server; Reseller API Client)',
      };

      const config = { method, headers };

      if (method === 'POST') {
        config.body = params instanceof URLSearchParams ? params : this.buildFormParams(params);
      }

      const response = await fetch(`${this.endpoint}${action}`, config);
      const responseText = await response.text();

      try {
        return JSON.parse(responseText);
      } catch {
        if (responseText.includes('Just a moment') || responseText.includes('cf_chl_opt')) {
          throw new Error('Hostycare API blocked by Cloudflare protection.');
        }
        throw new Error(`Invalid response from Hostycare API (status ${response.status})`);
      }
    } catch (error) {
      console.error('[HOSTYCARE] Raw request error:', error.message);
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
    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}`);
  }

  async getServiceInfo(serviceId) {
    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}/getInfo`);
  }

  // Start a service
  async startService(serviceId) {
    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}/start`, 'POST');
  }

  // Stop a service
  async stopService(serviceId) {
    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}/stop`, 'POST');
  }

  // Reboot a service
  async rebootService(serviceId) {
    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}/reboot`, 'POST');
  }

  // Suspend a service
  async suspendService(serviceId) {
    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}/suspend`, 'POST');
  }

  // Unsuspend a service
  async unsuspendService(serviceId) {
    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}/unsuspend`, 'POST');
  }

  // Terminate a service
  async terminateService(serviceId) {
    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}/terminate`, 'POST');
  }

  // Renew a service
  async renewService(serviceId) {
    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}/renew`, 'POST');
  }

  // Change password
  async changePassword(serviceId, newPassword) {
    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}/changepassword`, 'POST', {
      password: newPassword
    });
  }

  // Get templates for reinstall - Using proper API endpoint
  async getReinstallTemplates(serviceId) {
    console.log(`[HOSTYCARE] Getting reinstall templates for service: ${serviceId}`);
    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}/reinstall`, 'GET');
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

    return await this.makeRequest(`/services/${encodeHostycareServiceId(serviceId)}/reinstall`, 'POST', body);
  }

  // Get account credit
  async getCredit() {
    return await this.makeRequest('/billing/credit');
  }
}

module.exports = HostycareAPI;