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

const companySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  virtualizors: { type: [companyVirtualizorSchema], default: [] },
  virtualizor: { type: legacyCompanyVirtualizorSchema, default: null }, // deprecated
}, { timestamps: true });

companySchema.index({ slug: 1 });

export default mongoose.models.Company || mongoose.model('Company', companySchema);
