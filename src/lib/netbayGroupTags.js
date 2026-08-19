function normalizeGroupTag(raw) {
  return String(raw || '').trim();
}

function parseGroupTagList(raw) {
  if (Array.isArray(raw)) {
    return raw.flatMap((part) => parseGroupTagList(part));
  }
  return String(raw || '')
    .split(/[\n,|;]+/)
    .map((part) => normalizeGroupTag(part))
    .filter(Boolean);
}

function parseNetbayGroupTags(cfg) {
  const out = [];
  const push = (value) => {
    const tag = normalizeGroupTag(value);
    if (tag && !out.includes(tag)) out.push(tag);
  };
  parseGroupTagList(cfg?.groupTags).forEach(push);
  push(cfg?.groupTag);
  return out;
}

function resolveNetbayPurchaseGroupTag(cfg, requested) {
  const allowed = parseNetbayGroupTags(cfg);
  const req = normalizeGroupTag(requested);
  if (req) {
    if (allowed.length && !allowed.includes(req)) {
      return { ok: false, error: 'This IP series is not available on this plan. Pick another series.' };
    }
    return { ok: true, groupTag: req };
  }
  if (allowed.length === 1) return { ok: true, groupTag: allowed[0] };
  if (allowed.length === 0) return { ok: true, groupTag: '' };
  return { ok: false, error: 'Select an IP series for this proxy plan.' };
}

function netbayConfigWithGroupTags(cfg, tags) {
  const groupTags = parseGroupTagList(tags);
  return {
    ...(cfg || {}),
    groupTags,
    groupTag: groupTags[0] || '',
  };
}

module.exports = {
  normalizeGroupTag,
  parseGroupTagList,
  parseNetbayGroupTags,
  resolveNetbayPurchaseGroupTag,
  netbayConfigWithGroupTags,
};
