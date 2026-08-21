import mongoose from 'mongoose';

/**
 * One Virtualizor enduser panel a company has access to.
 * The order page treats `virtualizors` as a fail-over chain: if the first
 * panel can't see the VM (or is unreachable), the next one is tried.
 */
const companyVirtualizorSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  label: { type: String, default: '' },
  host: { type: String, default: '' },
  port: { type: Number, default: 4083 },
  apiKey: { type: String, default: '' },
  apiPassword: { type: String, default: '' },
  protocol: { type: String, enum: ['http', 'https'], default: 'https' },
});

/**
 * Legacy single-config schema. Kept so older documents still load; new edits
 * always go to `virtualizors[]`.
 */
const legacyCompanyVirtualizorSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  host: { type: String, default: '' },
  port: { type: Number, default: 4083 },
  apiKey: { type: String, default: '' },
  apiPassword: { type: String, default: '' },
  protocol: { type: String, enum: ['http', 'https'], default: 'https' },
}, { _id: false });

/**
 * External "reseller" hosting panel API (e.g. Hostheaven / SomaniOne style).
 * When enabled, this lets a company's orders be controlled via that panel's
 * documented HTTP API (login → JWT, list VMs by IP, power/rebuild/MAC).
 *
 * This is an alternative to `virtualizors[]`. Only one automation source is
 * used per order — Virtualizor takes priority when both are configured.
 */
const companyResellerApiSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  label: { type: String, default: '' },
  baseUrl: { type: String, default: '' },        // e.g. https://vps.hostheaven.in
  resellerDomain: { type: String, default: '' }, // X-Reseller-Domain header value
  email: { type: String, default: '' },
  password: { type: String, default: '' },
  /** When true, IP stock follows GET /api/users/zones (per-plan zoneId) or wallet fallback. */
  useLiveStockApi: { type: Boolean, default: false },
  /** Default Hostheaven upstream coupon for auto-buy when stock has none set. */
  couponCode: { type: String, default: '' },
  /** Per-RAM panel coupons, e.g. { "4GB": "OCEAN199", "8GB": "WINPROMO" }. */
  couponByMemory: { type: Map, of: String, default: undefined },
}, { _id: false });

/**
 * Netbay reseller API automation (https://api.netbayhosts.in style).
 * When enabled, IP stocks linked to this company can auto-provision VMs
 * (POST /services/purchase) and run lifecycle actions (start/stop/reboot/
 * rebuild) without going through Virtualizor. Auth is a static API key +
 * secret pair generated from the Netbay dashboard.
 *
 * Like `resellerApi`, this is one of several mutually-exclusive automation
 * sources; the ipStock + order context decides which one is used at runtime.
 */
const companyNetbayApiSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  label: { type: String, default: '' },
  baseUrl: { type: String, default: '' }, // e.g. https://api.netbayhosts.in
  apiKey: { type: String, default: '' },     // X-API-Key   — public key id
  apiSecret: { type: String, default: '' },  // X-API-Secret — private secret
  /** Netbay-side coupon sent as `couponCode` on purchase — discounts OUR Netbay wallet charge. */
  couponCode: { type: String, default: '' },
  /** Per-RAM (or per proxy IP range) coupon override; `couponCode` is the fallback. */
  couponByMemory: { type: Map, of: String, default: undefined },
  /** Netbay wallet coupon for Linux VM auto-buy. */
  couponLinux: { type: String, default: '' },
  /** Netbay wallet coupon for Windows VPS auto-buy. */
  couponVps: { type: String, default: '' },
  /** Netbay wallet coupon for proxy auto-buy (POST /proxies/purchase). */
  couponProxy: { type: String, default: '' },
  /** When true, IP stock availability follows GET /services/stock. When false, use stockCount per plan. */
  useLiveStockApi: { type: Boolean, default: false },
}, { _id: false });

/**
 * KuroHost Cloud Platform API (https://kurohost.com/cloud/docs).
 * PAYG VM control plane — create instances, power actions, terminate.
 * Auth: Bearer kuro_<secret> (single API key, no secret pair).
 */
const companyKurohostApiSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  label: { type: String, default: '' },
  baseUrl: { type: String, default: '' }, // e.g. https://kurohost.com/api/cloud/v1
  apiKey: { type: String, default: '' },   // Bearer kuro_…
  /** Reserved — KuroHost has no stock API yet; manual stockCount when false. */
  useLiveStockApi: { type: Boolean, default: false },
}, { _id: false });

/**
 * Joy Services instances API (https://docs.joy.services/instance-api/).
 * MANAGE-ONLY: this API exposes dashboard/account/machine info and power
 * actions (start/stop/reboot/pause/hibernate) — there is NO buy/create/provision
 * endpoint. So Joy-linked servers are created manually in the Joy panel; here we
 * only let users power-manage + see status of their existing machine (matched by
 * IP via the machine_list operation).
 *
 * Auth: two headers on POST /api/connect — x-api-token + x-api-key.
 */
const companyJoyApiSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  label: { type: String, default: '' },
  baseUrl: { type: String, default: '' },   // e.g. https://api.joy.services
  apiToken: { type: String, default: '' },  // x-api-token — primary token id
  apiKey: { type: String, default: '' },    // x-api-key   — associated key
}, { _id: false });

const companySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  virtualizors: { type: [companyVirtualizorSchema], default: [] },
  virtualizor: { type: legacyCompanyVirtualizorSchema, default: null }, // deprecated
  resellerApi: { type: companyResellerApiSchema, default: null },
  netbayApi: { type: companyNetbayApiSchema, default: null },
  kurohostApi: { type: companyKurohostApiSchema, default: null },
  joyApi: { type: companyJoyApiSchema, default: null },
}, { timestamps: true });

companySchema.index({ slug: 1 });

// Next.js hot-reload can cache an old schema — re-register when new paths were added.
if (
  mongoose.models.Company &&
  (!mongoose.models.Company.schema.paths['netbayApi.useLiveStockApi'] ||
    !mongoose.models.Company.schema.paths['netbayApi.couponCode'] ||
    !mongoose.models.Company.schema.paths['netbayApi.couponLinux'] ||
    !mongoose.models.Company.schema.paths['netbayApi.couponVps'] ||
    !mongoose.models.Company.schema.paths['netbayApi.couponProxy'] ||
    !mongoose.models.Company.schema.paths['kurohostApi.apiKey'] ||
    !mongoose.models.Company.schema.paths['joyApi.apiToken'] ||
    !mongoose.models.Company.schema.paths['resellerApi.useLiveStockApi'])
) {
  delete mongoose.models.Company;
}

export default mongoose.models.Company || mongoose.model('Company', companySchema);
