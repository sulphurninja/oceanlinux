/** Trial package plan type — shown to customers on the store. */
export const TRIAL_VPS_PLAN_CATEGORIES = [
  { value: 'linux', label: 'Linux' },
  { value: 'windows', label: 'Windows VPS' },
  { value: 'premium_proxy', label: 'Premium IP Proxy' },
];

export function normalizeTrialVpsPlanCategory(raw) {
  const v = String(raw || 'linux')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (v === 'slot' || v === 'slotip' || v === 'slot_ip' || v === 'proxy' || v === 'premium') {
    return 'premium_proxy';
  }
  if (v === 'vps' || v === 'windows_vps' || v === 'rdp') return 'windows';
  if (TRIAL_VPS_PLAN_CATEGORIES.some((c) => c.value === v)) return v;
  return 'linux';
}

export function trialVpsPlanCategoryLabel(category) {
  const key = normalizeTrialVpsPlanCategory(category);
  return TRIAL_VPS_PLAN_CATEGORIES.find((c) => c.value === key)?.label ?? 'Linux';
}

/** When legacy rows lack planCategory, infer from uploaded slot shape. */
export function inferTrialVpsPlanCategory(pkg) {
  if (pkg?.planCategory) return normalizeTrialVpsPlanCategory(pkg.planCategory);
  const slots = pkg?.slots || [];
  if (slots.some((s) => String(s?.port || '').trim())) return 'premium_proxy';
  if (slots.some((s) => /windows/i.test(String(s?.os || '')))) return 'windows';
  return 'linux';
}

export function trialVpsPlanUsesMemoryTier(planCategory) {
  return normalizeTrialVpsPlanCategory(planCategory) !== 'premium_proxy';
}

export function normalizeTrialVpsMemoryGb(raw, planCategory) {
  if (planCategory && !trialVpsPlanUsesMemoryTier(planCategory)) return 0;
  const n = Math.floor(Number(String(raw ?? '').replace(/gb/i, '').trim()) || 4);
  return Math.min(512, Math.max(1, n));
}

export function formatTrialVpsMemoryGb(gb, planCategory) {
  if (planCategory && !trialVpsPlanUsesMemoryTier(planCategory)) return '';
  if (gb != null && Number(gb) <= 0) return '';
  return `${normalizeTrialVpsMemoryGb(gb)}GB`;
}

/** Order / checkout memory line — proxy has no RAM tier. */
export function resolveTrialVpsOrderMemory(pkg) {
  const category = inferTrialVpsPlanCategory(pkg || {});
  if (category === 'premium_proxy') return 'Premium IP Proxy';
  return formatTrialVpsMemoryGb(pkg?.memoryGb ?? 4, category) || '4GB';
}
