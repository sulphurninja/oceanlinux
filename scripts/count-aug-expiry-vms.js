#!/usr/bin/env bun
/**
 * Count Hostheaven panel VMs (no order) by expiry month.
 * Usage: bun scripts/count-aug-expiry-vms.js [companySlug]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Company from '../src/models/companyModel.js';
import { auditCompanyVpsReconciliation } from '../src/lib/hostheavenVmAudit.js';

const slug = process.argv[2] || 'oceanlinux';
const TARGET_MONTH = 7; // August = 7 (0-indexed)

await mongoose.connect(process.env.MONGOOSE_URL);
const company =
  (await Company.findOne({ slug: new RegExp(`^${slug}$`, 'i') }).lean()) ||
  (await Company.findOne({ 'resellerApi.enabled': true }).lean());

if (!company) {
  console.error('Company not found');
  process.exit(1);
}

const report = await auditCompanyVpsReconciliation(company);
const list = report.onPanelNotInOrders || [];

const aug = list.filter((row) => {
  if (!row.expiryDate) return false;
  return new Date(row.expiryDate).getMonth() === TARGET_MONTH;
});

console.log(`\nCompany: ${company.name} (${company.slug})`);
console.log(`Panel VMs (no order): ${list.length}`);
console.log(`August expiry (no order): ${aug.length}\n`);

if (aug.length) {
  console.log('IP\tExpiry\tInventory?');
  for (const row of aug) {
    console.log(
      [row.ip, row.expiryDate?.slice(0, 10) || '-', row.inInventory ? 'yes' : 'no'].join('\t')
    );
  }
}

await mongoose.disconnect();
