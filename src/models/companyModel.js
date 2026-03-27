import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

companySchema.index({ slug: 1 });

export default mongoose.models.Company || mongoose.model('Company', companySchema);
