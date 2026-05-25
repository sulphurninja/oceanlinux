/**
 * Helpers for resolving a company's external reseller-panel API config
 * (Hostheaven / SomaniOne style — see /docs and `services/resellerApi.js`).
 *
 * Hardcoded defaults: when a company has `resellerApi.enabled = true` but
 * leaves any of (baseUrl, email, password) blank, we fall back to the
 * Hostheaven account below. This keeps the admin flow trivial — flip the
 * Enabled switch and save, no credentials needed.
 *
 * Companies can still override individual fields (e.g. point a different
 * panel) by filling them in explicitly; non-empty values always win over
 * the defaults.
 */

const RESELLER_API_DEFAULTS = Object.freeze({
  baseUrl: 'https://vps.hostheaven.in',
  resellerDomain: 'vps.hostheaven.in',
  email: 'raftare3t5@gmail.com',
  password: 'Umesh@2113',
});

function getCompanyResellerApiConfig(company) {
  if (!company) return null;
  const cfg = company.resellerApi;
  if (!cfg) return null;
  if (!cfg.enabled) return null;

  const baseUrl = (cfg.baseUrl || '').trim() || RESELLER_API_DEFAULTS.baseUrl;
  const email = (cfg.email || '').trim() || RESELLER_API_DEFAULTS.email;
  const password = cfg.password || RESELLER_API_DEFAULTS.password;
  // resellerDomain auto-derives from the baseUrl host inside ResellerApi if
  // left blank, but we still seed the default when the saved baseUrl matches
  // the default (most common case).
  let resellerDomain = (cfg.resellerDomain || '').trim();
  if (!resellerDomain && baseUrl === RESELLER_API_DEFAULTS.baseUrl) {
    resellerDomain = RESELLER_API_DEFAULTS.resellerDomain;
  }

  if (!baseUrl || !email || !password) return null;

  return {
    enabled: true,
    label: cfg.label || '',
    baseUrl,
    resellerDomain,
    email,
    password,
  };
}

function hasCompanyResellerApi(company) {
  return !!getCompanyResellerApiConfig(company);
}

module.exports = {
  RESELLER_API_DEFAULTS,
  getCompanyResellerApiConfig,
  hasCompanyResellerApi,
};
