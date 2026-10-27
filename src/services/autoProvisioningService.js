// /src/services/autoProvisioningService.js

const HostycareAPI = require('./hostycareApi');
const SmartVpsAPI = require('./smartvpsApi');              // SmartVPS client (with its own logging)
const AdvpsAPI = require('./advpsApi');
const { buildAdvpsPurchaseEmailCandidates, isAdvpsEmailPurchaseError } = require('@/lib/advpsPurchaseEmail');
const NetbayApi = require('./netbayApi');
const KurohostApi = require('./kurohostApi');
const connectDB = require('@/lib/db').default;
const Order = require('@/models/orderModel').default;
const IPStock = require('@/models/ipStockModel');
const Company = require('@/models/companyModel').default;
const { getCompanyNetbayApiConfig, resolveNetbayCouponAttempts, mergeNetbayStockCoupons } = require('@/lib/companyNetbayApi');
const { getCompanyKurohostApiConfig } = require('@/lib/companyKurohostApi');
const { generateSecurePassword } = require('@/lib/securePassword');
const { extractSmartVpsIpPrefix } = require('@/lib/smartvpsIpPrefix');
const {
  validateSmartVpsPackageRam,
  parseSmartVpsBuyResponse,
} = require('@/lib/smartvpsPackageRam');
const {
  readKurohostStockConfig,
  resolveKurohostFlavorId,
  resolveKurohostOsTemplateId,
} = require('@/lib/kurohostStockConfig');
const HostdzireApi = require('./hostdzireApi');
const { fetchHostdzireExpiry } = require('@/lib/hostdzireRenewal');
const { getCompanyHostdzireApiConfig } = require('@/lib/companyHostdzireApi');
const RackatoApi = require('./rackatoApi');
const { getCompanyRackatoApiConfig } = require('@/lib/companyRackatoApi');
const { resolveRackatoPlan } = require('@/lib/rackatoStockConfig');
const { parseRackatoOrder, parseRackatoExpiry } = require('@/lib/rackatoOrder');
const {
  readHostdzireStockConfig,
  resolveHostdzirePlaceOrderOs,
  resolveHostdzireInventoryForMemory,
} = require('@/lib/hostdzireStockConfig');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const {
  readResellerApiStockConfig,
  resolvePriceIdsForMemory,
  resolveCouponCodeForMemory,
  resolveZoneIsoIdFromCatalog,
  autoResolveResellerPriceIds,
  resolveEffectiveResellerPlanType,
  isResellerApiStock,
  resolveResellerZoneCandidatesForPurchase,
} = require('@/lib/resellerApiStockConfig');
const {
  waitForProvisionedVm,
  syncResellerVmCredentials,
  buildResellerLocationContext,
  ipMatchesOrderedRange,
  validateCreatedVmId,
  scheduleResellerPendingCompletion,
} = require('@/lib/resellerApiOrderSync');
const ResellerApi = require('@/services/resellerApi');
const { pickNetbayExpiryDate } = require('@/lib/netbayOrderSync');
const { orderHasConfirmedPayment, verifyOrderPaymentProof } = require('@/lib/orderPaymentStatus');
const {
  finalizeIpAssignmentForOrder,
} = require('@/lib/orderIpOwnership');

const L = {
  head: (label) => {
    console.log("\n" + "🔎".repeat(80));
    console.log(`[AUTO-PROVISION] ${label}`);
    console.log("🔎".repeat(80));
  },
  kv: (k, v) => console.log(`[AUTO-PROVISION] ${k}:`, v),
  line: (msg = '') => console.log(`[AUTO-PROVISION] ${msg}`),
};

// CRITICAL: In-memory lock to prevent race conditions when provisioning from the same package
// This ensures only ONE order can provision from a specific SmartVPS package at a time
const provisioningLocks = new Map(); // Key: packageName, Value: { locked: true, orderId: "..." }

class AutoProvisioningService {
  constructor() {
    this.hostycareApi = new HostycareAPI();
    this.smartvpsApi = new SmartVpsAPI();
    this.advpsApi = new AdvpsAPI();
    console.log('[AUTO-PROVISION-SERVICE] 🏗️ AutoProvisioningService instance created');
  }

  // --- NETBAY HELPERS -------------------------------------------------------

  /**
   * Decide if this IPStock should be provisioned via Netbay.
   * Detection priority:
   *   1) defaultConfigurations.netbay block exists (most reliable)
   *   2) tag === 'netbay'
   *   3) ipStock.provider === 'netbay'
   *   4) order.netbayServiceId already set (re-entry from cron / retry)
   *   5) IP stock's company has Netbay automation enabled (last resort,
   *      requires the IPStock to be linked to the company)
   *
   * Note: company-level detection alone isn't enough — a company can have
   * Netbay enabled while still hosting non-Netbay IP stocks. The presence
   * of a `defaultConfigurations.netbay` block is the canonical signal.
   */
  isNexaStock(ipStock, order) {
    const { isNexaDedicatedIpStock } = require('@/lib/netbayGroupTags');
    if (isNexaDedicatedIpStock(ipStock)) return true;
    return order?.provider === 'nexa' || !!order?.nexaOrderId;
  }

  isNetbayStock(ipStock, order) {
    if (this.isNexaStock(ipStock)) return false;
    const tags = Array.isArray(ipStock?.tags) ? ipStock.tags : [];
    const provider = (ipStock?.provider || '').toString().toLowerCase();

    const hasNetbayConfig = !!(ipStock?.defaultConfigurations?.netbay ||
      ipStock?.defaultConfigurations?.get?.('netbay'));
    const taggedNetbay = tags.some(t => String(t).toLowerCase() === 'netbay');
    const byProvider = provider === 'netbay';
    const byOrder = !!order?.netbayServiceId || order?.provider === 'netbay';

    const isNetbay = hasNetbayConfig || taggedNetbay || byProvider || byOrder;

    L.kv('Netbay detection', {
      hasNetbayConfig, taggedNetbay, byProvider, byOrder, result: isNetbay
    });

    return isNetbay;
  }

  isKurohostStock(ipStock, order) {
    const tags = Array.isArray(ipStock?.tags) ? ipStock.tags : [];
    const provider = (ipStock?.provider || '').toString().toLowerCase();

    const hasKurohostConfig = !!(ipStock?.defaultConfigurations?.kurohost ||
      ipStock?.defaultConfigurations?.get?.('kurohost'));
    const taggedKurohost = tags.some(t => String(t).toLowerCase() === 'kurohost');
    const byProvider = provider === 'kurohost';
    const byOrder = !!order?.kurohostInstanceId || order?.provider === 'kurohost';

    const isKurohost = hasKurohostConfig || taggedKurohost || byProvider || byOrder;

    L.kv('KuroHost detection', {
      hasKurohostConfig, taggedKurohost, byProvider, byOrder, result: isKurohost,
    });

    return isKurohost;
  }

  isHostdzireStock(ipStock, order) {
    const tags = Array.isArray(ipStock?.tags) ? ipStock.tags : [];
    const provider = (ipStock?.provider || '').toString().toLowerCase();

    const hasHostdzireConfig = !!(ipStock?.defaultConfigurations?.hostdzire ||
      ipStock?.defaultConfigurations?.get?.('hostdzire'));
    const taggedHostdzire = tags.some(t => String(t).toLowerCase() === 'hostdzire');
    const byProvider = provider === 'hostdzire';
    const byOrder = !!order?.hostdzireOrderId || order?.provider === 'hostdzire';

    const cfg = readHostdzireStockConfig(ipStock);
    const hasInventoryKey = !!cfg.inventoryKey ||
      Object.values(cfg.inventoryByMemory || {}).some((v) => v?.inventoryKey);
    const isHostdzire = hasHostdzireConfig || taggedHostdzire || byProvider || byOrder || hasInventoryKey;

    L.kv('HostDzire detection', {
      hasHostdzireConfig, taggedHostdzire, byProvider, byOrder, hasInventoryKey, result: isHostdzire,
    });

    return isHostdzire;
  }

  async isRackatoStock(ipStock, order) {
    const tags = Array.isArray(ipStock?.tags) ? ipStock.tags : [];
    const provider = String(ipStock?.provider || '').toLowerCase();
    const hasConfig = !!(ipStock?.defaultConfigurations?.rackato ||
      ipStock?.defaultConfigurations?.get?.('rackato'));
    const tagged = tags.some((t) => String(t).toLowerCase() === 'rackato');
    const byProvider = provider === 'rackato';
    const byOrder = !!order?.rackatoOrderId || order?.provider === 'rackato';
    let byCompany = false;
    if (!hasConfig && !tagged && !byProvider && !byOrder && ipStock?.company) {
      const company = await Company.findById(ipStock.company).select('rackatoApi').lean();
      byCompany = company?.rackatoApi?.enabled === true;
    }
    const isRackato = hasConfig || tagged || byProvider || byOrder || byCompany;
    L.kv('Rackato detection', { hasConfig, tagged, byProvider, byOrder, byCompany, result: isRackato });
    return isRackato;
  }

  async resolveKurohostConfigForStock(ipStock) {
    if (!ipStock?.company) {
      L.line('[KUROHOST] IPStock has no company link — cannot resolve API credentials');
      return null;
    }
    try {
      const company = await Company.findById(ipStock.company).select('kurohostApi name').lean();
      if (!company) {
        L.line(`[KUROHOST] Company ${ipStock.company} not found`);
        return null;
      }
      const cfg = getCompanyKurohostApiConfig(company);
      if (!cfg) {
        L.line(`[KUROHOST] Company "${company.name}" has no enabled/complete KuroHost API config`);
        return null;
      }
      return { ...cfg, companyName: company.name };
    } catch (err) {
      L.line(`[KUROHOST] Failed to load company config: ${err.message}`);
      return null;
    }
  }

  /**
   * Resolve the Netbay API config for an IPStock by walking up to its
   * Company. Returns null when the company has no Netbay config (or the
   * stock isn't linked to a company at all).
   */
  async resolveNetbayConfigForStock(ipStock) {
    if (!ipStock?.company) {
      L.line('[NETBAY] IPStock has no company link — cannot resolve Netbay API credentials');
      return null;
    }
    try {
      const company = await Company.findById(ipStock.company).select('netbayApi name').lean();
      if (!company) {
        L.line(`[NETBAY] Company ${ipStock.company} not found`);
        return null;
      }
      const cfg = getCompanyNetbayApiConfig(company);
      if (!cfg) {
        L.line(`[NETBAY] Company "${company.name}" has no enabled/complete Netbay API config`);
        return null;
      }
      const stockNetbayRaw =
        ipStock?.defaultConfigurations?.get?.('netbay') ||
        ipStock?.defaultConfigurations?.netbay ||
        {};
      const merged = mergeNetbayStockCoupons(cfg, stockNetbayRaw);
      return { ...merged, companyName: company.name };
    } catch (err) {
      L.line(`[NETBAY] Failed to load company config: ${err.message}`);
      return null;
    }
  }

  async resolveHostdzireConfigForStock(ipStock) {
    if (!ipStock?.company) {
      L.line('[HOSTDZIRE] IPStock has no company link — cannot resolve API credentials');
      return null;
    }
    try {
      const company = await Company.findById(ipStock.company).select('hostdzireApi name').lean();
      if (!company) {
        L.line(`[HOSTDZIRE] Company ${ipStock.company} not found`);
        return null;
      }
      const cfg = getCompanyHostdzireApiConfig(company);
      if (!cfg) {
        L.line(`[HOSTDZIRE] Company "${company.name}" has no enabled/complete HostDzire API config`);
        return null;
      }
      return { ...cfg, companyName: company.name };
    } catch (err) {
      L.line(`[HOSTDZIRE] Failed to load company config: ${err.message}`);
      return null;
    }
  }

  /**
   * Read the per-stock Netbay block out of `defaultConfigurations.netbay`,
   * normalising both Map and plain-object storage. Expected shape:
   *   {
   *     groupTag: '103.157',                // optional location filter
   *     planByMemory: { '4GB': '60d5f...' } // RAM → planId
   *     defaultOs: { Linux: 'Ubuntu 22.04', Windows: 'Windows Server 2022' }
   *   }
   * Anything missing is replaced with sensible defaults at use time.
   */
  readNetbayStockConfig(ipStock) {
    const cfg = ipStock?.defaultConfigurations?.get?.('netbay') ||
      ipStock?.defaultConfigurations?.netbay ||
      {};

    const planByMemory = cfg.planByMemory instanceof Map
      ? Object.fromEntries(cfg.planByMemory)
      : (cfg.planByMemory || {});

    const defaultOs = cfg.defaultOs instanceof Map
      ? Object.fromEntries(cfg.defaultOs)
      : (cfg.defaultOs || {});

    return {
      groupTag: cfg.groupTag || '',
      groupTags: Array.isArray(cfg.groupTags) ? cfg.groupTags : [],
      planByMemory,
      defaultOs,
      variantStock: cfg.variantStock || {},
      lastStockSync: cfg.lastStockSync || null,
      couponCode: cfg.couponCode || '',
      couponLinux: cfg.couponLinux || '',
      couponVps: cfg.couponVps || '',
      couponProxy: cfg.couponProxy || '',
      couponByMemory:
        cfg.couponByMemory instanceof Map
          ? Object.fromEntries(cfg.couponByMemory)
          : cfg.couponByMemory || {},
    };
  }

  /**
   * Pick the best plan id for the order's memory size from the per-stock
   * planByMemory map. Tries exact match first, then variations
   * ("4GB" / "4gb" / "4 GB"), then falls back to ANY configured plan id
   * if there's only one (small reseller convenience).
   */
  resolveNetbayPlanId({ planByMemory, ram }) {
    if (!planByMemory || typeof planByMemory !== 'object') return '';
    const variations = [
      ram, String(ram || '').toLowerCase(), String(ram || '').toUpperCase(),
      String(ram || '').replace(/\s+/g, ''),
    ].filter(Boolean);

    for (const v of variations) {
      const id = planByMemory[v];
      if (id) return String(id);
    }
    const entries = Object.entries(planByMemory).filter(([, v]) => !!v);
    if (entries.length === 1) return String(entries[0][1]);
    for (const k of ['4GB', '8GB', '2GB']) {
      if (planByMemory[k]) return String(planByMemory[k]);
    }
    if (entries.length) return String(entries[0][1]);
    return '';
  }

  /**
   * Linux vs Windows for provisioning. Product name wins over default order.os (Ubuntu 22).
   */
  isWindowsOrder(order, ipStock) {
    const { isWindowsOrder: resolveWindows } = require('@/lib/orderOs');
    return resolveWindows(order, ipStock);
  }

  /**
   * Hints for Netbay OS template resolution (stock override + order enum).
   * Actual catalog name is resolved via NetbayApi.resolveOsTemplateName().
   */
  netbayOsHints({ defaultOs, isWindows, orderOs }) {
    const hints = [];
    if (defaultOs) {
      if (isWindows && defaultOs.Windows) hints.push(defaultOs.Windows);
      if (!isWindows && defaultOs.Linux) hints.push(defaultOs.Linux);
    }
    if (orderOs) hints.push(orderOs);
    return hints;
  }

