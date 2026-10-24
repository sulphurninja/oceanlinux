/** Admin manage-orders: provider filter + edit dropdown options (DB `provider` keys). */

export type AdminProviderOption = { value: string; label: string; group?: string };

/** Shown in the manage-orders Provider filter. Company names are added separately. */
export const ADMIN_PROVIDER_FILTER_CORE: AdminProviderOption[] = [
  { value: 'advps', label: 'advps', group: 'Plans' },
  { value: 'smartvps', label: 'smartvps', group: 'Plans' },
  { value: 'netbay', label: 'netbay', group: 'Plans' },
  { value: 'trialvps', label: 'trial', group: 'Plans' },
  { value: 'slotip', label: 'slot', group: 'Plans' },
];

/** Stored provider keys for the edit dialog. Labels match the list, not a guessed vendor. */
export const ADMIN_CORE_PROVIDER_OPTIONS: AdminProviderOption[] = [
  { value: 'advps', label: 'advps', group: 'Plans' },
  { value: 'smartvps', label: 'smartvps', group: 'Plans' },
  { value: 'netbay', label: 'netbay', group: 'Plans' },
  { value: 'trialvps', label: 'trial', group: 'Plans' },
  { value: 'slotip', label: 'slot', group: 'Plans' },
  { value: 'reseller-api', label: 'reseller-api', group: 'Plans' },
  { value: 'hostycare', label: 'hostycare', group: 'Other' },
  { value: 'kurohost', label: 'kurohost', group: 'Other' },
  { value: 'joy', label: 'joy', group: 'Other' },
  { value: 'hostdzire', label: 'hostdzire', group: 'Other' },
  { value: 'virtualizor', label: 'virtualizor', group: 'Other' },
  { value: 'oceanlinux', label: 'oceanlinux', group: 'Other' },
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

  return [...ADMIN_PROVIDER_FILTER_CORE, ...companyOptions];
}

export function isCompanyProviderFilter(value: string) {
  return value.startsWith(ADMIN_COMPANY_PROVIDER_PREFIX);
}

export function companyIdFromProviderFilter(value: string) {
  return value.slice(ADMIN_COMPANY_PROVIDER_PREFIX.length);
}
