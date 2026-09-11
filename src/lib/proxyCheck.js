const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Sites that often reject HEAD — use GET directly. */
const PREFER_GET_IDS = new Set(['irctc', 'paytm', 'flipkart', 'amazon_in']);

/** Heavy pages that hang until full body downloads — stop after response headers. */
const HEADERS_ONLY_IDS = new Set(['irctc', 'paytm', 'flipkart', 'amazon_in']);

function buildProxyUri(proxy) {
  const user = encodeURIComponent(proxy.username);
  const pass = encodeURIComponent(proxy.password);
  return `http://${user}:${pass}@${proxy.ip}:${proxy.port}`;
}

function buildAgents(proxy) {
  const uri = buildProxyUri(proxy);
  const opts = { keepAlive: false, timeout: 35000 };
  return {
    httpAgent: new HttpProxyAgent(uri, opts),
    httpsAgent: new HttpsProxyAgent(uri, opts),
  };
}

function axiosViaProxy(proxy, extra = {}) {
  const { timeoutMs, headers: extraHeaders, ...rest } = extra;
  const agents = buildAgents(proxy);
  return {
    proxy: false,
    ...agents,
    timeout: timeoutMs || 35000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-IN,en;q=0.9',
      ...(extraHeaders || {}),
    },
    ...rest,
  };
}

function classifyError(err) {
  const code = err?.code || '';
  const msg = String(err?.message || 'Connection failed');
  if (code === 'ECONNREFUSED') return 'Proxy connection refused — check IP and port';
  if (code === 'ENOTFOUND') return 'Proxy host not found';
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') return 'Timed out — proxy slow or unreachable';
  if (msg.includes('407') || msg.toLowerCase().includes('proxy authentication')) {
    return 'Wrong proxy username or password';
  }
  if (
    msg.includes('CONNECT response') ||
    msg.includes('before receiving CONNECT') ||
    msg.includes('ECONNRESET') ||
    msg.includes('socket hang up')
  ) {
    return 'Proxy blocked this request (may still work on selected sites — check results below)';
  }
  if (
    msg.includes('secure TLS connection') ||
    msg.includes('SSL') ||
    msg.includes('certificate') ||
    msg.includes('EPROTO')
  ) {
    return 'SSL handshake failed on this probe';
  }
  return msg.slice(0, 140);
}

function classifyHttpStatus(status) {
  if (status === 407) return { working: false, message: 'Proxy authentication failed' };
  if (status >= 500) return { working: false, message: `Site error ${status}` };
  if (status === 403 || status === 429 || status === 401) {
    return {
      working: true,
      partial: true,
      message: 'Reachable (site may block automated checks)',
    };
  }
  if (status >= 200 && status < 400) return { working: true, message: 'Working' };
  if (status === 204) return { working: true, message: 'Working' };
  return { working: false, message: `HTTP ${status}` };
}

async function requestThroughProxy(proxy, url, { timeoutMs = 35000, method = 'get' } = {}) {
  const opts = axiosViaProxy(proxy, { timeoutMs });
  if (method === 'head') return axios.head(url, opts);
  return axios.get(url, opts);
}

/**
 * GET but resolve as soon as response headers arrive (IRCTC-style slow/chunked bodies).
 */
async function requestThroughProxyHeadersOnly(
  proxy,
  url,
  { timeoutMs = 35000, headers = {} } = {}
) {
  const opts = axiosViaProxy(proxy, {
    timeoutMs,
    responseType: 'stream',
    headers,
  });
  const res = await axios.get(url, opts);
  if (res.data?.destroy) res.data.destroy();
  return { status: res.status, headers: res.headers };
}

function targetProbeUrls(target) {
  if (Array.isArray(target.probeUrls) && target.probeUrls.length) return target.probeUrls;
  return [target.url];
}

function targetProbeHeaders(target) {
  return target.probeHeaders || {};
}