  // Acquire a lock for a specific SmartVPS package
  async acquirePackageLock(packageName, orderId, maxWaitMs = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const existingLock = provisioningLocks.get(packageName);

      if (!existingLock) {
        // No lock exists, acquire it
        provisioningLocks.set(packageName, { locked: true, orderId, acquiredAt: new Date() });
        L.line(`[LOCK] 🔒 Acquired lock for package "${packageName}" (order: ${orderId})`);
        return true;
      }

      // Lock exists, check if it's stale (older than 2 minutes = likely crashed)
      const lockAge = Date.now() - new Date(existingLock.acquiredAt).getTime();
      if (lockAge > 120000) {
        L.line(`[LOCK] ⚠️ Stale lock detected for "${packageName}" (age: ${lockAge}ms), releasing...`);
        provisioningLocks.delete(packageName);
        continue;
      }

      // Lock is held by another order, wait
      L.line(`[LOCK] ⏳ Package "${packageName}" is locked by order ${existingLock.orderId}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }

    // Timeout
    throw new Error(`Failed to acquire lock for package "${packageName}" after ${maxWaitMs}ms. Another order is currently provisioning from this package.`);
  }

  // Release a lock for a specific SmartVPS package
  releasePackageLock(packageName, orderId) {
    const existingLock = provisioningLocks.get(packageName);

    if (existingLock && existingLock.orderId === orderId) {
      provisioningLocks.delete(packageName);
      L.line(`[LOCK] 🔓 Released lock for package "${packageName}" (order: ${orderId})`);
    } else {
      L.line(`[LOCK] ⚠️ Attempted to release lock for "${packageName}" but it's not held by order ${orderId}`);
    }
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

  // --- ADVPS HELPERS --------------------------------------------------------

  isAdvpsStock(ipStock, order) {
    const tags = Array.isArray(ipStock?.tags) ? ipStock.tags : [];
    const provider = (ipStock?.provider || '').toString().toLowerCase();
    const name = (ipStock?.name || '').toString();
    const product = (order?.productName || '').toString();

    const taggedAdvps = tags.some(t => String(t).toLowerCase() === 'advps');
    const byProvider = provider === 'advps';
    const byNameEmoji = name.startsWith('⚡');
    const byProductEmoji = product.startsWith('⚡');

    const hasAdvpsConfig = !!(ipStock?.defaultConfigurations?.advps ||
      ipStock?.defaultConfigurations?.get?.('advps'));

    // Stale ADVPS block on Hostheaven/reseller rows must not beat panel auto-buy.
    if (
      hasAdvpsConfig &&
      !taggedAdvps &&
      !byProvider &&
      !byNameEmoji &&
      !byProductEmoji &&
      isResellerApiStock(ipStock, order)
    ) {
      L.kv('ADVPS detection', {
        taggedAdvps,
        byProvider,
        byNameEmoji,
        hasAdvpsConfig,
        byProductEmoji,
        staleAdvpsOnResellerStock: true,
        result: false,
      });
      return false;
    }

    const isAdvps = taggedAdvps || byProvider || byNameEmoji || hasAdvpsConfig || byProductEmoji;

    L.kv('ADVPS detection', {
      taggedAdvps, byProvider, byNameEmoji, hasAdvpsConfig, byProductEmoji,
      result: isAdvps
    });

    return isAdvps;
  }

  /**
   * Fetch available OS options from ADVPS and match the target OS string.
   * @param {string} targetOS - e.g. "Ubuntu 22", "Windows 2022 64"
   * @param {string} vmType - "LXC" or "VM" (maps to ADVPS type "lxc" or "vps")
   */
  async resolveAdvpsOsId(targetOS, vmType) {
    L.line(`[ADVPS] Resolving OS ID for target: "${targetOS}" (vmType: ${vmType})`);
    try {
      const upper = String(vmType).toUpperCase();
      const osType = (upper === 'VPS' || upper === 'VM') ? 'vps' : 'lxc';
      const res = await this.advpsApi.listOs(osType);
      const osList = res?.data?.os || res?.data || [];

      if (!Array.isArray(osList) || osList.length === 0) {
        L.line(`[ADVPS] OS list empty or unexpected format, will skip osId`);
        return null;
      }

      L.kv('[ADVPS] Available OS options', osList.map(o => `${o.id}: ${o.name}`));

      const target = String(targetOS).toLowerCase();

      let bestMatch = null;
      let bestScore = 0;
      for (const os of osList) {
        const osName = String(os.name || '').toLowerCase();
        let score = 0;

        if (target.includes('ubuntu')) {
          if (osName.includes('ubuntu')) score = 1;
          if (osName.includes('ubuntu') && osName.includes('22')) score = 3;
        } else if (target.includes('centos')) {
          if (osName.includes('centos')) score = 1;
          if (osName.includes('centos') && osName.includes('7')) score = 3;
        } else if (target.includes('windows')) {
          if (osName.includes('windows')) score = 1;
          if (osName.includes('windows') && osName.includes('2022')) score = 3;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = os;
        }
      }

      if (bestMatch) {
        L.kv('[ADVPS] Matched OS', { name: bestMatch.name, id: bestMatch.id, score: bestScore });
        return bestMatch.id;
      }

      const fallback = osList[0];
      L.line(`[ADVPS] No OS match found, using fallback: ${fallback.name} (${fallback.id})`);
      return fallback.id;
    } catch (e) {
      L.line(`[ADVPS] Failed to fetch OS list: ${e.message}`);
      return null;
    }
  }

  /**
   * Fallback: search ADVPS product stock API for a product matching the base name + RAM.
   * Used when the pre-synced variant mapping doesn't have the requested RAM.
   */
  async findAdvpsProductByRam(baseName, ram, vmType) {
    L.line(`[ADVPS] Fallback product search: baseName="${baseName}", ram="${ram}", vmType="${vmType}"`);
    try {
      const upper = String(vmType).toUpperCase();
      const type = (upper === 'VPS' || upper === 'VM') ? 'vps' : 'linux';
      const allProducts = await this.advpsApi.productStockAll({ type });
      L.kv('[ADVPS] Products from API', allProducts.length);

      const ramNum = String(ram).replace(/[^0-9]/g, '');

      for (const product of allProducts) {
        const pName = String(product.name || '');
        const pRam = String(pName.match(/(\d+)\s*GB/i)?.[1] || '');

        if (pRam === ramNum) {
          const pBaseName = pName.replace(/\s*\d+\s*GB\s*/i, ' ').replace(/\s+/g, ' ').trim();
          if (pBaseName.toLowerCase() === baseName.toLowerCase()) {
            L.kv('[ADVPS] Fallback match found', { id: product.id, name: pName, stock: product.stock });
            if (Number(product.stock || 0) <= 0 && product.stockStatus === 'OUT_OF_STOCK') {
              L.line(`[ADVPS] ⚠️ Matched product is OUT_OF_STOCK, continuing search...`);
              continue;
            }
            return { productId: String(product.id), productName: pName };
          }
        }
      }

      // Broader search: match any product with matching RAM across all base names
      for (const product of allProducts) {
        const pName = String(product.name || '');
        const pRam = String(pName.match(/(\d+)\s*GB/i)?.[1] || '');

        if (pRam === ramNum && Number(product.stock || 0) > 0) {
          const pBaseName = pName.replace(/\s*\d+\s*GB\s*/i, ' ').replace(/\s+/g, ' ').trim();
          // Check if product name partially matches the IPStock base name
          const baseWords = baseName.toLowerCase().split(/\s+/);
          const pWords = pBaseName.toLowerCase().split(/\s+/);
          const overlap = baseWords.filter(w => pWords.includes(w)).length;
          if (overlap >= Math.min(2, baseWords.length)) {
            L.kv('[ADVPS] Fallback partial match', { id: product.id, name: pName, overlap });
            return { productId: String(product.id), productName: pName };
          }
        }
      }

      return null;
    } catch (e) {
      L.line(`[ADVPS] Fallback product search failed: ${e.message}`);
      return null;
    }
  }

  // --- SMARTVPS HELPERS ----------------------------------------------------

  // Decide if this IPStock belongs to SmartVPS
  // Detection methods:
  // 1) tags include "smartvps" OR "ocean linux" (Ocean Linux = SmartVPS)
  // 2) provider field equals "smartvps"
  // 3) name starts with 🌊 (Ocean Linux emoji)
  // 4) has defaultConfigurations.smartvps block
  // 5) productName starts with 🌊
  isSmartVpsStock(ipStock, order) {
    const tags = Array.isArray(ipStock?.tags) ? ipStock.tags : [];
    const provider = (ipStock?.provider || '').toString().toLowerCase();
    const name = (ipStock?.name || '').toString();
    const product = (order?.productName || '').toString();

    // Check tags - both 'smartvps' and 'ocean linux' indicate SmartVPS
    const taggedSmartVps = tags.some(t => String(t).toLowerCase() === 'smartvps');
    const taggedOceanLinux = tags.some(t => String(t).toLowerCase() === 'ocean linux');

    // Check provider field
    const byProvider = provider === 'smartvps';

    // Check name starts with 🌊 (Ocean Linux naming convention)
    const byNameEmoji = name.startsWith('🌊');

    // Check if has smartvps config block
    const hasSmartVpsConfig = !!(ipStock?.defaultConfigurations?.smartvps ||
      ipStock?.defaultConfigurations?.get?.('smartvps'));

    // Check product name starts with 🌊
    const byProductEmoji = product.startsWith('🌊');

    const isSmartVps = taggedSmartVps || taggedOceanLinux || byProvider ||
      byNameEmoji || hasSmartVpsConfig || byProductEmoji;

    L.kv('IPStock.tags', tags);
    L.kv('IPStock.provider', ipStock?.provider || '(missing)');
    L.kv('IPStock.name', ipStock?.name || '(missing)');
    L.kv('Order.productName', order?.productName || '(missing)');
    L.kv('SmartVPS detection', {
      taggedSmartVps, taggedOceanLinux, byProvider,
      byNameEmoji, hasSmartVpsConfig, byProductEmoji,
      result: isSmartVps
    });

    return isSmartVps;
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

  extractSmartVpsIpPrefix(productName) {
    return extractSmartVpsIpPrefix(productName);
  }

  /**
   * Pick an IP from SmartVPS ipstock that matches the requested package.
   * SmartVPS expects us to first fetch ipstock and then call buyvps with a concrete IP.
   * We match on octets:
   * - If package name has 3 numeric octets (e.g., 103.181.91), match first 3 octets.
   * - Otherwise fall back to first 2 octets.
   */
/**
 * CORRECTED VERSION - Pick a package from Smart VPS ipstock
 * 
 * KEY INSIGHT: The ipstock API returns PACKAGE NAMES and IP COUNTS, not individual IPs!
 * 
 * Example response:
 * {
 *   "packages": [
 *     {"id": 5, "name": "103.82.72", "ipv4": 71, "status": "active"}
 *   ]
 * }
 * 
 * We search for a matching package and return its NAME (e.g., "103.82.72"),
 * then buyVps("103.82.72", "16") will assign a random IP from that package's pool.
 */async pickSmartVpsIpForPackage(pkgName, ramGb = null) {
    try {
      L.line('[SMARTVPS] Calling ipstock() …');
      const res = await this.smartvpsApi.ipstock();
      const data = this.normalizeSmartVpsResponse(res);

      // Parse response to get packages array
      let parsed = data;
      if (typeof data === 'string') {
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          L.line(`[SMARTVPS] Failed to parse ipstock response: ${e.message}`);
          throw new Error('Invalid ipstock response format');
        }
      }

      const packages = parsed?.packages || [];
      L.line(`[SMARTVPS] Found ${packages.length} packages in ipstock`);

      if (packages.length === 0) {
        throw new Error('No packages available in SmartVPS ipstock');
      }

      // Strategy: Try to find exact match first, then similar packages
      const requestedPrefix = String(pkgName).trim();
      const parts = requestedPrefix.split('.');
      const numericParts = parts.filter(p => /^\d+$/.test(p));

      let selectedPackage = null;
      let matchStrategy = null;

      // 1. Try EXACT match (e.g., "103.82.72" === "103.82.72")
      selectedPackage = packages.find(pkg =>
        pkg.name === requestedPrefix &&
        pkg.status === 'active' &&
        Number(pkg.ipv4 || 0) > 0
      );

      if (selectedPackage) {
        matchStrategy = `exact match`;
      } else if (numericParts.length >= 3) {
        // 2. Try exact 3-octet match (e.g., "103.82.72" matches "103.82.72")
        const prefix3 = numericParts.slice(0, 3).join('.');
        selectedPackage = packages.find(pkg => {
          const pkgName = String(pkg.name || '').replace(/[^0-9.]/g, '');
          return pkgName.startsWith(prefix3) &&
            pkg.status === 'active' &&
            Number(pkg.ipv4 || 0) > 0;
        });

        if (selectedPackage) {
          matchStrategy = `3-octet prefix match (${prefix3})`;
        } else {
          // 3. Fallback to 2-octet match (e.g., "103.82.*")
          const prefix2 = numericParts.slice(0, 2).join('.');
          selectedPackage = packages.find(pkg => {
            const pkgName = String(pkg.name || '').replace(/[^0-9.]/g, '');
            return pkgName.startsWith(prefix2) &&
              pkg.status === 'active' &&
              Number(pkg.ipv4 || 0) > 0;
          });

          if (selectedPackage) {
            matchStrategy = `2-octet prefix match (${prefix2})`;
            L.line(`[SMARTVPS] ⚠️ No exact match for ${requestedPrefix}, using fallback`);
          }
        }
      } else {
        // Only 2 octets requested, try prefix match
        const prefix2 = numericParts.slice(0, 2).join('.');
        selectedPackage = packages.find(pkg => {
          const pkgName = String(pkg.name || '').replace(/[^0-9.]/g, '');
          return pkgName.startsWith(prefix2) &&
            pkg.status === 'active' &&
            Number(pkg.ipv4 || 0) > 0;
        });

        if (selectedPackage) {
          matchStrategy = `2-octet prefix match`;
        }
      }

      L.kv('[SMARTVPS] Requested package', requestedPrefix);
      L.kv('[SMARTVPS] Match strategy', matchStrategy || 'none');

      if (selectedPackage) {
        L.kv('[SMARTVPS] Selected package name', selectedPackage.name);
        L.kv('[SMARTVPS] Available IPs in package', selectedPackage.ipv4);

        if (ramGb != null && ramGb !== '') {
          const ramCheck = validateSmartVpsPackageRam(selectedPackage, ramGb);
          L.kv('[SMARTVPS] RAM validation', ramCheck);
          if (!ramCheck.ok) {
            throw new Error(ramCheck.error);
          }
        }

        L.line(`[SMARTVPS] ✅ Will request package "${selectedPackage.name}" and SmartVPS will assign an IP from its pool`);

        // Return the PACKAGE NAME (not a full IP) - SmartVPS will assign an IP from this package
        return selectedPackage.name;
      }

      // No match found
      L.line(`[SMARTVPS] ❌ No matching package found`);
      L.line(`[SMARTVPS] Available packages:`);
      packages.filter(p => p.status === 'active').slice(0, 10).forEach(p => {
        L.line(`  - ${p.name} (${p.ipv4} IPs available)`);
      });

      throw new Error(`No package matching or similar to "${requestedPrefix}" found in ipstock`);

    } catch (e) {
      throw new Error(`SmartVPS ipstock failed: ${e.message}`);
    }
  }


  // BEFORE: pickSmartVpsIp() tries to regex IPv4 from ipstock
  // AFTER: pick a package by name/id, return a descriptor

  async pickSmartVpsPackage(ipStock, order) {
    try {
      // CRITICAL: Use EXACT package ID and name from IPStock configuration
      // This ensures customer gets EXACTLY what they ordered
      const smartvpsConfig = ipStock?.defaultConfigurations?.get?.('smartvps') ||
        ipStock?.defaultConfigurations?.smartvps;

      if (!smartvpsConfig) {
        throw new Error('IPStock missing SmartVPS configuration (defaultConfigurations.smartvps)');
      }

      const storedPid = String(smartvpsConfig.packagePid || '');
      const storedName = String(smartvpsConfig.packageName || '');

      if (!storedPid || !storedName) {
        throw new Error(`IPStock ${ipStock._id} has invalid SmartVPS config: pid="${storedPid}", name="${storedName}"`);
      }

      L.line(`[SMARTVPS] Using EXACT package from IPStock config:`);
      L.kv('[SMARTVPS]   → Package ID (PID)', storedPid);
      L.kv('[SMARTVPS]   → Package Name', storedName);
      L.kv('[SMARTVPS]   → IPStock ID', ipStock._id);
      L.kv('[SMARTVPS]   → IPStock Name', ipStock.name);

      // Verify the package still exists in the API (optional safety check)
      L.line('[SMARTVPS] Verifying package exists in API...');
      const res = await this.smartvpsApi.ipstock();
      const data = this.normalizeSmartVpsResponse(res);
      const obj = typeof data === 'string' ? JSON.parse(data) : data;
      const packages = Array.isArray(obj?.packages) ? obj.packages : [];

      // Find the EXACT package by ID (PID is the primary unique identifier)
      const exactMatch = packages.find(p => String(p.id) === storedPid);

      if (!exactMatch) {
        L.line(`[SMARTVPS] ⚠️ WARNING: Package not found in current API response!`);
        L.kv('[SMARTVPS]   Searched for PID', storedPid);
        L.kv('[SMARTVPS]   Expected Name', storedName);
        L.kv('[SMARTVPS]   Available packages', packages.map(p => `${p.id}::${p.name}`));
        throw new Error(`Package with PID ${storedPid} no longer available in SmartVPS API. Customer ordered product that is now unavailable.`);
      }

      // SAFETY CHECK: Warn if package name changed (SmartVPS renamed it)
      if (String(exactMatch.name) !== storedName) {
        L.line(`[SMARTVPS] ⚠️ NOTICE: SmartVPS renamed this package!`);
        L.kv('[SMARTVPS]   PID (matched)', storedPid);
        L.kv('[SMARTVPS]   Old name (stored)', storedName);
        L.kv('[SMARTVPS]   New name (current)', exactMatch.name);
        L.line(`[SMARTVPS]   → Provisioning will continue with PID ${storedPid}`);
        L.line(`[SMARTVPS]   → Consider updating IPStock to sync new name`);
      }

      // Verify package is active and has available IPs
      if (String(exactMatch.status).toLowerCase() !== 'active') {
        throw new Error(`Package "${storedName}" (PID: ${storedPid}) is not active. Status: ${exactMatch.status}`);
      }

      if (Number(exactMatch.ipv4 || 0) <= 0) {
        throw new Error(`Package "${storedName}" (PID: ${storedPid}) has no available IPs. IPv4 count: ${exactMatch.ipv4}`);
      }

      // SAFETY: Warn if running low on IPs (potential race condition risk)
      const ipCount = Number(exactMatch.ipv4 || 0);
      if (ipCount <= 5) {
        L.line(`[SMARTVPS] ⚠️ WARNING: Package running low on IPs!`);
        L.kv('[SMARTVPS]   → Available IPv4', ipCount);
        L.line(`[SMARTVPS]   → Risk: Concurrent orders may cause SmartVPS to assign from different package`);
      }

      L.line(`[SMARTVPS] ✅ Exact package verified and available:`);
      L.kv('[SMARTVPS]   → ID', exactMatch.id);
      L.kv('[SMARTVPS]   → Name (current in API)', exactMatch.name);
      L.kv('[SMARTVPS]  → Name (customer ordered)', storedName);
      L.kv('[SMARTVPS]   → Status', exactMatch.status);
      L.kv('[SMARTVPS]   → Available IPv4', exactMatch.ipv4);

      // CRITICAL: Return the STORED name (what customer ordered), not the current API name
      // Even if SmartVPS renamed the package, we need to search for IPs matching what the customer ordered
      return { id: exactMatch.id, name: storedName };
    } catch (e) {
      throw new Error(`SmartVPS package selection failed: ${e.message}`);
    }
  }


  // --- MAIN PROVISION METHOD ----------------------------------------------

  async provisionServer(orderId, options = {}) {
    const startTime = Date.now();
    const allowUnpaid = options?.allowUnpaid === true;
    console.log("\n" + "🚀".repeat(80));
    console.log(`[AUTO-PROVISION] 🚀 STARTING AUTO-PROVISIONING for order: ${orderId}`);
    console.log(`[AUTO-PROVISION] ⏰ Start time: ${new Date().toISOString()}`);
    console.log("🚀".repeat(80));

    await connectDB();
    L.line('✅ Database connected');

    try {
      // =====================================================================
      // STEP 0: PAYMENT GUARD — refuse to provision unpaid orders.
      // This is the single choke-point that blocks delivery without a real
      // payment, regardless of which caller triggered provisioning.
      // =====================================================================
      const paymentCheckOrder = await Order.findById(orderId).select(
        'transactionId walletDeduction paymentDetails paymentMethod resellerId price status provisioningStatus ipAddress clientTxnId gatewayOrderId user productName slotIpPackageId slotIpId trialVpsPackageId trialVpsSlotId'
      );

      if (!paymentCheckOrder) {
        throw new Error(`Order ${orderId} not found in database`);
      }

      // Slot IP orders are inventory-assigned — never route to Hostycare/SmartVPS/etc.
      if (paymentCheckOrder.slotIpPackageId) {
        if (paymentCheckOrder.slotIpId && paymentCheckOrder.ipAddress) {
          return {
            success: true,
            alreadyProvisioned: true,
            message: 'Slot IP already assigned',
            ipAddress: paymentCheckOrder.ipAddress,
            totalTime: Date.now() - startTime,
          };
        }
        const { fulfillOrderInventory } = require('@/lib/fulfillOrderInventory');
        let fullSlotOrder = await Order.findById(orderId);
        if (
          fullSlotOrder &&
          (fullSlotOrder.provisioningStatus === 'failed' || fullSlotOrder.provisioningStatus === 'provisioning')
        ) {
          fullSlotOrder.provisioningStatus = 'pending';
          fullSlotOrder.provisioningError = '';
          await fullSlotOrder.save();
        }
        await fulfillOrderInventory(fullSlotOrder, allowUnpaid ? { allowUnpaid: true } : {});
        const slotOrder = await Order.findById(orderId);
        if (slotOrder?.slotIpId && slotOrder?.ipAddress) {
          return {
            success: true,
            message: 'Slot IP assigned',
            ipAddress: slotOrder.ipAddress,
            totalTime: Date.now() - startTime,
          };
        }
        const slotErr =
          slotOrder?.provisioningError || 'No slot IPs available in this package';
        return {
          success: false,
          slotIpOrder: true,
          error: slotErr,
          message: slotErr,
          totalTime: Date.now() - startTime,
        };
      }

      if (paymentCheckOrder.trialVpsPackageId) {
        if (paymentCheckOrder.trialVpsSlotId && paymentCheckOrder.ipAddress) {
          return {
            success: true,
            alreadyProvisioned: true,
            message: 'Trial VPS already assigned',
            ipAddress: paymentCheckOrder.ipAddress,
            totalTime: Date.now() - startTime,
          };
        }
        const { fulfillOrderInventory } = require('@/lib/fulfillOrderInventory');
        let fullTrialOrder = await Order.findById(orderId);
        if (
          fullTrialOrder &&
          (fullTrialOrder.provisioningStatus === 'failed' || fullTrialOrder.provisioningStatus === 'provisioning')
        ) {
          fullTrialOrder.provisioningStatus = 'pending';
          fullTrialOrder.provisioningError = '';
          await fullTrialOrder.save();
        }
        await fulfillOrderInventory(fullTrialOrder, allowUnpaid ? { allowUnpaid: true } : {});
        const trialOrder = await Order.findById(orderId);
        if (trialOrder?.trialVpsSlotId && trialOrder?.ipAddress) {
          return {
            success: true,
            message: 'Trial VPS assigned',
            ipAddress: trialOrder.ipAddress,
            totalTime: Date.now() - startTime,
          };
        }
        const trialErr =
          trialOrder?.provisioningError || 'No trial VPS slots available in this package';
        return {
          success: false,
          trialVpsOrder: true,
          error: trialErr,
          message: trialErr,
          totalTime: Date.now() - startTime,
        };
      }

      // Never re-block an order that was already delivered.
      const alreadyDelivered =
        paymentCheckOrder.provisioningStatus === 'active' && !!paymentCheckOrder.ipAddress;

      // Payment proof required even if Mongo shows already delivered
      // (blocks planting provisioningStatus=active + fake ipAddress).
      if (!allowUnpaid) {
        const proof = await verifyOrderPaymentProof(paymentCheckOrder);
        if (!proof.ok) {
          // Don't yank a live server if Razorpay API is temporarily down
          if (alreadyDelivered && proof.reason === 'razorpay_api_error') {
            L.line('⚠️ Already-delivered order: gateway re-check failed (API); leaving as-is');
          } else {
            L.head('STEP 0: PAYMENT GUARD BLOCKED PROVISIONING');
            L.kv('  → Order ID', String(orderId));
            L.kv('  → clientTxnId', paymentCheckOrder.clientTxnId || 'none');
            L.kv('  → gatewayOrderId', paymentCheckOrder.gatewayOrderId || 'none');
            L.kv('  → status', paymentCheckOrder.status || 'none');
            L.kv('  → paymentMethod', paymentCheckOrder.paymentMethod || 'none');
            L.kv('  → transactionId', paymentCheckOrder.transactionId || 'MISSING');
            L.kv('  → proofReason', proof.reason || 'unknown');
            L.kv('  → alreadyDeliveredFlag', alreadyDelivered ? 'yes' : 'no');
            L.line('⛔ No verifiable payment proof — provisioning refused (Mongo confirm alone is not enough).');

            try {
              const PaymentOrderLogger = require('@/services/paymentOrderLogger');
              const logger = PaymentOrderLogger.forOrder(paymentCheckOrder, 'provision-guard');
              logger.warning('Provisioning blocked: no verifiable payment proof', {
                orderId: String(orderId),
                status: paymentCheckOrder.status,
                transactionId: paymentCheckOrder.transactionId || null,
                walletDeducted: paymentCheckOrder.walletDeduction?.deducted === true,
                proofReason: proof.reason,
                alreadyDelivered,
              });
              await logger.save({
                success: false,
                anomaly: true,
                errorMessage: `provisioning_blocked_${proof.reason || 'unpaid_order'}`,
              });
            } catch (logErr) {
              console.error('[AUTO-PROVISION] Failed to log payment-guard block:', logErr.message);
            }

            try {
              const clearFake = alreadyDelivered
                ? {
                    provisioningStatus: 'failed',
                    provisioningError: `PAYMENT_PROOF: ${proof.reason || 'missing'}`,
                    ipAddress: '',
                    autoProvisioned: false,
                    updatedAt: new Date(),
                  }
                : {
                    provisioningStatus: 'failed',
                    provisioningError: `PAYMENT_PROOF: ${proof.reason || 'missing'}`,
                    updatedAt: new Date(),
                  };
              await Order.findByIdAndUpdate(orderId, { $set: clearFake });
            } catch (_) {}

            return {
              success: false,
              paymentRequired: true,
              message:
                'Provisioning refused: no verifiable payment proof for this order. ' +
                'Gateway capture or wallet ledger debit required — MongoDB status=confirmed is not enough.',
              proofReason: proof.reason,
              totalTime: Date.now() - startTime,
            };
          }
        }
      } else if (allowUnpaid && !orderHasConfirmedPayment(paymentCheckOrder)) {
        L.line('⚠️ allowUnpaid=true — provisioning complimentary / forced order without payment proof');
      }

      if (alreadyDelivered) {
        L.line('✅ Order already delivered with valid payment proof — skip re-provision');
      }
      // =====================================================================
      // STEP 1: ATOMIC DATABASE LOCK - Prevents duplicate provisioning
      // This is CRITICAL for serverless environments where in-memory locks don't work
      // We use MongoDB's findOneAndUpdate with conditions to atomically acquire a lock
      // =====================================================================
      L.head('STEP 1: ATOMIC DATABASE LOCK & DUPLICATE CHECK');

      // Generate a unique lock ID for this provisioning attempt
      const lockId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      L.kv('Lock ID', lockId);

      // Attempt to atomically acquire the provisioning lock
      // This will ONLY succeed if:
      // 1. provisioningStatus is NOT 'provisioning' or 'active'
      // 2. OR if 'provisioning' status is older than 5 minutes (stale lock)
      // 3. AND order exists
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const lockedOrder = await Order.findOneAndUpdate(
        {
          _id: orderId,
          $or: [
            // Order not yet provisioned or provisioning
            { provisioningStatus: { $nin: ['provisioning', 'active'] } },
            // OR stale provisioning lock (older than 5 minutes)
            {
              provisioningStatus: 'provisioning',
              lastProvisionAttempt: { $lt: fiveMinutesAgo }
            }
          ],
          // Extra safety: Don't provision if already has IP address
          ipAddress: { $in: [null, '', undefined] }
        },
        {
          $set: {
            provisioningStatus: 'provisioning',
            lastProvisionAttempt: new Date(),
            provisioningLockId: lockId,
            autoProvisioned: true
          }
        },
        {
          new: true,
          runValidators: false
        }
      );

      // If we couldn't acquire the lock, check why
      if (!lockedOrder) {
        const existingOrder = await Order.findById(orderId);

        if (!existingOrder) {
          throw new Error(`Order ${orderId} not found in database`);
        }

        // Check if already provisioned successfully
        if (existingOrder.provisioningStatus === 'active' && existingOrder.ipAddress) {
          L.line(`\n⚠️⚠️⚠️ ORDER ALREADY PROVISIONED ⚠️⚠️⚠️`);
          L.kv('  → IP Address', existingOrder.ipAddress);
          L.kv('  → Provider', existingOrder.provider);
          L.kv('  → Username', existingOrder.username);
          L.line(`⚠️⚠️⚠️ SKIPPING PROVISIONING ⚠️⚠️⚠️\n`);

          return {
            success: true,
            alreadyProvisioned: true,
            ipAddress: existingOrder.ipAddress,
            credentials: { username: existingOrder.username, password: existingOrder.password },
            message: 'Order was already provisioned successfully',
            totalTime: Date.now() - startTime
          };
        }

        // Check if currently being provisioned by another process
        if (existingOrder.provisioningStatus === 'provisioning') {
          const timeSinceAttempt = existingOrder.lastProvisionAttempt
            ? Date.now() - new Date(existingOrder.lastProvisionAttempt).getTime()
            : 0;

          L.line(`\n⏳⏳⏳ ORDER CURRENTLY BEING PROVISIONED BY ANOTHER PROCESS ⏳⏳⏳`);
          L.kv('  → Lock ID', existingOrder.provisioningLockId || 'unknown');
          L.kv('  → Time since attempt', `${Math.round(timeSinceAttempt / 1000)}s ago`);
          L.line(`⏳⏳⏳ ABORTING TO PREVENT DUPLICATE ⏳⏳⏳\n`);

          return {
            success: false,
            alreadyProvisioning: true,
            message: `Order is currently being provisioned by another process (lock: ${existingOrder.provisioningLockId})`,
            totalTime: Date.now() - startTime
          };
        }

        // Check if order already has an IP (somehow)
        if (existingOrder.ipAddress) {
          L.line(`\n⚠️⚠️⚠️ ORDER ALREADY HAS IP ADDRESS ⚠️⚠️⚠️`);
          L.kv('  → IP Address', existingOrder.ipAddress);
          L.line(`⚠️⚠️⚠️ SKIPPING PROVISIONING ⚠️⚠️⚠️\n`);

          return {
            success: true,
            alreadyProvisioned: true,
            ipAddress: existingOrder.ipAddress,
            message: 'Order already has an IP address assigned',
            totalTime: Date.now() - startTime
          };
        }

        throw new Error(`Failed to acquire provisioning lock for order ${orderId}. Current status: ${existingOrder.provisioningStatus}`);
      }

      // Lock acquired successfully!
      const order = lockedOrder;
      L.line(`\n🔒🔒🔒 PROVISIONING LOCK ACQUIRED 🔒🔒🔒`);
      L.kv('  → Lock ID', lockId);
      L.kv('  → Order ID', order._id.toString());

      L.kv('Order._id', order._id.toString());
      L.kv('Order.productName', order.productName);
      L.kv('Order.memory', order.memory);
      L.kv('Order.price', order.price);
      L.kv('Order.status', order.status);
      L.kv('Order.provisioningStatus', order.provisioningStatus || 'none');
      L.kv('Order.ipAddress', order.ipAddress || 'none');
      L.kv('Order.provider', order.provider || 'none');
      L.kv('Order.os', order.os || '(Default)');
      L.kv('Order.ipStockId', order.ipStockId || '(NOT SET)');

      L.line(`✅ Database lock acquired, proceeding with provisioning...`);

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

      const advps = this.isAdvpsStock(ipStock, order);
      const nexa = !advps && this.isNexaStock(ipStock, order);
      const netbay = !advps && !nexa && this.isNetbayStock(ipStock, order);
      const hostdzire = !advps && !netbay && this.isHostdzireStock(ipStock, order);
      const kurohost = !advps && !netbay && !hostdzire && this.isKurohostStock(ipStock, order);
      const rackato = !advps && !netbay && !hostdzire && !kurohost && await this.isRackatoStock(ipStock, order);
      const resellerPanel = !advps && !netbay && !hostdzire && !kurohost && !rackato && isResellerApiStock(ipStock, order);
      const smartVps = !advps && !netbay && !hostdzire && !kurohost && !rackato && !resellerPanel && this.isSmartVpsStock(ipStock, order);
      const providerName = advps ? 'ADVPS' : nexa ? 'Nexa' : netbay ? 'Netbay' : hostdzire ? 'HostDzire' : kurohost ? 'KuroHost' : rackato ? 'Rackato' : resellerPanel ? 'ResellerPanel' : smartVps ? 'SmartVPS' : 'Hostycare';
      L.line(`➡ Provider route selected: ${providerName}`);

      // Branch
      if (advps) {
        return await this.provisionViaAdvps(order, ipStock, startTime);
      } else if (nexa) {
        return await this.provisionViaNexa(order, ipStock, startTime);
      } else if (netbay) {
        return await this.provisionViaNetbay(order, ipStock, startTime);
      } else if (hostdzire) {
        return await this.provisionViaHostdzire(order, ipStock, startTime);
      } else if (kurohost) {
        return await this.provisionViaKurohost(order, ipStock, startTime);
      } else if (rackato) {
        return await this.provisionViaRackato(order, ipStock, startTime);
      } else if (resellerPanel) {
        return await this.provisionViaResellerApi(order, ipStock, startTime);
      } else if (smartVps) {
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

  // --- ADVPS PATH -----------------------------------------------------------

  async provisionViaAdvps(order, ipStock, startTime) {
    L.head(`ADVPS PATH — order ${order._id}`);

    const productNameLower = String(order.productName).toLowerCase();
    const isWindowsProduct =
      productNameLower.includes('windows') ||
      productNameLower.includes('rdp') ||
      productNameLower.includes('vps');

    L.kv('[ADVPS] isWindowsProduct', isWindowsProduct);

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      provider: 'advps'
    });

    // --- Resolve ADVPS config from IPStock ---
    const advpsConfig = ipStock?.defaultConfigurations?.get?.('advps') ||
      ipStock?.defaultConfigurations?.advps;

    if (!advpsConfig) {
      throw new Error('IPStock missing ADVPS configuration (defaultConfigurations.advps)');
    }

    const vmType = String(advpsConfig.vmType || '').toUpperCase();
    const isVps = vmType === 'VPS' || vmType === 'VM';
    const targetOS = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';
    L.kv('[ADVPS] vmType', vmType);
    L.kv('[ADVPS] isVps', isVps);
    L.kv('[ADVPS] targetOS', targetOS);

    await Order.findByIdAndUpdate(order._id, { os: targetOS });

    // --- Resolve ADVPS product ID ---
    // ADVPS products are NOT named with RAM (e.g. "Turbo VPS (103.109.XX.X)").
    // Each product ID supports multiple RAM sizes — the purchase API's `ram`
    // parameter selects the variation internally. So we just need ANY variant's
    // productId from the config, then pass the customer's requested RAM to the API.
    const variants = advpsConfig.variants instanceof Map
      ? Object.fromEntries(advpsConfig.variants)
      : (advpsConfig.variants || {});

    const ram = order.memory;
    const availableRams = Object.keys(variants);
    L.kv('[ADVPS] Order RAM', ram);
    L.kv('[ADVPS] Synced variant keys', availableRams);

    // Try exact RAM key match first, then fall back to ANY variant's productId
    let advpsProductId;
    const ramVariations = [
      ram, ram?.toLowerCase(), ram?.toUpperCase(),
      ram?.replace('GB', 'gb'), ram?.replace('gb', 'GB'),
    ].filter(Boolean);

    for (const v of ramVariations) {
      if (variants[v]?.productId) {
        advpsProductId = String(variants[v].productId);
        L.kv('[ADVPS] Exact RAM match', { ram: v, productId: advpsProductId });
        break;
      }
    }

    if (!advpsProductId) {
      // Use ANY variant's productId — ADVPS products have a single ID for all RAM sizes
      const anyVariant = Object.values(variants).find(v => v?.productId);
      if (anyVariant) {
        advpsProductId = String(anyVariant.productId);
        L.line(`[ADVPS] RAM "${ram}" not a synced key [${availableRams.join(', ')}] — using product ID from existing variant (same product handles all RAM sizes)`);
        L.kv('[ADVPS] Product ID (from variant)', advpsProductId);
        L.kv('[ADVPS] Product name', anyVariant.productName || '(unknown)');
      }
    }

    if (!advpsProductId) {
      throw new Error(
        `ADVPS config has no variants with a productId. ` +
        `IPStock: ${ipStock.name} (${ipStock._id}). ` +
        `Run /api/advps/sync to refresh product catalog.`
      );
    }

    // --- Resolve OS ID ---
    const osId = await this.resolveAdvpsOsId(targetOS, vmType);
    L.kv('[ADVPS] Resolved osId', osId || '(none — will let API pick default)');

    // --- Check if purchase was already made (idempotent re-entry from cron) ---
    const existingAdvpsOrderId = order.advpsOrderId;
    let advpsOrderId;
    let initialPassword = '';

    if (existingAdvpsOrderId) {
      L.line(`[ADVPS] Purchase already made — advpsOrderId=${existingAdvpsOrderId}, skipping purchase`);
      advpsOrderId = existingAdvpsOrderId;
      initialPassword = order.password || '';
    } else {
      // --- Place the purchase ---
      const ramFormatted = String(ram).replace(/(\d+)\s*gb/i, '$1 GB');
      const remark = `Auto-provisioned order ${order._id}`;
      let purchaseRes;

      if (isVps) {
        // ADVPS purchase email = OceanLinux account holder (buyer), never admin/Razorpay guest email.
        let customerName = 'Customer';
        let customerEmail = '';

        try {
          const User = require('@/models/userModel').default;
          const user = await User.findById(order.user).select('name email').lean();
          if (user?.email) {
            customerEmail = String(user.email).trim().toLowerCase();
            customerName = user.name || customerName;
          }
        } catch (e) {
          L.line(`[ADVPS] Could not load user for customer info: ${e.message}`);
        }

        if (!customerEmail) {
          customerEmail = String(order.customerEmail || order.webhookCustomerEmail || '').trim().toLowerCase();
          customerName = order.customerName || order.webhookCustomerName || customerName;
        }

        if (!customerEmail) {
          throw new Error('Cannot purchase ADVPS VPS: no customer email on user account or order');
        }

        L.line(`[ADVPS] Buyer account email for purchase: ${customerEmail}`);

        const emailCandidates = buildAdvpsPurchaseEmailCandidates(order._id, customerEmail);
        purchaseRes = null;
        let advpsPurchaseEmail = emailCandidates[0];

        for (let i = 0; i < emailCandidates.length; i += 1) {
          advpsPurchaseEmail = emailCandidates[i];
          L.line(
            `[ADVPS] Purchase email attempt ${i + 1}/${emailCandidates.length}: ${advpsPurchaseEmail}` +
              (advpsPurchaseEmail === customerEmail ? ' (user\'s real email)' : ` (retry — account ${customerEmail})`)
          );
          try {
            L.line(`[ADVPS] Purchasing VPS: productId=${advpsProductId}, ram=${ramFormatted}, osId=${osId}, name=${customerName}, email=${advpsPurchaseEmail}`);
            purchaseRes = await this.advpsApi.purchaseVps({
              productId: advpsProductId, ram: ramFormatted, osId,
              quantity: 1, name: customerName, email: advpsPurchaseEmail,
              validity: 30, remark,
            });
            break;
          } catch (purchaseErr) {
            const hasFallback = i < emailCandidates.length - 1;
            if (hasFallback && isAdvpsEmailPurchaseError(purchaseErr)) {
              L.line(`[ADVPS] Email rejected (${purchaseErr.message}) — trying fallback address`);
              continue;
            }
            throw purchaseErr;
          }
        }

        if (!purchaseRes) {
          throw new Error('ADVPS VPS purchase failed: no valid customer email accepted');
        }
      } else {
        L.line(`[ADVPS] Purchasing Linux: productId=${advpsProductId}, ram=${ramFormatted}, osId=${osId}`);
        purchaseRes = await this.advpsApi.purchaseLinux({
          productId: advpsProductId, ram: ramFormatted, osId,
          quantity: 1, validity: 30, remark,
        });
      }

      L.kv('[ADVPS] Purchase response status', purchaseRes?.status);
      const purchaseData = purchaseRes?.data || purchaseRes;
      const advpsOrder = purchaseData?.order;

      if (!advpsOrder || !advpsOrder.orderId) {
        throw new Error(`ADVPS purchase did not return an order ID. Response: ${JSON.stringify(purchaseRes).slice(0, 500)}`);
      }

      advpsOrderId = advpsOrder.orderId;
      initialPassword = purchaseData?.password || '';

      L.kv('[ADVPS] Purchase order ID', advpsOrderId);
      L.kv('[ADVPS] Purchase status', advpsOrder.status);
      L.kv('[ADVPS] Total amount', advpsOrder.totalAmount);
      if (initialPassword) {
        L.kv('[ADVPS] Initial password from purchase', initialPassword.substring(0, 4) + '****');
      }

      // Persist immediately so cron can resume without re-purchasing
      await Order.findByIdAndUpdate(order._id, {
        advpsOrderId,
        advpsProductId,
        provider: 'advps',
        autoProvisioned: true,
      });
    }

    // --- Quick poll: check order details 3 times (total ~65s) ---
    // If ADVPS hasn't assigned yet, mark as failed so the cron retries later.
    L.line(`[ADVPS] Checking order details for ${advpsOrderId}...`);

    // ADVPS assigns a TEMPORARY password while order is PENDING.
    // The REAL password only appears once order status is COMPLETED (~3-5 min).
    // So we poll until COMPLETED, not just until we see an IP.
    const pollDelays = [20000, 45000, 60000, 120000];
    let assignedService = null;
    let orderCompleted = false;

    for (let i = 0; i < pollDelays.length; i++) {
      await new Promise(resolve => setTimeout(resolve, pollDelays[i]));

      try {
        const detailsRes = await this.advpsApi.getOrderDetails(advpsOrderId);
        const orderDetails = detailsRes?.data || detailsRes;
        const orderStatus = orderDetails?.order?.status || '';
        const services = orderDetails?.services || [];

        L.line(`[ADVPS] Poll ${i + 1}/${pollDelays.length}: status=${orderStatus}, services=${services.length}`);

        if (orderStatus === 'FAILED' || orderStatus === 'CANCELLED' || orderStatus === 'REJECTED') {
          throw new Error(`ADVPS order ${advpsOrderId} reached terminal status: ${orderStatus}`);
        }

        if (services.length > 0 && services[0].ip) {
          assignedService = services[0];

          if (orderStatus === 'COMPLETED' || orderStatus === 'ASSIGNED') {
            orderCompleted = true;
            L.line(`[ADVPS] Order ${orderStatus} with IP: ${assignedService.ip} — password is final`);
            break;
          }

          L.line(`[ADVPS] Service has IP ${assignedService.ip} but order still ${orderStatus} — password may change, continuing polls...`);
        }
      } catch (pollErr) {
        if (pollErr.message.includes('terminal status')) throw pollErr;
        L.line(`[ADVPS] Poll ${i + 1} error: ${pollErr.message}`);
      }
    }

    // --- Extract credentials ---
    let ipAddress = '';
    let username = '';
    let password = '';
    let advpsServiceId = '';
    let expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (assignedService) {
      ipAddress = assignedService.ip || '';
      username = assignedService.username || (isWindowsProduct ? 'Administrator' : 'root');
      advpsServiceId = AdvpsAPI.extractServiceIdFromPurchaseService(assignedService);
      if (assignedService.expiryDate) expiryDate = new Date(assignedService.expiryDate);

      // Only trust the password if order reached COMPLETED/ASSIGNED
      if (orderCompleted) {
        password = assignedService.password || '';
      }

      L.kv('[ADVPS] Service ID', advpsServiceId);
      L.kv('[ADVPS] IP', ipAddress);
      L.kv('[ADVPS] Username', username);
      L.kv('[ADVPS] Password (masked)', password ? password.substring(0, 4) + '****' : '(not final yet)');
      L.kv('[ADVPS] Order completed', orderCompleted);

      // If assigned but no IP, try get-ip
      if (!ipAddress && advpsServiceId) {
        try {
          const ipRes = await this.advpsApi.getIp(advpsServiceId);
          ipAddress = ipRes?.data?.ip || '';
          if (ipAddress) L.kv('[ADVPS] IP from get-ip', ipAddress);
        } catch (e) {
          L.line(`[ADVPS] get-ip failed: ${e.message}`);
        }
      }
    }

    // --- Update order ---
    const fullyProvisioned = !!(ipAddress && advpsServiceId && password);
    const resolvedUsername = username || (isWindowsProduct ? 'Administrator' : 'root');
    const updateData = {
      status: fullyProvisioned ? 'active' : 'confirmed',
      provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
      provisioningError: fullyProvisioned ? '' : `ADVPS_PENDING: Order ${advpsOrderId} placed, awaiting ${!ipAddress ? 'IP' : !password ? 'final password (order not yet COMPLETED)' : 'assignment'}. Cron will check.`,
      provider: 'advps',
      advpsServiceId: advpsServiceId || undefined,
      advpsOrderId,
      advpsProductId,
      username: resolvedUsername,
      password,
      ipAddress: ipAddress || '',
      autoProvisioned: true,
      os: targetOS,
      expiryDate,
    };

    if (!fullyProvisioned) {
      updateData.provisioningLockId = undefined;
      updateData.lastProvisionAttempt = new Date();
    }

    if (fullyProvisioned && ipAddress) {
      await finalizeIpAssignmentForOrder(order, ipAddress, updateData);
    } else {
      await Order.findByIdAndUpdate(order._id, updateData);
    }

    const totalTime = Date.now() - startTime;
    console.log("\n" + "✅".repeat(80));
    console.log(`[ADVPS] ✅ PROVISIONING ${fullyProvisioned ? 'COMPLETED' : 'PENDING — cron will check'}`);
    console.log(`   - Order ID: ${order._id}`);
    console.log(`   - ADVPS Order: ${advpsOrderId}`);
    console.log(`   - ADVPS Service: ${advpsServiceId || 'pending'}`);
    console.log(`   - IP: ${ipAddress || 'pending'}`);
    console.log(`   - Username: ${resolvedUsername}`);
    console.log(`   - OS: ${targetOS}`);
    console.log(`   - Total Time: ${totalTime}ms`);
    console.log("✅".repeat(80));

    return {
      success: fullyProvisioned,
      advpsPending: !fullyProvisioned,
      serviceId: advpsServiceId || null,
      ipAddress: ipAddress || null,
      credentials: { username: resolvedUsername, password },
      hostname: null,
      productId: advpsProductId,
      totalTime,
      ...(fullyProvisioned ? {} : { error: `ADVPS order ${advpsOrderId} pending assignment, cron will check` }),
    };
  }

  // --- NETBAY PATH ---------------------------------------------------------
  //
  // Netbay (https://api.netbayhosts.in) is an external reseller API like
  // ADVPS / Hostheaven. Provisioning flow:
  //
  //   1. Resolve the company's Netbay credentials from the IPStock link
  //   2. Look up the planId from `defaultConfigurations.netbay.planByMemory`
  //      using the order's RAM size
  //   3. Decide which OS template to install (Linux vs Windows by product name)
  //   4. POST /services/purchase  →  returns serviceId + taskId (status PENDING)
  //   5. Poll /tasks/:taskId every ~4s until COMPLETED (or up to 3 min)
  //   6. On COMPLETED → fetch /services/:id to read IP / credentials
  //   7. Persist serviceId + IP + creds onto the order (or leave PENDING for the
  //      cron to retry if Netbay hasn't finished yet)
  //
  // Idempotency: if `order.netbayServiceId` is already set, we skip the
  // purchase step entirely and resume from the polling/details fetch.
  isNetbayProxyStock(ipStock) {
    const { isNetbayProxyStock } = require('@/lib/netbayGroupTags');
    return isNetbayProxyStock(ipStock);
  }

  /**
   * True when a Netbay purchase failed because of the company coupon.
   * A stale/expired coupon must not block sales, so callers retry without it.
   */
  isNetbayCouponError(err) {
    const text = `${err?.message || ''} ${JSON.stringify(err?.body || '')}`.toLowerCase();
    return text.includes('coupon') || text.includes('promo');
  }

  /**
   * Try configured coupon(s) on NetBay purchase (proxy + Linux + VPS).
   * If every coupon is rejected, abort — no silent full-price purchase.
   */
  async purchaseNetbayWithCoupons(api, {
    purchaseBody,
    cfg,
    memoryKey,
    productKind,
    purchaseFn,
    logTag = '[NETBAY]',
    orderId = null,
  }) {
    const attempts = resolveNetbayCouponAttempts(cfg, memoryKey, productKind);
    L.kv(`${logTag} coupon attempts`, { memoryKey, productKind, attempts });

    const persistCouponAudit = async (couponUsed, skipReason = '') => {
      if (!orderId) return;
      try {
        await Order.findByIdAndUpdate(orderId, {
          netbayCouponCode: couponUsed || '',
          ...(skipReason ? { netbayCouponSkipReason: skipReason } : {}),
        });
      } catch (err) {
        L.line(`${logTag} Failed to persist coupon audit: ${err.message}`);
      }
    };

    if (!attempts.length) {
      L.line(`${logTag} No NetBay coupon configured — purchase without couponCode`);
      const result = await purchaseFn(purchaseBody);
      await persistCouponAudit('', 'no_coupon_configured');
      return { result, couponUsed: null };
    }

    let lastErr = null;

    for (let i = 0; i < attempts.length; i += 1) {
      const couponCode = attempts[i];
      const body = { ...purchaseBody, couponCode };
      try {
        L.line(
          `${logTag} POST with couponCode="${couponCode}"` +
          ` (kind=${productKind || '-'}, key=${memoryKey || '-'})` +
          ` body=${JSON.stringify({ ...body, proxyPass: body.proxyPass ? '***' : undefined })}`
        );
        const result = await purchaseFn(body);
        if (i > 0) {
          L.line(`${logTag} Coupon "${couponCode}" accepted after earlier rejection`);
        }
        await persistCouponAudit(couponCode);
        return { result, couponUsed: couponCode };
      } catch (err) {
        lastErr = err;
        if (!this.isNetbayCouponError(err)) throw err;
        if (i < attempts.length - 1) {
          L.line(`${logTag} Coupon "${couponCode}" rejected — trying next (${err.message})`);
          continue;
        }
        L.line(`${logTag} All configured coupons rejected — aborting (no full-price fallback)`);
      }
    }

    const msg =
      `NetBay rejected coupon(s) [${attempts.join(', ')}] for ${productKind || 'purchase'}. ` +
      `Purchase aborted to avoid full-price charge. Last error: ${lastErr?.message || 'unknown'}`;
    await persistCouponAudit('', msg);
    throw new Error(msg);
  }

  async provisionViaNexa(order, ipStock, startTime) {
    L.head(`NEXA PATH — order ${order._id}`);
    const { getCompanyNexaApiConfig } = require('@/lib/companyNexaApi');
    const NexaApi = require('@/services/nexaApi');

    const company = ipStock?.company
      ? await Company.findById(ipStock.company).select('nexaApi name').lean()
      : null;
    const cfg = getCompanyNexaApiConfig(company);
    if (!cfg) {
      throw new Error(
        `Nexa API not configured for IPStock "${ipStock?.name}". ` +
        `Enable the Nexa API key on that company in /admin/companies.`
      );
    }

    const nexaCfg = ipStock?.defaultConfigurations?.get?.('nexa') || ipStock?.defaultConfigurations?.nexa || {};
    const planId = Number(nexaCfg.planId);
    const poolId = nexaCfg.poolId != null && nexaCfg.poolId !== '' ? Number(nexaCfg.poolId) : 0;
    const protocol = String(nexaCfg.protocol || 'SOCKS5');
    if (!planId) {
      throw new Error(`Nexa plan id is missing on IPStock "${ipStock?.name}". Add the product again from the Nexa company dialog.`);
    }

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      provider: 'nexa',
      netbayProductKind: '',
    });

    const api = new NexaApi(cfg);
    L.line(`[NEXA] POST action=order plan ${planId} pool ${poolId} protocol ${protocol}`);
    const result = await api.purchase({ planId, poolId, quantity: 1, protocol });
    const delivered = NexaApi.extractPurchaseDelivery(result);
    const nexaOrderId = delivered.orderId;
    const host = delivered.ip;
    const port = delivered.port;
    const username = delivered.username || order.username || '';
    const password = delivered.password || '';
    const displayIp = host ? (port && !host.includes(':') ? `${host}:${port}` : host) : '';

    let expiryDate = null;
    if (delivered.expiry) {
      const parsed = new Date(delivered.expiry);
      if (!Number.isNaN(parsed.getTime())) expiryDate = parsed;
    }
    if (!expiryDate) {
      const { calculateCompanyExpiryDate } = await import('@/lib/expiryHelper');
      expiryDate = calculateCompanyExpiryDate();
    }

    const fullyProvisioned = !!(displayIp && nexaOrderId);
    const updateData = {
      status: fullyProvisioned ? 'active' : 'confirmed',
      provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
      provisioningError: fullyProvisioned
        ? ''
        : 'PENDING: Nexa accepted the order but did not return an IP yet.',
      provider: 'nexa',
      nexaOrderId: nexaOrderId || undefined,
      netbayProductKind: '',
      username: username || undefined,
      password: password || order.password || '',
      ipAddress: displayIp,
      autoProvisioned: true,
      os: order.os || 'Ubuntu 22',
      expiryDate,
    };

    if (fullyProvisioned) {
      await finalizeIpAssignmentForOrder(order, displayIp, updateData);
    } else {
      await Order.findByIdAndUpdate(order._id, updateData);
    }

    L.line(`[NEXA] order ${nexaOrderId || '(none)'} ip ${displayIp || '(none)'}`);
    return {
      success: fullyProvisioned,
      ipAddress: displayIp || null,
      credentials: { username, password },
      totalTime: Date.now() - startTime,
      ...(fullyProvisioned ? {} : { error: updateData.provisioningError }),
    };
  }

