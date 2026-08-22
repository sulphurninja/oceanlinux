/** Static fallback labels when live getostemplate is unavailable. */
const SMARTVPS_OS_LABELS = {
  ubuntu: 'Ubuntu 22',
  centos: 'CentOS 7',
  '2012': 'Windows Server 2012',
  '2016': 'Windows Server 2016',
  '2019': 'Windows Server 2019',
  '2022': 'Windows Server 2022',
  '11': 'Windows 11',
  '2025': 'Windows 2025',
  '2022g': 'Windows Server 2022 G',
};

function humanizeSmartVpsOsLabel(id) {
  const raw = String(id || '').trim();
  const key = raw.toLowerCase();
  if (SMARTVPS_OS_LABELS[key]) return SMARTVPS_OS_LABELS[key];

  const yearSuffix = key.match(/^(\d{4})([a-z]+)$/i);
  if (yearSuffix) {
    return `Windows Server ${yearSuffix[1]} ${yearSuffix[2].toUpperCase()}`;
  }
  if (/^\d{4}$/.test(key)) return `Windows Server ${key}`;

  return raw;
}

function isSmartVpsLinuxOsType(osType) {
  const k = String(osType || '').toLowerCase();
  return k === 'ubuntu' || k === 'centos';
}

function isSmartVpsWindowsOsType(osType) {
  return !!osType && !isSmartVpsLinuxOsType(osType);
}

function parseSmartVpsOsTemplateList(raw) {
  let data = raw;

  for (let depth = 0; depth < 3 && typeof data === 'string'; depth++) {
    const lower = data.toLowerCase().trim();
    if (lower === 'error' || lower === 'failed') {
      throw new Error('SmartVPS getostemplate returned error');
    }
    try {
      data = JSON.parse(data);
    } catch {
      break;
    }
  }

  if (Array.isArray(data)) {
    const map = {};
    for (const entry of data) {
      if (typeof entry === 'string' && entry.trim()) {
        const id = entry.trim();
        map[id] = humanizeSmartVpsOsLabel(id);
      } else if (entry && typeof entry === 'object') {
        const id = String(entry.id ?? entry.os ?? entry.key ?? '').trim();
        const name = String(entry.name ?? entry.label ?? entry.os ?? id).trim();
        if (id) map[id] = name || humanizeSmartVpsOsLabel(id);
      }
    }
    return map;
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const map = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.trim()) {
        map[key] = value.trim();
      } else if (value && typeof value === 'object') {
        map[key] = String(value.name || value.label || key);
      }
    }
    if (Object.keys(map).length) return map;
  }

  throw new Error('Unexpected SmartVPS getostemplate response');
}

function isSmartVpsLinuxInstalled(osField) {
  const os = String(osField || '').toLowerCase();
  return os.includes('ubuntu') || os.includes('centos') || /\blinux\b/.test(os);
}

/** SmartVPS lists 2022/2022G in getostemplate but changeos rejects them from Linux slots. */
const SMARTVPS_LINUX_BLOCKED_WINDOWS = new Set(['2022', '2022g']);

function filterSmartVpsTemplatesByCurrentOs(templates, currentOs) {
  if (!templates || typeof templates !== 'object') return templates;
  if (!isSmartVpsLinuxInstalled(currentOs)) return templates;

  const filtered = {};
  for (const [id, label] of Object.entries(templates)) {
    const key = String(id).trim();
    if (!SMARTVPS_LINUX_BLOCKED_WINDOWS.has(key.toLowerCase())) {
      filtered[key] = label;
    }
  }

  if (Object.keys(filtered).length) return filtered;
  return templates;
}

async function fetchSmartVpsOsTemplates(api, ip, { currentOs } = {}) {
  const serviceIp = String(ip || '').split(':')[0].trim();
  if (!serviceIp) throw new Error('IP required for SmartVPS OS templates');

  const raw = await api.getOsTemplate(serviceIp);
  const map = parseSmartVpsOsTemplateList(raw);
  if (!Object.keys(map).length) {
    throw new Error('No OS templates available for this server');
  }
  return filterSmartVpsTemplatesByCurrentOs(map, currentOs);
}

module.exports = {
  SMARTVPS_OS_LABELS,
  humanizeSmartVpsOsLabel,
  isSmartVpsLinuxOsType,
  isSmartVpsWindowsOsType,
  isSmartVpsLinuxInstalled,
  filterSmartVpsTemplatesByCurrentOs,
  parseSmartVpsOsTemplateList,
  fetchSmartVpsOsTemplates,
};