/**
 * Build health summary from site check results (most accurate for IRCTC-style proxies).
 */
function deriveHealthFromResults(results) {
  const working = results.filter((r) => r.working);
  if (!working.length) {
    const firstFail = results.find((r) => r.message) || results[0];
    return {
      working: false,
      ms: firstFail?.ms || 0,
      message: firstFail?.message || 'Proxy did not reach any selected site',
      outboundIp: null,
      source: 'site_checks',
    };
  }
  const names = working.map((r) => r.label).slice(0, 3);
  const suffix = working.length > 3 ? ` +${working.length - 3} more` : '';
  return {
    working: true,
    partial: working.some((r) => r.partial),
    ms: Math.min(...working.map((r) => r.ms || 99999)),
    message: `Working on ${working.length} site(s): ${names.join(', ')}${suffix}`,
    outboundIp: null,
    source: 'site_checks',
  };
}

/**
 * Optional lightweight probe — same style as site checks (not ipify/amazon).
 */
async function checkProxyHealth(proxy, { timeoutMs = 25000 } = {}) {
  const probes = ['https://www.google.com/generate_204'];
  let lastError = null;
  for (const url of probes) {
    const start = Date.now();
    try {
      const res = await requestThroughProxy(proxy, url, { timeoutMs, method: 'get' });
      const ms = Date.now() - start;
      if (res.status === 407) {
        return { working: false, ms, message: 'Proxy authentication failed', source: 'probe' };
      }
      const classified = classifyHttpStatus(res.status);
      if (classified.working) {
        return {
          working: true,
          partial: classified.partial,
          ms,
          message: 'Proxy tunnel OK (Google probe)',
          source: 'probe',
        };
      }
    } catch (err) {
      lastError = err;
    }
  }
  return {
    working: false,
    ms: 0,
    message: lastError ? classifyError(lastError) : 'Probe failed',
    source: 'probe',
  };
}

/**
 * Test proxy against one whitelisted site.
 */
async function checkProxyOnTarget(proxy, target, { timeoutMs = 35000 } = {}) {
  const start = Date.now();
  const preferGet = target.preferGet || PREFER_GET_IDS.has(target.id);
  const headersOnly = target.headersOnly || HEADERS_ONLY_IDS.has(target.id);

  const finish = (res) => {
    const ms = Date.now() - start;
    const classified = classifyHttpStatus(res.status);
    return {
      id: target.id,
      label: target.label,
      url: target.url,
      working: classified.working,
      partial: !!classified.partial,
      status: res.status,
      ms,
      message: classified.message,
    };
  };

  const fail = (err) => ({
    id: target.id,
    label: target.label,
    url: target.url,
    working: false,
    partial: false,
    status: null,
    ms: Date.now() - start,
    message: classifyError(err),
  });

  try {
    if (headersOnly) {
      const urls = targetProbeUrls(target);
      const headers = targetProbeHeaders(target);
      let lastErr = null;
      for (const url of urls) {
        try {
          const res = await requestThroughProxyHeadersOnly(proxy, url, { timeoutMs, headers });
          return finish(res);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('All probe URLs failed');
    }
    if (preferGet) {
      const res = await requestThroughProxy(proxy, target.url, { timeoutMs, method: 'get' });
      return finish(res);
    }
    try {
      const res = await requestThroughProxy(proxy, target.url, { timeoutMs, method: 'head' });
      if (res.status === 405 || res.status === 501) {
        const res2 = await requestThroughProxy(proxy, target.url, { timeoutMs, method: 'get' });
        return finish(res2);
      }
      return finish(res);
    } catch {
      const res = await requestThroughProxy(proxy, target.url, { timeoutMs, method: 'get' });
      return finish(res);
    }
  } catch (err) {
    return fail(err);
  }
}

module.exports = {
  checkProxyHealth,
  checkProxyOnTarget,
  deriveHealthFromResults,
  classifyError,
  classifyHttpStatus,
};