  async provisionViaNetbayProxy(order, ipStock, startTime) {
    L.head(`NETBAY PROXY PATH — order ${order._id}`);

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      provider: 'netbay',
      netbayProductKind: 'proxy',
    });

    const cfg = await this.resolveNetbayConfigForStock(ipStock);
    if (!cfg) {
      throw new Error(
        `Netbay API not configured for IPStock "${ipStock?.name}". ` +
        `Link the stock to a company that has Netbay enabled in /admin/companies.`
      );
    }

    const stockCfg = this.readNetbayStockConfig(ipStock);
    const {
      resolveNetbayGroupTag,
      netbayProxyTemplateName,
      generateNetbayProxyUser,
      generateNetbayProxyPass,
    } = require('@/lib/netbayGroupTags');

    let netbayServiceId = order.netbayServiceId || '';
    let netbayTaskId = order.netbayTaskId || '';
    let planId = order.netbayPlanId || '';
    const groupTag = resolveNetbayGroupTag(ipStock, order.netbayGroupTag || order.memory);
    const osName = netbayProxyTemplateName(ipStock);
    const api = new NetbayApi(cfg);

    let previewHost = '';
    let previewPort = 3128;
    let previewUser = '';
    let previewPass = '';

    if (!netbayServiceId) {
      planId = this.resolveNetbayPlanId({
        planByMemory: stockCfg.planByMemory,
        ram: order.memory,
      });
      if (!planId) {
        throw new Error(
          `Netbay proxy planId not configured on IPStock "${ipStock.name}". ` +
          `Set planByMemory in /admin/manageIpStock under Netbay Configuration.`
        );
      }

      const companyDoc = await Company.findById(ipStock.company).select('netbayApi').lean();
      const useLiveStockApi = companyDoc?.netbayApi?.enabled && companyDoc?.netbayApi?.useLiveStockApi === true;

      if (useLiveStockApi) {
        const stockProbe = await api.isProxyStockAvailable({
          planId,
          os: osName,
          groupTag: groupTag || undefined,
        });
        if (stockProbe.available === false && !stockProbe.skipped) {
          throw new Error('No proxy capacity or IP available at this range right now. Please try another range.');
        }
        if (stockProbe.skipped || stockProbe.available === null) {
          const variant = stockCfg.variantStock?.[order.memory] || stockCfg.variantStock?.['4GB'];
          const lastSync = stockCfg.lastStockSync;
          const fresh = lastSync && Date.now() - new Date(lastSync).getTime() < 10 * 60 * 1000;
          if (!(fresh && variant?.available === true)) {
            throw new Error('Stock could not be verified right now. Please try again in a few minutes.');
          }
        }
      }

      const proxyUser = generateNetbayProxyUser();
      const proxyPass = generateNetbayProxyPass();
      const purchaseBody = {
        planId,
        os: osName,
        months: 1,
        proxyUser,
        proxyPass,
        proxyPort: 3128,
      };
      if (groupTag) purchaseBody.groupTag = groupTag;

      L.line(`[NETBAY-PROXY] POST /proxy/purchase ${JSON.stringify({ ...purchaseBody, proxyPass: '***' })}`);
      const { result: purchaseRes, couponUsed: netbayCouponCode } = await this.purchaseNetbayWithCoupons(api, {
        purchaseBody,
        cfg,
        memoryKey: groupTag || order.memory,
        productKind: 'proxy',
        purchaseFn: (body) => api.purchaseProxy(body),
        logTag: '[NETBAY-PROXY]',
        orderId: order._id,
      });

      const creds = NetbayApi.extractProxyCredentials(purchaseRes);
      netbayServiceId = creds.proxyId || purchaseRes?.data?.proxyId || '';
      netbayTaskId = purchaseRes?.data?.taskId || '';
      previewHost = creds.host;
      previewPort = creds.port || 3128;
      previewUser = creds.user || proxyUser;
      previewPass = creds.pass || proxyPass;

      if (!netbayServiceId) {
        throw new Error(`Netbay proxy purchase did not return a proxyId. Response: ${JSON.stringify(purchaseRes).slice(0, 400)}`);
      }

      await Order.findByIdAndUpdate(order._id, {
        netbayServiceId,
        netbayTaskId,
        netbayPlanId: planId,
        netbayGroupTag: groupTag || undefined,
        netbayProductKind: 'proxy',
        netbayCouponCode: netbayCouponCode || '',
        provider: 'netbay',
        autoProvisioned: true,
        username: previewUser || undefined,
        password: previewPass || undefined,
        ipAddress: previewHost ? `${previewHost}:${previewPort}` : '',
      });
    } else {
      L.line(`[NETBAY-PROXY] Resuming — proxyId=${netbayServiceId}, taskId=${netbayTaskId}`);
    }

    if (netbayTaskId) {
      L.line(`[NETBAY-PROXY] Polling proxy task ${netbayTaskId}...`);
      let taskTerminal = null;
      try {
        taskTerminal = await api.waitForProxyTask(netbayTaskId, {
          maxWaitMs: 180_000,
          pollIntervalMs: 4_000,
        });
      } catch (err) {
        L.line(`[NETBAY-PROXY] Task poll failed: ${err.message}`);
      }
      if (taskTerminal?.status === 'FAILED') {
        const errMsg = taskTerminal?.error || taskTerminal?.message || 'Netbay proxy task FAILED';
        await Order.findByIdAndUpdate(order._id, {
          provisioningStatus: 'failed',
          provisioningError: `Provisioning failed: ${errMsg}`,
        });
        throw new Error(`Provisioning failed: ${errMsg}`);
      }
    }

    let host = previewHost;
    let port = previewPort;
    let username = previewUser || order.username || '';
    let password = previewPass || order.password || '';
    let expiryDate = null;

    try {
      const detailRes = await api.getProxy(netbayServiceId);
      const creds = NetbayApi.extractProxyCredentials(detailRes);
      if (creds.host) host = creds.host;
      if (creds.port) port = creds.port;
      if (creds.user) username = creds.user;
      if (creds.pass) password = creds.pass;
      const proxyObj = detailRes?.data?.proxy || detailRes?.data || {};
      if (proxyObj.expiryDate || proxyObj.expiresAt) {
        expiryDate = pickNetbayExpiryDate(proxyObj);
      }
    } catch (err) {
      L.line(`[NETBAY-PROXY] getProxy failed: ${err.message}`);
    }

    if (!expiryDate) {
      const { calculateCompanyExpiryDate } = await import('@/lib/expiryHelper');
      expiryDate = calculateCompanyExpiryDate();
    }

    const displayIpAddress = host ? `${host}:${port || 3128}` : (order.ipAddress || '');
    const fullyProvisioned = !!(displayIpAddress && username && password && netbayServiceId);

    const updateData = {
      status: fullyProvisioned ? 'active' : 'confirmed',
      provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
      provisioningError: fullyProvisioned
        ? ''
        : 'PENDING: proxy placed, awaiting credentials. Will retry automatically.',
      provider: 'netbay',
      netbayProductKind: 'proxy',
      netbayServiceId,
      netbayTaskId: netbayTaskId || undefined,
      netbayPlanId: planId || undefined,
      netbayGroupTag: groupTag || undefined,
      username,
      password: password || order.password || '',
      ipAddress: displayIpAddress || '',
      autoProvisioned: true,
      os: 'Ubuntu 22',
      expiryDate,
    };
    if (!fullyProvisioned) {
      updateData.provisioningLockId = undefined;
      updateData.lastProvisionAttempt = new Date();
    }
    if (fullyProvisioned && displayIpAddress) {
      await finalizeIpAssignmentForOrder(order, displayIpAddress, updateData);
    } else {
      await Order.findByIdAndUpdate(order._id, updateData);
    }

    return {
      success: fullyProvisioned,
      netbayPending: !fullyProvisioned,
      serviceId: netbayServiceId,
      ipAddress: displayIpAddress || null,
      credentials: { username, password },
      productId: planId || null,
      totalTime: Date.now() - startTime,
      ...(fullyProvisioned ? {} : { error: `Netbay proxy ${netbayServiceId} pending credentials` }),
    };
  }

  async provisionViaNetbay(order, ipStock, startTime) {
    if (this.isNetbayProxyStock(ipStock) || order.netbayProductKind === 'proxy') {
      return this.provisionViaNetbayProxy(order, ipStock, startTime);
    }

    L.head(`NETBAY PATH — order ${order._id}`);

    const isWindowsProduct = this.isWindowsOrder(order, ipStock);
    L.kv('[NETBAY] isWindowsProduct', isWindowsProduct);

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      provider: 'netbay',
    });

    // 1) Resolve company-level Netbay credentials (per /admin/companies)
    const cfg = await this.resolveNetbayConfigForStock(ipStock);
    if (!cfg) {
      throw new Error(
        `Netbay API not configured for IPStock "${ipStock?.name}". ` +
        `Link the stock to a company that has Netbay enabled in /admin/companies.`
      );
    }
    L.kv('[NETBAY] Using company', cfg.companyName);

    // 2) Resolve per-stock plan + groupTag from IPStock.defaultConfigurations.netbay
    const stockCfg = this.readNetbayStockConfig(ipStock);
    L.kv('[NETBAY] Stock config', stockCfg);

    let netbayServiceId = order.netbayServiceId || '';
    let netbayTaskId = order.netbayTaskId || '';
    let planId = order.netbayPlanId || '';
    const { resolveNetbayGroupTag } = require('@/lib/netbayGroupTags');
    let groupTag = resolveNetbayGroupTag(ipStock, order.netbayGroupTag);

    // Map OS into the order's enum values for downstream UI
    const orderOs = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';

    const api = new NetbayApi(cfg);

    // 3) Resolve OS template name from Netbay catalog (exact template name required)
    let osName = '';
    try {
      const osRes = await api.listOs({});
      const osList = osRes?.data?.os || [];
      osName = NetbayApi.resolveOsTemplateName(osList, {
        preferred: this.netbayOsHints({
          defaultOs: stockCfg.defaultOs,
          isWindows: isWindowsProduct,
          orderOs: order.os || orderOs,
        }),
        isWindows: isWindowsProduct,
      });
      L.kv('[NETBAY] Resolved OS from catalog', osName);
    } catch (osErr) {
      L.line('[NETBAY] OS catalog fetch failed:', osErr.message);
    }

    if (!osName) {
      throw new Error(
        `No matching Netbay OS template for ${isWindowsProduct ? 'Windows' : 'Linux'}. ` +
        `Open the company Netbay catalog, copy an OS template Name, and set Default OS on the IP Stock — ` +
        `or ensure Linux/Windows templates exist on Netbay.`
      );
    }

    // 4) Purchase (skip if we already have a serviceId from a previous attempt)
    if (!netbayServiceId) {
      planId = this.resolveNetbayPlanId({
        planByMemory: stockCfg.planByMemory,
        ram: order.memory,
      });
      if (!planId) {
        throw new Error(
          `Netbay planId not configured for memory "${order.memory}" on IPStock "${ipStock.name}". ` +
          `Set it in /admin/manageIpStock under "Netbay Configuration".`
        );
      }
      L.kv('[NETBAY] Resolved planId', planId);

      const companyDoc = await Company.findById(ipStock.company).select('netbayApi').lean();
      const useLiveStockApi = companyDoc?.netbayApi?.enabled && companyDoc?.netbayApi?.useLiveStockApi === true;

      if (useLiveStockApi) {
        const variant = stockCfg.variantStock?.[order.memory];
        const lastSync = stockCfg.lastStockSync;
        const fresh =
          lastSync && Date.now() - new Date(lastSync).getTime() < 10 * 60 * 1000;

        if (fresh && variant?.available === true) {
          L.line('[NETBAY] Stock OK from recent sync cache (skipping live stock GET)');
        } else {
          const stockProbe = await api.isServiceStockAvailable({
            planId,
            os: osName,
            groupTag: groupTag || undefined,
          });
          if (stockProbe.available === false && !stockProbe.skipped) {
            throw new Error(
              `No VM capacity available at this location right now. Please try another plan or check back later.`,
            );
          }
          if (stockProbe.skipped || stockProbe.available === null) {
            if (fresh && variant?.available === true) {
              L.line('[NETBAY] Stock rate-limited — trusting fresh checkout cache');
            } else {
              throw new Error(
                'Stock could not be verified right now. Please try again in a few minutes.'
              );
            }
          }
          L.kv('[NETBAY] Stock check OK', { planId, os: osName, groupTag: groupTag || '(any)' });
        }
      } else {
        L.line('[NETBAY] Manual stock mode — skipping live stock API check');
      }

      const purchaseBody = {
        planId,
        os: osName,
        months: 1,
      };
      if (groupTag) purchaseBody.groupTag = groupTag;

      L.line(`[NETBAY] POST /services/purchase ${JSON.stringify(purchaseBody)}`);
      let purchaseRes;
      let netbayCouponCode = null;
      try {
        const purchaseOutcome = await this.purchaseNetbayWithCoupons(api, {
          purchaseBody,
          cfg,
          memoryKey: order.memory,
          productKind: require('@/lib/netbayGroupTags').resolveNetbayCouponProductKind(ipStock, order),
          purchaseFn: (body) => api.purchaseService(body),
          logTag: '[NETBAY]',
          orderId: order._id,
        });
        purchaseRes = purchaseOutcome.result;
        netbayCouponCode = purchaseOutcome.couponUsed;
      } catch (err) {
        throw new Error(`Purchase failed: ${err.message}`);
      }
      const data = purchaseRes?.data || {};
      netbayServiceId = NetbayApi.extractServiceId(data) || data?.serviceId || '';
      netbayTaskId = data?.taskId || '';

      if (!netbayServiceId) {
        throw new Error(`Netbay purchase did not return a serviceId. Response: ${JSON.stringify(purchaseRes).slice(0, 400)}`);
      }
      L.kv('[NETBAY] serviceId', netbayServiceId);
      L.kv('[NETBAY] taskId', netbayTaskId);

      // Persist immediately so retries / cron skip the purchase step
      await Order.findByIdAndUpdate(order._id, {
        netbayServiceId,
        netbayTaskId,
        netbayPlanId: planId,
        netbayGroupTag: groupTag || undefined,
        netbayCouponCode: netbayCouponCode || '',
        provider: 'netbay',
        autoProvisioned: true,
      });
    } else {
      L.line(`[NETBAY] Resuming — serviceId=${netbayServiceId}, taskId=${netbayTaskId}, planId=${planId}`);
    }

    // 5) Wait for the purchase task (or skip if there is no task — some
    //    providers only return a serviceId)
    let taskTerminal = null;
    if (netbayTaskId) {
      L.line(`[NETBAY] Polling task ${netbayTaskId}...`);
      try {
        taskTerminal = await api.waitForTask(netbayTaskId, {
          maxWaitMs: 180_000,  // 3 min
          pollIntervalMs: 4_000,
        });
        L.kv('[NETBAY] Task terminal status', taskTerminal?.status || '(unknown)');
      } catch (err) {
        L.line(`[NETBAY] Task poll failed: ${err.message} — will continue and try fetching service`);
      }
      if (taskTerminal?.status === 'FAILED') {
        // Netbay refunds automatically per their docs; surface the error so
        // the customer (and admin) can see it on the order page.
        const errMsg = taskTerminal?.error || taskTerminal?.message || 'Netbay task FAILED';
        await Order.findByIdAndUpdate(order._id, {
          provisioningStatus: 'failed',
          provisioningError: `Provisioning failed: ${errMsg}`,
        });
        throw new Error(`Provisioning failed: ${errMsg}`);
      }
    }

    // 6) Fetch service details to extract IP + credentials
    let ipAddress = '';
    let username = isWindowsProduct ? 'Administrator' : 'root';
    let password = '';
    let expiryDate = null;
    try {
      const detailRes = await api.getService(netbayServiceId);
      const svc = NetbayApi.unwrapServiceResponse(detailRes);
      ipAddress = NetbayApi.extractServiceIp(svc) || '';
      if (svc.username) username = svc.username;
      if (svc.password) password = svc.password;
      if (svc.expiresAt || svc.expiryDate) {
        expiryDate = pickNetbayExpiryDate(svc);
      }
      L.kv('[NETBAY] Service IP', ipAddress || '(pending)');
      L.kv('[NETBAY] Username', username);
      L.kv('[NETBAY] Password', password ? `${password.slice(0, 4)}****` : '(pending)');
    } catch (err) {
      L.line(`[NETBAY] getService failed: ${err.message} — leaving IP/creds blank for cron retry`);
    }

    if (!expiryDate) {
      const { calculateCompanyExpiryDate } = await import('@/lib/expiryHelper');
      expiryDate = calculateCompanyExpiryDate();
    }

    const { formatIpAddress } = await import('../lib/ipAddressHelper.js');
    const displayIpAddress = ipAddress
      ? formatIpAddress(ipAddress, 'netbay', orderOs)
      : '';

    // 7) Update order. We treat "service id assigned" as the provisioning
    //    bar — IP/credentials sometimes lag behind by a poll cycle, in which
    //    case the cron will fetch them on the next pass.
    const fullyProvisioned = !!(displayIpAddress && netbayServiceId);
    const updateData = {
      status: fullyProvisioned ? 'active' : 'confirmed',
      provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
      provisioningError: fullyProvisioned ? '' : `PENDING: service placed, awaiting ${!displayIpAddress ? 'IP assignment' : 'credentials'}. Will retry automatically.`,
      provider: 'netbay',
      netbayServiceId,
      netbayTaskId: netbayTaskId || undefined,
      netbayPlanId: planId || undefined,
      netbayGroupTag: groupTag || undefined,
      username,
      password: password || order.password || '',
      ipAddress: displayIpAddress || '',
      autoProvisioned: true,
      os: orderOs,
      expiryDate,
    };
    if (!fullyProvisioned) {
      updateData.provisioningLockId = undefined;
      updateData.lastProvisionAttempt = new Date();
    }
    if (fullyProvisioned && displayIpAddress) {
      await finalizeIpAssignmentForOrder(order, displayIpAddress, updateData);
    } else {
      await Order.findByIdAndUpdate(order._id, updateData);
    }

    const totalTime = Date.now() - startTime;
    console.log("\n" + "✅".repeat(80));
    console.log(`[NETBAY] ✅ PROVISIONING ${fullyProvisioned ? 'COMPLETED' : 'PENDING — cron will check'}`);
    console.log(`   - Order ID: ${order._id}`);
    console.log(`   - Netbay Service: ${netbayServiceId}`);
    console.log(`   - Netbay Task: ${netbayTaskId || 'n/a'}`);
    console.log(`   - IP: ${displayIpAddress || 'pending'}`);
    console.log(`   - Username: ${username}`);
    console.log(`   - OS: ${orderOs}`);
    console.log(`   - Total Time: ${totalTime}ms`);
    console.log("✅".repeat(80));

    return {
      success: fullyProvisioned,
      netbayPending: !fullyProvisioned,
      serviceId: netbayServiceId,
      ipAddress: displayIpAddress || null,
      credentials: { username, password },
      productId: planId || null,
      totalTime,
      ...(fullyProvisioned ? {} : { error: `Netbay service ${netbayServiceId} pending IP/credentials` }),
    };
  }

  // --- RACKATO PATH ----------------------------------------------------------
  async provisionViaRackato(order, ipStock, startTime) {
    L.head(`RACKATO PATH — order ${order._id}`);
    const isWindows = this.isWindowsOrder(order, ipStock);
    const orderOs = isWindows ? 'Windows 2022' : 'Ubuntu 22';
    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      provider: 'rackato',
      os: order.os || orderOs,
    });

    const company = await Company.findById(ipStock.company).select('rackatoApi name').lean();
    const cfg = getCompanyRackatoApiConfig(company);
    if (!cfg) {
      throw new Error('Rackato API keys are missing. Open /admin/companies → Rackato and save the key id and secret.');
    }

    const plan = resolveRackatoPlan(ipStock, order.memory || order.ram || '');
    if (!plan.productId || !plan.appId) {
      throw new Error(
        `Rackato product_id and app_id are missing for "${ipStock.name}" (${order.memory || 'no RAM'}). ` +
        'Set defaultConfigurations.rackato on this IP stock.'
      );
    }

    const api = new RackatoApi(cfg);
    let rackatoOrderId = String(order.rackatoOrderId || '').trim();
    const password = order.password || generateSecurePassword(12);
    if (!rackatoOrderId) {
      const reference = order.clientTxnId || String(order._id);
      const created = await api.createOrder({
        app_id: Number(plan.appId),
        product_id: Number(plan.productId),
        instance_label: `ol-${String(reference).replace(/[^a-z0-9]/gi, '').slice(-12).toLowerCase() || 'order'}`,
        customer_reference_id: reference,
        backup_enabled: plan.backupEnabled,
        disk_size: plan.diskSize,
        instance_count: 1,
        app_config: isWindows
          ? { admin_pass: password }
          : { ssh_root_pass: password, ssh_user: 'rackato' },
      });
      const placed = parseRackatoOrder(created);
      rackatoOrderId = placed.orderId;
      if (!rackatoOrderId) {
        throw new Error('Rackato accepted the request but did not return an order id');
      }
      await Order.findByIdAndUpdate(order._id, {
        rackatoOrderId,
        rackatoProductId: String(plan.productId),
        rackatoAppId: String(plan.appId),
        password,
        username: isWindows ? 'Administrator' : 'rackato',
      });
    }

    let parsed = parseRackatoOrder(null);
    for (let attempt = 1; attempt <= 8; attempt++) {
      const details = await api.getOrder(rackatoOrderId);
      parsed = parseRackatoOrder(details);
      if (parsed.ip && parsed.uid) break;
      if (/fail|cancel|error/i.test(parsed.status || '')) {
        throw new Error(`Rackato order ${rackatoOrderId} is ${parsed.status}`);
      }
      if (attempt < 8) await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    const username = parsed.username || (isWindows ? 'Administrator' : 'rackato');
    const loginPassword = parsed.password || password;
    const updateData = {
      status: parsed.ip ? 'active' : 'confirmed',
      provisioningStatus: parsed.ip ? 'active' : 'provisioning',
      provider: 'rackato',
      username,
      password: loginPassword,
      os: parsed.os || order.os || orderOs,
      rackatoOrderId,
      rackatoNodeUid: parsed.uid || order.rackatoNodeUid || '',
      rackatoProductId: String(plan.productId),
      rackatoAppId: String(plan.appId),
      autoProvisioned: true,
      provisioningError: parsed.ip ? '' : `Rackato order ${rackatoOrderId} is still building. Sync again in a minute.`,
      expiryDate: parseRackatoExpiry(parsed.expiresAt) || order.expiryDate,
    };

    if (parsed.ip) {
      await finalizeIpAssignmentForOrder(order, parsed.ip, updateData);
    } else {
      await Order.findByIdAndUpdate(order._id, updateData);
    }

    return {
      success: true,
      pending: !parsed.ip,
      ipAddress: parsed.ip || '',
      credentials: { username, password: loginPassword },
      orderId: rackatoOrderId,
      totalTime: Date.now() - startTime,
    };
  }

  // --- HOSTDZIRE PATH --------------------------------------------------------
  async provisionViaHostdzire(order, ipStock, startTime) {
    L.head(`HOSTDZIRE PATH — order ${order._id}`);

    const isWindowsProduct = this.isWindowsOrder(order, ipStock);
    const orderOs = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      provider: 'hostdzire',
      os: order.os || orderOs,
    });

    const cfg = await this.resolveHostdzireConfigForStock(ipStock);
    if (!cfg) {
      throw new Error(
        'HostDzire API is not configured for this company. Enable it under /admin/companies → HostDzire.'
      );
    }
    L.kv('[HOSTDZIRE] Using company', cfg.companyName);

    const stockCfg = readHostdzireStockConfig(ipStock);
    L.kv('[HOSTDZIRE] Stock config', stockCfg);

    const ram = order.memory || order.ram || '';
    const inventorySlot = resolveHostdzireInventoryForMemory(stockCfg, ram);
    const inventoryKey = order.hostdzireInventoryKey || inventorySlot?.inventoryKey;
    if (!inventoryKey) {
      throw new Error(
        `HostDzire inventory_key missing for RAM "${ram}" on IPStock "${ipStock.name}". ` +
        'Open /admin/manageIpStock → HostDzire Configuration → map each RAM tier (4GB, 8GB) to an inventory row.'
      );
    }
    L.kv('[HOSTDZIRE] Resolved inventory', { memory: ram, inventoryKey, ip: inventorySlot?.ip || stockCfg.ip });

    const placeOrderOs = resolveHostdzirePlaceOrderOs(stockCfg, {
      isWindows: isWindowsProduct,
      orderOs: order.os || orderOs,
    });
    L.kv('[HOSTDZIRE] place_order OS', placeOrderOs);

    const api = new HostdzireApi(cfg);
    let hostdzireOrderId = order.hostdzireOrderId || '';

    if (!hostdzireOrderId) {
      L.line(`[HOSTDZIRE] place_order inventory_key=${inventoryKey} os=${placeOrderOs}`);
      const placeRes = await api.placeOrder({
        inventoryKey,
        os: placeOrderOs,
        quantity: 1,
        coupon: cfg.couponCode || undefined,
      });

      hostdzireOrderId = String(placeRes?.order_id || placeRes?.orderId || '').trim();
      if (!hostdzireOrderId) {
        throw new Error(
          `HostDzire place_order did not return order_id. Response: ${JSON.stringify(placeRes).slice(0, 400)}`
        );
      }

      await Order.findByIdAndUpdate(order._id, {
        hostdzireOrderId,
        hostdzireInventoryKey: inventoryKey,
        provider: 'hostdzire',
        autoProvisioned: true,
      });
      L.kv('[HOSTDZIRE] order_id', hostdzireOrderId);
    } else {
      L.line(`[HOSTDZIRE] Resuming — order_id=${hostdzireOrderId}, inventory_key=${inventoryKey}`);
    }

    const expectedIpHint = inventorySlot?.ip || stockCfg.ip || '';
    const isFullIpv4 = (ip) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(ip || '').trim());
    let ipAddress = isFullIpv4(order.ipAddress) ? order.ipAddress : '';
    let username = isWindowsProduct ? 'Administrator' : 'root';
    let password = order.password || '';
    let hostname = '';
    let resolvedOs = order.os || orderOs;

    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline && (!ipAddress || !password)) {
      if (isFullIpv4(expectedIpHint) && !ipAddress) {
        try {
          const detailsRes = await api.getDetails(expectedIpHint);
          const ipv4 = HostdzireApi.extractIpv4(detailsRes);
          const creds = HostdzireApi.extractCredentials(detailsRes);
          if (ipv4) ipAddress = ipv4;
          if (creds.username) username = creds.username;
          if (creds.password) password = creds.password;
          if (creds.hostname) hostname = creds.hostname;
          if (creds.os) resolvedOs = creds.os;
        } catch (detailErr) {
          L.line(`[HOSTDZIRE] details(${expectedIpHint}): ${detailErr.message}`);
        }
      }

      if (!ipAddress) {
        try {
          const ordersRes = await api.getOrders();
          const orders = Array.isArray(ordersRes?.orders) ? ordersRes.orders : [];
          const match = orders.find((o) => String(o.id) === String(hostdzireOrderId));
          const candidateIp = String(match?.ip || match?.dedicatedip || match?.ipv4 || '').trim();
          if (isFullIpv4(candidateIp)) {
            const detailsRes = await api.getDetails(candidateIp);
            ipAddress = HostdzireApi.extractIpv4(detailsRes) || candidateIp;
            const creds = HostdzireApi.extractCredentials(detailsRes);
            if (creds.username) username = creds.username;
            if (creds.password) password = creds.password;
            if (creds.hostname) hostname = creds.hostname;
            if (creds.os) resolvedOs = creds.os;
          }
        } catch (ordersErr) {
          L.line(`[HOSTDZIRE] orders poll: ${ordersErr.message}`);
        }
      }

      if (ipAddress && password) break;
      await new Promise((r) => setTimeout(r, 5000));
    }

    const fullyProvisioned = !!(ipAddress && password);
    const updateData = {
      status: fullyProvisioned ? 'active' : 'confirmed',
      provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
      provisioningError: fullyProvisioned
        ? ''
        : `PENDING: HostDzire order ${hostdzireOrderId} placed, awaiting IP/credentials. Will retry automatically.`,
      provider: 'hostdzire',
      hostdzireOrderId,
      hostdzireInventoryKey: inventoryKey,
      username,
      password: password || order.password || '',
      os: resolvedOs,
      autoProvisioned: true,
      lastSyncTime: new Date(),
    };
    if (hostname) updateData.hostname = hostname;

    if (fullyProvisioned && ipAddress) {
      try {
        const panelExpiry = await fetchHostdzireExpiry(api, ipAddress, hostdzireOrderId);
        if (panelExpiry) {
          updateData.expiryDate = panelExpiry;
          L.kv('[HOSTDZIRE] expiry from panel', panelExpiry.toISOString());
        } else {
          const { calculateCompanyExpiryDate } = await import('@/lib/expiryHelper');
          updateData.expiryDate = calculateCompanyExpiryDate();
        }
      } catch (expiryErr) {
        L.line(`[HOSTDZIRE] expiry fetch failed: ${expiryErr.message}`);
        const { calculateCompanyExpiryDate } = await import('@/lib/expiryHelper');
        updateData.expiryDate = calculateCompanyExpiryDate();
      }
      await finalizeIpAssignmentForOrder(order, ipAddress, updateData);
    } else {
      await Order.findByIdAndUpdate(order._id, updateData);
    }

    const totalTime = Date.now() - startTime;
    console.log(`[HOSTDZIRE] ✅ PROVISIONING ${fullyProvisioned ? 'COMPLETED' : 'PENDING — cron will check'}`);
    console.log(`   - Order ID: ${order._id}`);
    console.log(`   - HostDzire order_id: ${hostdzireOrderId}`);
    console.log(`   - IP: ${ipAddress || 'pending'}`);

    return {
      success: fullyProvisioned,
      hostdzirePending: !fullyProvisioned,
      orderId: hostdzireOrderId,
      ipAddress: ipAddress || null,
      credentials: { username, password },
      totalTime,
      ...(fullyProvisioned ? {} : { error: `HostDzire order ${hostdzireOrderId} pending IP/credentials` }),
    };
  }

  // --- KUROHOST PATH ---------------------------------------------------------
  async provisionViaKurohost(order, ipStock, startTime) {
    L.head(`KUROHOST PATH — order ${order._id}`);

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      provider: 'kurohost',
    });

    const cfg = await this.resolveKurohostConfigForStock(ipStock);
    if (!cfg) {
      throw new Error('KuroHost API is not configured for this company. Enable it under /admin/companies.');
    }

    const api = new KurohostApi(cfg);
    L.kv('[KUROHOST] Using company', cfg.companyName);

    const stockCfg = readKurohostStockConfig(ipStock);
    L.kv('[KUROHOST] Stock config', stockCfg);

    const ram = order.memory || order.ram || order.planMemory || '';
    const isWindowsProduct = this.isWindowsOrder(order, ipStock);

    let kurohostInstanceId = order.kurohostInstanceId || '';
    let kurohostJobId = order.kurohostJobId || '';
    let cloudZoneId = order.kurohostZoneId || stockCfg.cloudZoneId || '';
    let cloudFlavorId = order.kurohostFlavorId || '';

    if (!cloudZoneId) {
      throw new Error('KuroHost cloudZoneId is missing. Set it in /admin/manageIpStock under KuroHost Configuration.');
    }

    if (!kurohostInstanceId) {
      cloudFlavorId = cloudFlavorId || resolveKurohostFlavorId(stockCfg, ram);
      if (!cloudFlavorId) {
        throw new Error(`No KuroHost flavor mapped for RAM "${ram}". Configure flavorByMemory in manageIpStock.`);
      }

      let osTemplateId = resolveKurohostOsTemplateId(stockCfg, {
        memory: ram,
        isWindows: isWindowsProduct,
      });

      if (!osTemplateId) {
        const osRes = await api.listOsTemplates({ cloudZoneId });
        const templates = osRes?.items || [];
        osTemplateId = KurohostApi.resolveOsTemplateId(templates, {
          preferredName: isWindowsProduct ? 'Windows' : 'Ubuntu',
          isWindows: isWindowsProduct,
        });
      }

      if (!osTemplateId) {
        throw new Error('Could not resolve a KuroHost OS template. Set defaultOs or osTemplateByMemory in manageIpStock.');
      }

      L.kv('[KUROHOST] create payload', { cloudZoneId, flavorId: cloudFlavorId, osTemplateId });

      const rootPassword = order.password || generateSecurePassword();
      const createRes = await api.createInstance({
        cloudZoneId,
        flavorId: cloudFlavorId,
        osTemplateId,
        name: `ol-${String(order._id).slice(-8)}`,
        password: rootPassword,
      });

      const instance = KurohostApi.unwrapInstance(createRes);
      kurohostInstanceId = instance?.id || createRes?.instance?.id || '';
      kurohostJobId = createRes?.job?.id || instance?.jobId || '';

      if (!kurohostInstanceId) {
        throw new Error(`KuroHost create did not return an instance id. Response: ${JSON.stringify(createRes).slice(0, 400)}`);
      }

      await Order.findByIdAndUpdate(order._id, {
        kurohostInstanceId,
        kurohostJobId: kurohostJobId || undefined,
        kurohostZoneId: cloudZoneId,
        kurohostFlavorId: cloudFlavorId,
        provider: 'kurohost',
        autoProvisioned: true,
        password: rootPassword,
      });
    } else {
      L.line(`[KUROHOST] Resuming — instanceId=${kurohostInstanceId}, jobId=${kurohostJobId || 'n/a'}`);
    }

    if (kurohostJobId) {
      L.line(`[KUROHOST] Polling job ${kurohostJobId}...`);
      try {
        await api.waitForJob(kurohostJobId, {
          maxWaitMs: 300_000,
          pollIntervalMs: 5_000,
        });
      } catch (jobErr) {
        L.line(`[KUROHOST] Job poll warning: ${jobErr.message}`);
      }
    }

    let ipAddress = '';
    let username = isWindowsProduct ? 'Administrator' : 'root';
    let password = order.password || '';

    try {
      const detailRes = await api.getInstance(kurohostInstanceId);
      const inst = KurohostApi.unwrapInstance(detailRes);
      ipAddress = KurohostApi.extractInstanceIp(inst) || '';
      const creds = KurohostApi.extractCredentials(inst);
      if (creds.username) username = creds.username;
      // KuroHost GET /instances never returns plaintext password (only rootPasswordEnc).
      // We keep the password we sent at create/reinstall time.
      if (!password && creds.password) password = creds.password;
    } catch (detailErr) {
      L.line(`[KUROHOST] getInstance failed: ${detailErr.message}`);
    }

    const fullyProvisioned = !!(ipAddress && kurohostInstanceId);
    const updateData = {
      status: fullyProvisioned ? 'active' : 'confirmed',
      provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
      provisioningError: fullyProvisioned ? '' : `PENDING: instance created, awaiting ${!ipAddress ? 'IP assignment' : 'credentials'}. Will retry automatically.`,
      provider: 'kurohost',
      kurohostInstanceId,
      kurohostJobId: kurohostJobId || undefined,
      kurohostZoneId: cloudZoneId || undefined,
      kurohostFlavorId: cloudFlavorId || undefined,
      username,
      password: password || order.password || '',
      ipAddress: ipAddress || order.ipAddress || '',
      autoProvisioned: true,
      lastSyncTime: new Date(),
    };

    if (ipAddress) updateData.ipAddress = ipAddress;

    if (fullyProvisioned && ipAddress) {
      await finalizeIpAssignmentForOrder(order, ipAddress, updateData);
    } else {
      await Order.findByIdAndUpdate(order._id, updateData);
    }

    const totalTime = Date.now() - startTime;
    console.log(`[KUROHOST] ✅ PROVISIONING ${fullyProvisioned ? 'COMPLETED' : 'PENDING — cron will check'}`);
    console.log(`   - Order ID: ${order._id}`);
    console.log(`   - KuroHost Instance: ${kurohostInstanceId}`);
    console.log(`   - IP: ${ipAddress || 'pending'}`);

    return {
      success: fullyProvisioned,
      kurohostPending: !fullyProvisioned,
      instanceId: kurohostInstanceId,
      ipAddress: ipAddress || null,
      credentials: { username, password },
      totalTime,
      ...(fullyProvisioned ? {} : { error: `KuroHost instance ${kurohostInstanceId} pending IP/credentials` }),
    };
  }

  // --- RESELLER PANEL PATH (PrimeVPS / Hostheaven UserSide.pdf) ------------

  async resolveResellerApiConfigForStock(ipStock) {
    if (!ipStock?.company) {
      L.line('[RESELLER-API] IPStock has no company link — cannot resolve panel credentials');
      return null;
    }
    try {
      const company = await Company.findById(ipStock.company).select('resellerApi name').lean();
      if (!company) return null;
      const cfg = getCompanyResellerApiConfig(company);
      if (!cfg) {
        L.line(`[RESELLER-API] Company "${company.name}" has no enabled reseller API config`);
        return null;
      }
      return { ...cfg, companyName: company.name };
    } catch (err) {
      L.line(`[RESELLER-API] Failed to load company config: ${err.message}`);
      return null;
    }
  }

  async provisionViaResellerApi(order, ipStock, startTime) {
    L.head(`RESELLER PANEL PATH — order ${order._id}`);

    const isWindowsProduct = this.isWindowsOrder(order, ipStock);
    let orderOs = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';

    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      provider: 'reseller-api',
    });

    const cfg = await this.resolveResellerApiConfigForStock(ipStock);
    if (!cfg) {
      throw new Error(
        `Reseller panel API not configured for IPStock "${ipStock?.name}". ` +
        `Enable resellerApi on the linked company in /admin/companies (e.g. primevps → primevm.in).`
      );
    }
    L.kv('[RESELLER-API] Using company', cfg.companyName);

    const stockCfg = readResellerApiStockConfig(ipStock);
    L.kv('[RESELLER-API] Stock config', stockCfg);
    const locationCtx = buildResellerLocationContext(ipStock, order);
    L.kv('[RESELLER-API] Expected zone', locationCtx.expectedZoneId ?? '(none)');
    if (locationCtx.expectedZoneIds?.length > 1) {
      L.kv('[RESELLER-API] Fallback zones', locationCtx.expectedZoneIds.join(', '));
    }
    L.kv('[RESELLER-API] Expected IP prefix', locationCtx.expectedIpPrefix ?? '(none)');

    const api = new ResellerApi(cfg);

    let resellerVmId = order.resellerVmId || '';
    let resellerOrderId = order.resellerOrderId || '';
    let resellerGroupId = order.resellerGroupId || '';
    let purchasedZoneId = order.resellerZoneId ? String(order.resellerZoneId) : null;
    let purchaseStartedAt = order.createdAt
      ? new Date(order.createdAt).getTime()
      : Date.now();

    if (!resellerVmId && !resellerOrderId) {
      let priceIds = resolvePriceIdsForMemory(stockCfg, order.memory);
      let effectivePlanType = resolveEffectiveResellerPlanType(stockCfg, priceIds);
      if (!priceIds?.cpuPriceId) {
        L.line('[RESELLER-API] No per-memory price map — auto-resolving from catalog');
        priceIds = await autoResolveResellerPriceIds(api, {
          memory: order.memory,
          planType: stockCfg.planType,
          isWindows: isWindowsProduct,
        });
        effectivePlanType = resolveEffectiveResellerPlanType(stockCfg, priceIds);
        L.kv('[RESELLER-API] Resolved planType', effectivePlanType);
        if (priceIds?.resolvedRamLabel) {
          L.kv('[RESELLER-API] Resolved RAM tier', priceIds.resolvedRamLabel);
        }
      }

      const zonesList = await api.listZones();
      const zoneCandidates = await resolveResellerZoneCandidatesForPurchase(api, stockCfg, { zonesList });
      if (!zoneCandidates.length) {
        throw new Error(
          'No live region available for this IP stock. Primary/fallback zones are inactive on panel — try another region or wait.'
        );
      }

      const companyDoc = await Company.findById(ipStock.company).select('resellerApi').lean();
      if (companyDoc?.resellerApi?.useLiveStockApi) {
        const { verifyResellerMemoryInStock } = require('@/lib/resellerLiveStock');
        const liveCheck = await verifyResellerMemoryInStock(ipStock, order.memory);
        if (!liveCheck.ok) {
          throw new Error(
            liveCheck.message ||
            'Panel wallet too low for this plan. Top up the primevm.in wallet and try again.'
          );
        }
        L.kv('[RESELLER-API] Live stock OK', liveCheck.result?.walletBalance ?? '(cached)');
      }

      let zoneId = null;
      let zoneIsoId = null;
      let createRes = null;
      let lastPurchaseError = null;

      for (const candidate of zoneCandidates) {
        zoneId = candidate.zoneId;
        const configuredIsoId =
          priceIds.zoneIsoId ||
          stockCfg.defaultOs?.[isWindowsProduct ? 'Windows' : 'Linux']?.zoneIsoId ||
          null;
        zoneIsoId = configuredIsoId;

        // ISO ids are per zone. A saved id from zone 1 (or a removed zone) must not
        // be reused on the fallback zone — that returns "ISO/Zone mismatch" and
        // kills the buy even though the fallback region is in stock.
        try {
          const isos = await api.getZoneIsos(zoneId);
          const isoList = Array.isArray(isos) ? isos : (isos?.isos || isos?.content || isos?.data || []);
          const configuredExists = zoneIsoId != null && isoList.some((iso) => Number(iso.id) === Number(zoneIsoId));
          if (!configuredExists) {
            const resolved = resolveZoneIsoIdFromCatalog(isos, {
              isWindows: isWindowsProduct,
              orderOs: order.os || orderOs,
            });
            if (resolved != null) {
              L.line(
                `[RESELLER-API] Zone ${zoneId} has no ISO ${zoneIsoId ?? '(none)'} — using catalog ISO ${resolved}`
              );
              zoneIsoId = resolved;
            }
          }
        } catch (err) {
          if (zoneIsoId == null) {
            lastPurchaseError = err;
            L.line(`[RESELLER-API] ISO lookup failed for zone ${zoneId}: ${err.message}`);
            continue;
          }
        }

        if (zoneIsoId == null) {
          lastPurchaseError = new Error(
            `Could not resolve ISO for zone ${zoneId}. Set zoneIsoId in IP Stock resellerApi config.`
          );
          continue;
        }

        const createBody = {
          zoneId: Number(zoneId),
          zoneIsoId: Number(zoneIsoId),
          planType: effectivePlanType,
          cpuPriceId: Number(priceIds.cpuPriceId),
          ramPriceId: Number(priceIds.ramPriceId),
          diskPriceId: Number(priceIds.diskPriceId),
          bandwidthPriceId: Number(priceIds.bandwidthPriceId),
          months: 1,
          quantity: 1,
          useWalletBalance: true,
        };

        const upstreamCoupon = resolveCouponCodeForMemory(stockCfg, order.memory, {
          couponCode: cfg.couponCode,
          couponByMemory: cfg.couponByMemory,
        });
        if (upstreamCoupon) {
          createBody.couponCode = upstreamCoupon;
          try {
            const pricing = await api.estimateMonthlyVmPrice({
              planType: effectivePlanType,
              cpuPriceId: priceIds.cpuPriceId,
              ramPriceId: priceIds.ramPriceId,
              diskPriceId: priceIds.diskPriceId,
              bandwidthPriceId: priceIds.bandwidthPriceId,
              months: 1,
              quantity: 1,
            });
            const orderAmount = Number(pricing?.estimatedMonthly ?? 0);
            if (orderAmount > 0) {
              const couponCheck = await api.validateCoupon({
                code: upstreamCoupon,
                orderAmount,
              });
              const checkData =
                couponCheck?.data && typeof couponCheck.data === 'object'
                  ? couponCheck.data
                  : couponCheck;
              if (checkData?.valid === true) {
                L.kv(
                  '[RESELLER-API] Upstream coupon',
                  `${upstreamCoupon} → ₹${checkData.finalAmount ?? '?'} (was ₹${checkData.originalAmount ?? orderAmount})`
                );
              } else {
                L.line(
                  `[RESELLER-API] Coupon ${upstreamCoupon} validate returned invalid — still sending on create`
                );
              }
            } else {
              L.kv('[RESELLER-API] Upstream coupon', upstreamCoupon);
            }
          } catch (couponErr) {
            L.line(
              `[RESELLER-API] Coupon pre-check skipped (${couponErr.message}) — create will use couponCode=${upstreamCoupon}`
            );
          }
        }

        L.line(
          `[RESELLER-API] POST /api/users/vms/create zone ${zoneId} ${JSON.stringify(createBody)}`
        );
        const createStartedAt = Date.now();
        try {
          createRes = await api.createVm(createBody, { gateway: stockCfg.gateway || 'WALLET' });
          L.line(`[RESELLER-API] Purchase OK on zone ${zoneId}${candidate.zone?.name ? ` (${candidate.zone.name})` : ''}`);
          break;
        } catch (err) {
          lastPurchaseError = err;
          const aborted = err?.name === 'AbortError' || /aborted|timed out|timeout/i.test(String(err?.message || ''));
          if (aborted) {
            L.line(
              `[RESELLER-API] Zone ${zoneId} create timed out (${err.message}). ` +
              `Checking the panel for a VM before buying another region.`
            );
            const recovered = await waitForProvisionedVm(api, {
              purchaseStartedAt: createStartedAt - 15_000,
              excludeOrderId: order._id,
              order,
              expectedZoneId: locationCtx.expectedZoneId,
              expectedZoneIds: locationCtx.expectedZoneIds,
              expectedIpPrefix: locationCtx.expectedIpPrefix,
              maxWaitMs: 90_000,
              pollMs: 4000,
            });
            if (recovered && !recovered.pending && (recovered.vmId || recovered.ip)) {
              resellerVmId = recovered.vmId ? String(recovered.vmId) : '';
              if (recovered.ip) order.ipAddress = recovered.ip;
              if (recovered.username) order.username = recovered.username;
              if (recovered.password) order.password = recovered.password;
              if (recovered.expiryDate) order.expiryDate = recovered.expiryDate;
              await Order.findByIdAndUpdate(order._id, {
                resellerVmId: resellerVmId || undefined,
                ipAddress: recovered.ip || undefined,
                username: recovered.username || undefined,
                password: recovered.password || undefined,
                expiryDate: recovered.expiryDate || undefined,
                provider: 'reseller-api',
                provisioningError: '',
              });
              createRes = {
                data: {
                  recoveredAfterTimeout: true,
                  vmId: resellerVmId || undefined,
                },
              };
              L.line(
                `[RESELLER-API] Timed-out create still produced VM ${resellerVmId || '(pending id)'} ` +
                `${recovered.ip || ''}`
              );
              break;
            }
            throw new Error(
              `Panel create timed out and no new VM appeared. Not buying another region. ${err.message}`
            );
          }
          L.line(`[RESELLER-API] Zone ${zoneId} purchase failed: ${err.message} — trying fallback`);
        }
      }

      if (!createRes) {
        throw new Error(
          `Panel VM purchase failed on all configured regions: ${lastPurchaseError?.message || 'unknown error'}`
        );
      }

      purchaseStartedAt = Date.now();

      const createData = createRes?.data && typeof createRes.data === 'object' ? createRes.data : createRes;
      resellerOrderId =
        createData?.transactionId ??
        createData?.orderReference ??
        createData?.orderId ??
        createRes?.transactionId ??
        createRes?.orderId ??
        '';
      resellerGroupId =
        createData?.groupId ??
        createRes?.groupId ??
        '';
      const createdVmId =
        createData?.vmId ??
        createData?.virtualMachineId ??
        createRes?.vmId ??
        createRes?.virtualMachineId ??
        '';
      if (createdVmId) {
        const vmValid = await validateCreatedVmId(api, createdVmId, {
          resellerGroupId: resellerGroupId || undefined,
          resellerOrderId: resellerOrderId || undefined,
          purchaseStartedAt,
        });
        if (vmValid) {
          resellerVmId = String(createdVmId);
        } else {
          L.line(
            `[RESELLER-API] Ignoring create vmId ${createdVmId} — migration VM or bulk group mismatch; polling overview`
          );
        }
      }

      await Order.findByIdAndUpdate(order._id, {
        resellerOrderId: resellerOrderId ? String(resellerOrderId) : undefined,
        resellerGroupId: resellerGroupId ? String(resellerGroupId) : undefined,
        resellerZoneId: zoneId != null ? String(zoneId) : undefined,
        provider: 'reseller-api',
      });
      purchasedZoneId = zoneId != null ? String(zoneId) : purchasedZoneId;

      L.kv('[RESELLER-API] upstream orderId', resellerOrderId || '(none)');
      L.kv('[RESELLER-API] upstream groupId', resellerGroupId || '(none)');
    } else {
      L.line(`[RESELLER-API] Resuming — vmId=${resellerVmId || 'pending'}, orderId=${resellerOrderId || 'n/a'}`);
    }

    let ipAddress = order.ipAddress || '';
    let username = isWindowsProduct ? 'Administrator' : 'root';
    let password = order.password || '';
    let expiryDate = order.expiryDate || null;
    let wrongIpHold = '';

    if (!ipAddress || !password) {
      const vmIdKnown = resellerVmId || null;
      let provisioned = null;

      if (vmIdKnown) {
        const vmValid = await validateCreatedVmId(api, vmIdKnown, {
          resellerGroupId: order.resellerGroupId || resellerGroupId || undefined,
          resellerOrderId: order.resellerOrderId || resellerOrderId || undefined,
          purchaseStartedAt,
        });
        if (vmValid) {
          try {
            const synced = await syncResellerVmCredentials(api, order, vmIdKnown);
            ipAddress = synced.updates.ipAddress || ipAddress;
            password = synced.updates.password || password;
            username = synced.updates.username || username;
            expiryDate = synced.updates.expiryDate || expiryDate;
            provisioned = { vmId: vmIdKnown, ip: ipAddress, password, username, expiryDate };
          } catch (err) {
            L.line(`[RESELLER-API] Direct vm sync failed: ${err.message}`);
          }
        } else {
          L.line(
            `[RESELLER-API] Stored vmId ${vmIdKnown} invalid for this purchase — polling overview for correct VM`
          );
          resellerVmId = '';
        }
      }

      if (!provisioned?.ip && !provisioned?.password) {
        provisioned = await waitForProvisionedVm(api, {
          resellerOrderId: resellerOrderId || null,
          resellerGroupId: resellerGroupId || null,
          resellerVmId: resellerVmId || null,
          purchaseStartedAt,
          excludeOrderId: order._id,
          order,
          expectedZoneId: locationCtx.expectedZoneId,
          expectedZoneIds: locationCtx.expectedZoneIds,
          expectedIpPrefix: locationCtx.expectedIpPrefix,
          maxWaitMs: 180_000,
          pollMs: 5000,
        });
      }

      if (provisioned?.pending) {
        const { completeResellerPendingOrder } = require('@/lib/resellerApiOrderSync');
        const freshOrder = await Order.findById(order._id);
        const recovered = await completeResellerPendingOrder(freshOrder, ipStock, { api });
        if (recovered?.success || recovered?.ipAddress) {
          const updated = await Order.findById(order._id).lean();
          ipAddress = updated?.ipAddress || recovered.ipAddress || ipAddress;
          password = updated?.password || password;
          username = updated?.username || username;
          resellerVmId = updated?.resellerVmId || recovered.vmId || resellerVmId;
          expiryDate = updated?.expiryDate || expiryDate;
          provisioned = {
            vmId: resellerVmId,
            ip: ipAddress,
            password,
            username,
            expiryDate,
          };
        } else {
          const { calculateCompanyExpiryDate } = await import('@/lib/expiryHelper');
          expiryDate = expiryDate || calculateCompanyExpiryDate();
          await Order.findByIdAndUpdate(order._id, {
            status: 'confirmed',
            provisioningStatus: 'provisioning',
            provisioningError: 'PENDING: VM purchased on panel — waiting for IP/credentials. Will retry automatically.',
            provider: 'reseller-api',
            username,
            os: orderOs,
            expiryDate,
            lastProvisionAttempt: new Date(),
          });

          scheduleResellerPendingCompletion(order._id);

          return {
            success: false,
            resellerApiPending: true,
            error: 'Panel VM pending IP/credentials',
            totalTime: Date.now() - startTime,
          };
        }
      }

      if (provisioned?.wrongIpHold && provisioned?.ip && locationCtx.expectedIpPrefix) {
        wrongIpHold = `WRONG_IP: VM ${provisioned.vmId || 'unknown'} provisioned with ${provisioned.ip}, but this product needs ${locationCtx.expectedIpPrefix}.x. Fix the VM IP on the reseller panel — the order auto-completes once it matches.`;
        resellerVmId = provisioned.vmId || resellerVmId;
        L.line(`[RESELLER-API] ${wrongIpHold} — holding order in processing, VM link kept`);
        ipAddress = '';
        password = '';
        provisioned = { vmId: resellerVmId, ip: '', password: '' };
      }

      if (provisioned?.vmId) resellerVmId = provisioned.vmId;
      if (provisioned?.ip) ipAddress = provisioned.ip;
      if (provisioned?.password) password = provisioned.password;
      if (provisioned?.username) {
        username = provisioned.username;
      }
      if (provisioned?.os) {
        orderOs = provisioned.os;
      }
      if (provisioned?.expiryDate) expiryDate = provisioned.expiryDate;
    }

    const { normalizePanelUsernameForOrder, normalizePanelOsForOrder } = require('@/lib/orderOs');
    orderOs = normalizePanelOsForOrder(orderOs, order.productName, orderOs);
    username = normalizePanelUsernameForOrder(username, order.productName, username, orderOs);

    if (
      ipAddress &&
      locationCtx.expectedIpPrefix &&
      !ipMatchesOrderedRange(ipAddress, locationCtx.expectedIpPrefix)
    ) {
      // Keep the VM linked and hold the order in processing: the admin fixes
      // the IP on the reseller panel, and the stuck-order sync auto-completes
      // the order once the panel IP matches the ordered range. Clearing
      // resellerVmId here would orphan the already-paid VM and let a retry
      // purchase (and bill) a second one.
      wrongIpHold = `WRONG_IP: VM ${resellerVmId || 'unknown'} provisioned with ${ipAddress}, but this product needs ${locationCtx.expectedIpPrefix}.x. Fix the VM IP on the reseller panel — the order auto-completes once it matches.`;
      L.line(`[RESELLER-API] ${wrongIpHold} — holding order in processing, VM link kept`);
      ipAddress = '';
      password = '';
    }

    if (!expiryDate) {
      const { calculateCompanyExpiryDate } = await import('@/lib/expiryHelper');
      expiryDate = calculateCompanyExpiryDate();
    }

    let panelCredsUpdate = {};
    if (!order.panelUsername) {
      const { generatePanelCredentials } = require('@/lib/panelCredentials');
      const { panelUsername, panelPassword } = generatePanelCredentials();
      panelCredsUpdate = { panelUsername, panelPassword };
    }

    const fullyProvisioned = !!(ipAddress && (password || resellerVmId));
    const provisionUpdate = {
      status: fullyProvisioned ? 'active' : 'confirmed',
      provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
      provisioningError: fullyProvisioned
        ? ''
        : (wrongIpHold || `PENDING: awaiting ${!ipAddress ? 'IP' : 'password'} from panel`),
      provider: 'reseller-api',
      ...panelCredsUpdate,
      resellerVmId: resellerVmId || undefined,
      resellerOrderId: resellerOrderId || undefined,
      resellerGroupId: resellerGroupId || undefined,
      resellerZoneId: purchasedZoneId || (stockCfg.zoneId != null ? String(stockCfg.zoneId) : undefined),
      ipAddress: ipAddress || '',
      username,
      password: password || '',
      os: orderOs,
      expiryDate,
      autoProvisioned: true,
    };

    if (fullyProvisioned && ipAddress) {
      await finalizeIpAssignmentForOrder(order, ipAddress, provisionUpdate);
    } else {
      await Order.findByIdAndUpdate(order._id, provisionUpdate);
    }

    const totalTime = Date.now() - startTime;
    L.line(`[RESELLER-API] ${fullyProvisioned ? 'COMPLETED' : 'PENDING'} in ${totalTime}ms`);

    if (!fullyProvisioned) {
      scheduleResellerPendingCompletion(order._id);
    }

    return {
      success: fullyProvisioned,
      resellerApiPending: !fullyProvisioned,
      ipAddress: ipAddress || null,
      credentials: { username, password },
      vmId: resellerVmId || null,
      totalTime,
      ...(fullyProvisioned ? {} : { error: 'Panel VM pending IP/credentials' }),
    };
  }

  // --- SMARTVPS PATH -------------------------------------------------------

  async provisionViaSmartVps(order, ipStock, startTime) {
    L.head(`SMARTVPS PATH — order ${order._id}`);

    const isWindowsProduct = /windows|rdp|vps/i.test(String(order.productName));
    const targetOS = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';
    L.kv('[SMARTVPS] isWindowsProduct', isWindowsProduct);
    L.kv('[SMARTVPS] targetOS', targetOS);

    const ram = this.extractRam(order.memory);
    L.kv('[SMARTVPS] parsed RAM (GB)', ram);
    if (!ram) throw new Error(`Unable to parse RAM from memory "${order.memory}" for SmartVPS`);

    // Extract IP prefix from product name (e.g., "🌊 103.82.72" -> "103.82.72")
    // Remove emoji, spaces, and extract the IP pattern
    const requestedIpPrefix = this.extractSmartVpsIpPrefix(order.productName);

    L.line(`[SMARTVPS] Customer ordered product: ${order.productName}`);
    L.kv('[SMARTVPS] Extracted IP prefix', requestedIpPrefix);

    if (!requestedIpPrefix || !requestedIpPrefix.match(/^\d+\.\d+/)) {
      throw new Error(`Cannot extract IP prefix from product name "${order.productName}". Expected format like "🌊 103.82.72"`);
    }

    // CRITICAL: Pick a SPECIFIC IP from ipstock matching what customer ordered
    // We don't care about package IDs or package names - just find IPs in the requested range!
    // According to SmartVPS docs: "First you need to call ipstock api to get the available ip 
    // and then call this api to buy the vps"
    let specificIpToBuy;
    try {
      L.line(`[SMARTVPS] Searching ipstock for available IPs matching: ${requestedIpPrefix}.*`);
      specificIpToBuy = await this.pickSmartVpsIpForPackage(requestedIpPrefix, ram);
      L.kv('[SMARTVPS] Specific IP selected from ipstock', specificIpToBuy);

      if (!specificIpToBuy) {
        throw new Error(`No available IP found matching ${requestedIpPrefix}.*. Package may be out of stock.`);
      }
    } catch (ipstockError) {
      L.line(`[SMARTVPS] ❌ Failed to get IP from ipstock: ${ipstockError.message}`);

      // Mark order as failed BEFORE purchasing anything
      await Order.findByIdAndUpdate(order._id, {
        provisioningStatus: 'failed',
        provisioningError: `No available IPs matching "${requestedIpPrefix}.*". SmartVPS may be out of stock for this IP range. Error: ${ipstockError.message}`,
        autoProvisioned: true,
        provider: 'smartvps'
      });

      throw new Error(`Cannot provision: ${ipstockError.message}. No financial loss - purchase was not attempted.`);
    }

    L.line(`[SMARTVPS] ✅ Will purchase specific IP: ${specificIpToBuy} with ${ram}GB RAM`);

    const existingOwnedIp = String(order.ipAddress || '').trim();
    if (existingOwnedIp && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(existingOwnedIp)) {
      L.line(`[SMARTVPS] Order already has IP ${existingOwnedIp} — syncing credentials, will NOT buy again`);
      try {
        const statusRaw = await this.withTimeout(
          this.smartvpsApi.status(existingOwnedIp),
          90000,
          'SmartVPS status timeout (resume)'
        );
        const statusObj = this.normalizeSmartVpsResponse(statusRaw) || {};
        const username = statusObj.Usernane || statusObj.Username || this.getLoginUsernameFromProductName(order.productName);
        const password = statusObj.Password || order.password || '';
        const os = statusObj.OS || targetOS;
        const expiryDate = statusObj.ExpiryDate ? new Date(statusObj.ExpiryDate) : (order.expiryDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
        await Order.findByIdAndUpdate(order._id, {
          status: 'active',
          provisioningStatus: 'active',
          provider: 'smartvps',
          username,
          password,
          ipAddress: existingOwnedIp,
          autoProvisioned: true,
          provisioningError: '',
          os,
          expiryDate,
        });
        return {
          success: true,
          alreadyProvisioned: true,
          ipAddress: existingOwnedIp,
          credentials: { username, password },
          totalTime: Date.now() - startTime,
        };
      } catch (resumeErr) {
        L.line(`[SMARTVPS] Resume-by-existing-IP failed: ${resumeErr.message} — will not buy a second VPS`);
        throw new Error(
          `SmartVPS already has IP ${existingOwnedIp} on this order. Credential sync failed: ${resumeErr.message}. Will not purchase another VPS.`
        );
      }
    }

    // CRITICAL: Acquire lock to prevent race conditions
    // This ensures only ONE order provisions from this IP range at a time
    let lockAcquired = false;
    try {
      await this.acquirePackageLock(requestedIpPrefix, order._id.toString());
      lockAcquired = true;
    } catch (lockError) {
      L.line(`[SMARTVPS] ❌ Failed to acquire lock: ${lockError.message}`);

      // Mark order as failed since we can't acquire lock
      await Order.findByIdAndUpdate(order._id, {
        provisioningStatus: 'failed',
        provisioningError: `Lock acquisition failed: ${lockError.message}`,
        autoProvisioned: true,
        provider: 'smartvps'
      });

      throw new Error(`Cannot provision: ${lockError.message}. Please try again in a moment.`);
    }

    // NOW set order to provisioning status AFTER acquiring lock
    // This prevents orders from getting stuck in 'provisioning' if lock fails
    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'provisioning',
      provisioningError: '',
      autoProvisioned: true,
      lastProvisionAttempt: new Date(),
      os: targetOS,
      provider: 'smartvps'  // Set provider at the start
    });

    // Wrap entire provisioning in try-finally to ensure lock is released
    try {
      // Buy VPS with timeout and retry logic
      let buyRes, boughtIp;
      const maxRetries = 3;
      let lastError;
      let safetyCheckFailed = false; // Flag to track if safety check failed

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Use the SPECIFIC IP we selected from ipstock, not just package name
          L.line(`[SMARTVPS] Calling buyVps(${specificIpToBuy}, ${ram}) - attempt ${attempt}/${maxRetries} …`);

          // buyVps API has 3 minute timeout built-in, no extra wrapper needed
          buyRes = await this.smartvpsApi.buyVps(specificIpToBuy, ram);

          const buyText = typeof buyRes === 'string' ? buyRes : JSON.stringify(buyRes);
          L.kv(`[SMARTVPS] buyVps attempt ${attempt} response`, buyText.slice(0, 500));

          const buyParsed = parseSmartVpsBuyResponse(buyRes);
          L.kv(`[SMARTVPS] buyVps attempt ${attempt} parsed`, buyParsed);

          if (!buyParsed.ok) {
            const err = new Error(
              buyParsed.message
                ? `SmartVPS buyVps rejected: ${buyParsed.message}`
                : 'SmartVPS buyVps did not return an assigned IP'
            );
            err.isNonRetryable = /does not support|On\d+GB=false|not a supported SmartVPS tier/i.test(
              buyParsed.message || ''
            );
            throw err;
          }

          boughtIp = buyParsed.ip || this.extractIp(buyText);
          L.kv('[SMARTVPS] assigned/bought IP', boughtIp);
          if (!boughtIp) {
            const err = new Error(
              buyParsed.status === 'processing' || buyParsed.status === 'success'
                ? 'SmartVPS buyVps accepted the order but did not return an assigned IP yet'
                : 'SmartVPS buyVps did not return an assigned IP'
            );
            err.isNonRetryable = false;
            throw err;
          }

          // CRITICAL SAFETY CHECK: Verify the assigned IP belongs to the requested package
          // We requested a PACKAGE NAME (e.g., "103.82.72" or "103.109.18x")
          // SmartVPS uses 'x' as a wildcard, so normalize before checking
          // 
          // Matching Strategy (lenient):
          //   1. Try exact 3-octet match (e.g., "103.82.72" matches "103.82.72.116")
          //   2. Fallback to 2-octet match (e.g., "103.181.91" matches "103.181.90.21" - close enough!)
          //
          // This prevents failures when SmartVPS assigns from neighboring packages
          const normalizedPackage = String(specificIpToBuy).replace(/x+$/i, ''); // Strip trailing 'x' wildcards
          const packageParts = normalizedPackage.split('.');
          const ipParts = String(boughtIp).split('.');

          // Check 3-octet match first
          const prefix3 = packageParts.slice(0, 3).join('.');
          const ipPrefix3 = ipParts.slice(0, 3).join('.');
          const exact3Match = ipPrefix3.startsWith(prefix3) || String(boughtIp).startsWith(normalizedPackage);

          // Fallback: Check 2-octet match (e.g., 103.181.* matches 103.181.90.21)
          const prefix2 = packageParts.slice(0, 2).join('.');
          const ipPrefix2 = ipParts.slice(0, 2).join('.');
          const fallback2Match = (prefix2 === ipPrefix2);

          const ipMatches = exact3Match || fallback2Match;
          const matchType = exact3Match ? 'exact (3-octet)' : (fallback2Match ? 'fallback (2-octet)' : 'none');

          L.kv('[SMARTVPS]   → Requested package', specificIpToBuy);
          L.kv('[SMARTVPS]   → Normalized package prefix', normalizedPackage);
          L.kv('[SMARTVPS]   → Assigned IP from SmartVPS', boughtIp);
          L.kv('[SMARTVPS]   → Match type', matchType);
          L.kv('[SMARTVPS]   → IP accepted', ipMatches ? '✅ YES' : '❌ NO');

          if (!ipMatches) {
            L.line(`[SMARTVPS] ❌ CRITICAL: SmartVPS assigned IP from WRONG package!`);
            L.line(`[SMARTVPS]   → We requested package: ${specificIpToBuy}`);
            L.line(`[SMARTVPS]   → SmartVPS gave us IP: ${boughtIp}`);
            L.line(`[SMARTVPS]   → This IP does not belong to the requested package!`);
            L.line(`[SMARTVPS]   → ORDER WILL BE MARKED AS FAILED (not provisioned)`);

            // Set flag to prevent continuation after loop
            safetyCheckFailed = true;

            // Mark order as failed immediately
            await Order.findByIdAndUpdate(order._id, {
              provisioningStatus: 'failed',
              provisioningError: `WRONG IP ASSIGNED: Customer ordered IP range "${requestedIpPrefix}.*" and we requested IP "${specificIpToBuy}" but SmartVPS assigned "${boughtIp}". This IP does not match. DO NOT provision this order. Likely cause: IP became unavailable between ipstock check and purchase.`,
              status: 'failed',
              autoProvisioned: true,
              failedAt: new Date(),
            });

            // Throw error that will NOT be retried
            const safetyError = new Error(
              `❌ PROVISIONING BLOCKED: SmartVPS assigned wrong IP! ` +
              `Requested: "${specificIpToBuy}" but received: "${boughtIp}". ` +
              `IP range ordered: "${requestedIpPrefix}.*". Order marked as FAILED and will NOT be provisioned. ` +
              `Likely cause: IP became unavailable between ipstock check and purchase, or SmartVPS API bug. Admin must manually resolve.`
            );
            safetyError.isSafetyCheckFailure = true; // Mark as safety failure
            throw safetyError;
          }

          // Success - break out of retry loop
          L.line(`[SMARTVPS] ✅ buyVps succeeded on attempt ${attempt}`);
          L.line(`[SMARTVPS] ✅ IP verification passed: ${boughtIp} matches requested IP ${specificIpToBuy}`);
          break;

        } catch (error) {
          lastError = error;
          L.line(`[SMARTVPS] ❌ buyVps attempt ${attempt} failed: ${error.message}`);

          // CRITICAL: If safety check failed or error is not retryable, abort immediately
          if (error.isSafetyCheckFailure || safetyCheckFailed || error.isNonRetryable) {
            L.line(`[SMARTVPS] ❌ Non-retryable failure - aborting all retries`);
            break; // Exit loop immediately, do not retry
          }

          if (attempt < maxRetries) {
            // Shorter delays since buyVps API now has 3 minute timeout built-in
            // Attempt 1 → Wait 30 seconds before retry 2
            // Attempt 2 → Wait 45 seconds before retry 3
            const delaySeconds = attempt === 1 ? 30 : 45;
            const delay = delaySeconds * 1000;

            L.line(`[SMARTVPS] ⏳ Waiting ${delaySeconds}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // CRITICAL: If safety check failed, abort provisioning entirely
      if (safetyCheckFailed) {
        L.line(`[SMARTVPS] ❌ ABORTING: Safety check failed - wrong IP package assigned`);
        throw lastError; // Re-throw the safety check error
      }

      // If all retries failed
      if (!buyRes || !boughtIp) {
        throw new Error(`SmartVPS buyVps failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown'}`);
      }

      // Get credentials with retry logic
      // SmartVPS needs time to provision and make credentials available
      let statusObj = {};
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          L.line(`[SMARTVPS] Calling status(${boughtIp}) - attempt ${attempt}/${maxRetries} …`);

          const statusRaw = await this.withTimeout(
            this.smartvpsApi.status(boughtIp),
            90000, // 90 second timeout for status (was 30s)
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
            // STRATEGIC DELAYS: Server may still be provisioning
            // Attempt 1 → Wait 1 minute before retry 2
            // Attempt 2 → Wait 2 minutes before retry 3
            const delayMinutes = attempt; // 1 min, 2 min
            const delay = delayMinutes * 60 * 1000;

            L.line(`[SMARTVPS] ⏳ Strategic delay: Waiting ${delayMinutes} minute(s) (${delay}ms) before retry...`);
            L.line(`[SMARTVPS] 💡 Server may still be provisioning, giving it time to complete`);
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
        provider: 'smartvps',  // Explicitly set provider
        hostycareServiceId: undefined,
        username,
        password,
        autoProvisioned: true,
        provisioningError: '',
        os,
        expiryDate
      };
      await finalizeIpAssignmentForOrder(order, ipAddress, updateData);

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

    } finally {
      // ALWAYS release the lock, even if provisioning failed
      if (lockAcquired) {
        this.releasePackageLock(requestedIpPrefix, order._id.toString());
      }
    }
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
      lastProvisionAttempt: new Date(),
      os: targetOS,
      provider: 'hostycare'  // Set provider at the start
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

      // Format IP address with port if needed (Windows requires :49965)
      const { formatIpAddress } = await import('../lib/ipAddressHelper.js');
      const formattedIpAddress = formatIpAddress(
        ipAddress || 'Pending - Server being provisioned',
        'hostycare',
        targetOS  // Use targetOS (the newly set OS) instead of order.os (old value)
      );

      const updateData = {
        status: 'active',
        provisioningStatus: 'active',
        hostycareServiceId: serviceId,
        provider: 'hostycare',  // Explicitly set provider
        username: credentials.username,
        password: credentials.password,
        autoProvisioned: true,
        provisioningError: '',
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      if (ipAddress && ipAddress !== 'Pending - Server being provisioned') {
        await finalizeIpAssignmentForOrder(order, formattedIpAddress, {
          ...updateData,
          ipAddress: formattedIpAddress,
        });
      } else {
        await Order.findByIdAndUpdate(order._id, {
          ...updateData,
          ipAddress: formattedIpAddress,
        });
      }

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
        const order = await Order.findById(orderId).lean();
        if (order) {
          await finalizeIpAssignmentForOrder(order, ip, {
            ipAddress: ip,
            lastSyncTime: new Date(),
          });
        } else {
          await Order.findByIdAndUpdate(orderId, { ipAddress: ip });
        }
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
