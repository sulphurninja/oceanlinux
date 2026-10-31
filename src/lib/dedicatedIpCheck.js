const axios = require('axios');
const net = require('net');
const tls = require('tls');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { parseProxyLine } = require('./parseProxyLine');
const { checkProxyOnTarget } = require('./proxyCheck');
const { getProxyCheckTarget } = require('./proxyCheckTargets');

const TUNNEL_URL = 'https://api.ipify.org?format=json';

function parseCheckLine(line, mode) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (mode === 'host') {
    const match = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);
    if (!match) return null;
    const port = Number(match[2]);
    if (port < 1 || port > 65535) return null;
    return { ip: match[1], port, username: '', password: '', raw: trimmed };
  }
  const parsed = parseProxyLine(trimmed);
  if (!parsed) return null;
  return { ...parsed, raw: trimmed };
}

function proxyUri(proxy) {
  if (!proxy.username) return `http://${proxy.ip}:${proxy.port}`;
  return `http://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.ip}:${proxy.port}`;
}

function classify(err) {
  const code = err?.code || '';
  const msg = String(err?.message || 'Connection failed');
  if (code === 'ECONNREFUSED') return 'Connection refused';
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED' || /timeout/i.test(msg)) return 'Timed out';
  if (/407|auth/i.test(msg)) return 'Authentication failed';
  return msg.slice(0, 90);
}

async function httpGet(proxy, url, timeoutMs) {
  const res = await axios.get(url, {
    proxy: false,
    httpsAgent: new HttpsProxyAgent(proxyUri(proxy), { keepAlive: false, timeout: timeoutMs }),
    timeout: timeoutMs,
    validateStatus: () => true,
    responseType: 'text',
    maxRedirects: 2,
    headers: { 'User-Agent': 'OceanLinux-IPChecker/1.0', Accept: '*/*' },
  });
  return { status: res.status, body: String(res.data || '').slice(0, 800) };
}

function socksGet(proxy, urlString, timeoutMs) {
  const target = new URL(urlString);
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(proxy.port), proxy.ip);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' }));
    }, timeoutMs);
    const fail = (err) => {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };
    socket.once('error', fail);
    let stage = 'greet';
    let buf = Buffer.alloc(0);
    socket.once('connect', () => {
      socket.write(proxy.username ? Buffer.from([0x05, 0x01, 0x02]) : Buffer.from([0x05, 0x01, 0x00]));
    });
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 'greet' && buf.length >= 2) {
        if (buf[1] === 0x02 && proxy.username) {
          const user = Buffer.from(proxy.username);
          const pass = Buffer.from(proxy.password || '');
          buf = Buffer.alloc(0);
          stage = 'auth';
          socket.write(Buffer.concat([Buffer.from([0x01, user.length]), user, Buffer.from([pass.length]), pass]));
          return;
        }
        if (buf[1] !== 0x00) return fail(new Error('SOCKS authentication failed'));
        stage = 'connect';
        buf = Buffer.alloc(0);
        const host = Buffer.from(target.hostname);
        const port = Number(target.port) || 443;
        socket.write(Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
          host,
          Buffer.from([(port >> 8) & 255, port & 255]),
        ]));
        return;
      }
      if (stage === 'auth' && buf.length >= 2) {
        if (buf[1] !== 0x00) return fail(new Error('SOCKS authentication failed'));
        stage = 'connect';
        buf = Buffer.alloc(0);
        const host = Buffer.from(target.hostname);
        const port = Number(target.port) || 443;
        socket.write(Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
          host,
          Buffer.from([(port >> 8) & 255, port & 255]),
        ]));
        return;
      }
      if (stage === 'connect' && buf.length >= 5) {
        if (buf[1] !== 0x00) return fail(new Error('SOCKS connect failed'));
        clearTimeout(timer);
        socket.removeAllListeners('data');
        const tlsSock = tls.connect({ socket, servername: target.hostname });
        const req = `GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.hostname}\r\nConnection: close\r\nUser-Agent: OceanLinux-IPChecker/1.0\r\nAccept: */*\r\n\r\n`;
        let raw = '';
        tlsSock.on('secureConnect', () => tlsSock.write(req));
        tlsSock.on('data', (part) => { raw += part.toString(); });
        tlsSock.on('error', fail);
        tlsSock.on('end', () => {
          const status = Number((raw.match(/^HTTP\/\d\.\d (\d+)/) || [])[1] || 0);
          const body = raw.split('\r\n\r\n').slice(1).join('\r\n\r\n').slice(0, 800);
          resolve({ status, body });
        });
      }
    });
  });
}

async function getThroughProxy(proxy, url, timeoutMs) {
  try {
    return await httpGet(proxy, url, timeoutMs);
  } catch (err) {
    try {
      return await socksGet(proxy, url, timeoutMs);
    } catch (socksErr) {
      throw socksErr || err;
    }
  }
}

async function timed(work) {
  const start = Date.now();
  try {
    const value = await work();
    return { ok: true, ms: Date.now() - start, value };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, message: classify(err) };
  }
}

async function checkDedicatedIp(proxy, { timeoutMs = 12000 } = {}) {
  const irctcTarget = getProxyCheckTarget('irctc');
  const [irctc, tunnel] = await Promise.all([
    checkProxyOnTarget(proxy, irctcTarget, { timeoutMs }),
    timed(() => getThroughProxy(proxy, TUNNEL_URL, timeoutMs)),
  ]);

  let outgoingIp = '';
  if (tunnel.ok) {
    try {
      outgoingIp = String(JSON.parse(tunnel.value.body).ip || '');
    } catch {
      outgoingIp = '';
    }
  }
  const generalOk = tunnel.ok && tunnel.value.status >= 200 && tunnel.value.status < 400 && !!outgoingIp;
  const irctcOk = !!irctc.working;

  return {
    host: `${proxy.ip}:${proxy.port}`,
    working: irctcOk,
    outgoingIp: outgoingIp || '',
    checks: {
      irctc: {
        ok: irctcOk,
        ms: irctc.ms || 0,
        message: irctcOk ? 'IRCTC working' : (irctc.message || 'IRCTC not working'),
      },
      general: {
        ok: generalOk,
        ms: tunnel.ms,
        message: generalOk ? `Outgoing IP ${outgoingIp}` : (tunnel.message || 'Outgoing IP failed'),
      },
    },
  };
}

module.exports = { parseCheckLine, checkDedicatedIp };
