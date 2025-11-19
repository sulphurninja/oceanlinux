/**
 * Helper function to format IP addresses for Windows Hostycare orders
 * Windows orders need port 49965 appended to the IP address
 * 
 * @param {string} ipAddress - The base IP address
 * @param {string} provider - The provider (hostycare, smartvps, etc.)
 * @param {string} os - The operating system
 * @returns {string} - The formatted IP address (with port if needed)
 */
export function formatIpAddress(ipAddress, provider, os) {
  // Return as-is if no IP address
  if (!ipAddress || ipAddress === 'Pending - Server being provisioned') {
    return ipAddress;
  }

  // Check if this is a Hostycare Windows order
  const isHostycare = provider === 'hostycare' || !provider; // default provider is hostycare
  const isWindows = os && os.toLowerCase().includes('windows');

  // If it's Hostycare Windows and doesn't already have the port, add it
  if (isHostycare && isWindows) {
    // Check if port is already added
    if (!ipAddress.includes(':49965')) {
      return `${ipAddress}:49965`;
    }
  }

  return ipAddress;
}

/**
 * Helper function to extract just the IP from an IP:port combination
 * 
 * @param {string} ipAddress - The IP address (may include port)
 * @returns {string} - Just the IP address without port
 */
export function extractBaseIp(ipAddress) {
  if (!ipAddress) return ipAddress;
  
  // Remove port if present
  const colonIndex = ipAddress.indexOf(':');
  if (colonIndex > -1) {
    return ipAddress.substring(0, colonIndex);
  }
  
  return ipAddress;
}

/**
 * Check if an order needs port 49965 appended
 * 
 * @param {Object} order - The order object
 * @returns {boolean} - Whether the order needs port 49965
 */
export function needsPort49965(order) {
  const isHostycare = order.provider === 'hostycare' || !order.provider;
  const isWindows = order.os && order.os.toLowerCase().includes('windows');
  return isHostycare && isWindows;
}

