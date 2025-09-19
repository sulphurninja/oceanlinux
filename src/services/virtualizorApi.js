const crypto = require('crypto');

class VirtualizorAPI {
  constructor(endpoint = null) {
    this.endpoint = endpoint || process.env.VIRTUALIZOR_ENDPOINT;
    this.apiKey = process.env.VIRTUALIZOR_API_KEY;
    this.apiPassword = process.env.VIRTUALIZOR_API_PASSWORD;

    // Auto-convert HTTP to HTTPS if needed
    if (this.endpoint && this.endpoint.startsWith('http://')) {
      this.endpoint = this.endpoint.replace('http://', 'https://');
      console.log('[VIRTUALIZOR] Auto-converted endpoint to HTTPS:', this.endpoint);
    }

    console.log('[VIRTUALIZOR] Constructor:');
    console.log('  Endpoint:', this.endpoint ? 'SET' : 'MISSING');
    console.log('  API Key:', this.apiKey ? 'SET' : 'MISSING');
  }

  // Generate API hash for Virtualizor authentication
  generateApiHash(action, post = {}) {
    const apikey = this.apiKey;
    const apipass = this.apiPassword;

    // Create the string to hash
    let hashString = `${apikey}${action}`;

    // Add POST parameters to hash string in alphabetical order
    const sortedKeys = Object.keys(post).sort();
    for (const key of sortedKeys) {
      hashString += `${key}${post[key]}`;
    }

    hashString += apipass;

    // Generate SHA1 hash
    return crypto.createHash('sha1').update(hashString).digest('hex');
  }

  async makeRequest(action, params = {}, method = 'POST') {
    try {
      console.log(`[VIRTUALIZOR] Making ${method} request for action: ${action}`);

      const postData = {
        ...params,
        api: 'json',
        apikey: this.apiKey,
        apipass: this.apiPassword
      };

      // Generate the API hash
      const hash = this.generateApiHash(action, postData);
      postData.hash = hash;

      const formData = new URLSearchParams();
      for (const [key, value] of Object.entries(postData)) {
        formData.append(key, value);
      }

      const response = await fetch(`${this.endpoint}/?act=${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'OceanLinux-VirtualizorAPI/1.0'
        },
        body: formData,
        redirect: 'follow' // Follow redirects automatically
      });

      const responseText = await response.text();
      console.log('[VIRTUALIZOR] Raw response:', responseText.substring(0, 500));

      let data;

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[VIRTUALIZOR] JSON parse error:', parseError);
        console.error('[VIRTUALIZOR] Response text:', responseText);
        throw new Error(`Invalid JSON response from Virtualizor API: ${responseText.substring(0, 200)}`);
      }

      if (!response.ok || data.error) {
        const errorMsg = data.error || data.msg || `Request failed with status ${response.status}`;
        console.error('[VIRTUALIZOR] API error response:', data);
        throw new Error(errorMsg);
      }

      return data;
    } catch (error) {
      console.error('[VIRTUALIZOR] API Error:', error);
      throw error;
    }
  }

  // Get VPS details
  async getVPSDetails(vpsId) {
    return await this.makeRequest('vpsmanage', { vps: vpsId });
  }

  // Get available OS templates
  async getOSTemplates() {
    return await this.makeRequest('ostemplates');
  }

  // Reinstall VPS
  async reinstallVPS(vpsId, osTemplateId, newPassword) {
    const params = {
      vps: vpsId,
      newos: osTemplateId,
      newpass: newPassword
    };

    return await this.makeRequest('rebuild', params);
  }

  // Start VPS
  async startVPS(vpsId) {
    return await this.makeRequest('start', { vps: vpsId });
  }

  // Stop VPS
  async stopVPS(vpsId) {
    return await this.makeRequest('stop', { vps: vpsId });
  }

  // Restart VPS
  async restartVPS(vpsId) {
    return await this.makeRequest('restart', { vps: vpsId });
  }

  // Change VPS password
  async changePassword(vpsId, newPassword) {
    return await this.makeRequest('changepassword', {
      vps: vpsId,
      newpass: newPassword
    });
  }
}

module.exports = VirtualizorAPI;
