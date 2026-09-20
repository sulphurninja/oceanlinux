/** Admin manage-orders: provider filter + edit dropdown options (DB `provider` keys). */

export type AdminProviderOption = { value: string; label: string; group?: string };

export const ADMIN_CORE_PROVIDER_OPTIONS: AdminProviderOption[] = [
  { value: 'hostycare', label: 'Hostycare', group: 'Upstream' },
  { value: 'smartvps', label: 'SmartVPS', group: 'Upstream' },
  { value: 'advps', label: 'ADVPS', group: 'Upstream' },
  { value: 'netbay', label: 'Netbay', group: 'Upstream' },
  { value: 'reseller-api', label: 'Hostheaven (Reseller API)', group: 'Upstream' },
  { value: 'kurohost', label: 'KuroHost', group: 'Upstream' },
  { value: 'joy', label: 'Joy Services', group: 'Upstream' },
  { value: 'hostdzire', label: 'HostDzire', group: 'Upstream' },
  { value: 'virtualizor', label: 'Virtualizor', group: 'Upstream' },
  { value: 'slotip', label: 'Slot IP', group: 'OceanLinux' },
  { value: 'trialvps', label: 'Trial VPS', group: 'OceanLinux' },
  { value: 'oceanlinux', label: 'OceanLinux (manual)', group: 'OceanLinux' },
];

export const ADMIN_PROVIDER_EDIT_OPTIONS: AdminProviderOption[] = ADMIN_CORE_PROVIDER_OPTIONS;

export const ADMIN_COMPANY_PROVIDER_PREFIX = 'company:';

export function buildAdminProviderFilterOptions(
  companies: Array<{ _id: string; name?: string; slug?: string }> = []
): AdminProviderOption[] {
  const companyOptions: AdminProviderOption[] = companies
    .filter((c) => c?._id)
    .sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug)))
    .map((c) => ({
      value: `${ADMIN_COMPANY_PROVIDER_PREFIX}${c._id}`,
      label: c.name || c.slug || 'Company',
      group: 'Companies',
    }));

  return [...ADMIN_CORE_PROVIDER_OPTIONS, ...companyOptions];
}

export function isCompanyProviderFilter(value: string) {
  return value.startsWith(ADMIN_COMPANY_PROVIDER_PREFIX);
}

export function companyIdFromProviderFilter(value: string) {
  return value.slice(ADMIN_COMPANY_PROVIDER_PREFIX.length);
}
