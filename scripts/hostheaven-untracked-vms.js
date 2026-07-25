#!/usr/bin/env node
/**
 * List Hostheaven panel VMs with no matching OceanLinux order.
 * Usage: node scripts/hostheaven-untracked-vms.js [companyId]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Company = require('../src/models/companyModel').default;
const { auditHostheavenVsOrders } = require('../src/lib/hostheavenVmAudit');

async function main() {
  const companyId = process.argv[2];
  await mongoose.connect(process.env.MONGOOSE_URL);

  let company;
  if (companyId) {
    company = await Company.findById(companyId).lean();
  } else {
    company = await Company.findOne({ 'resellerApi.enabled': true }).lean();
  }

  if (!company) {
    console.error('No company with Hostheaven/reseller API enabled.');
    process.exit(1);
  }

  console.log(`Auditing: ${company.name} (${company._id})\n`);
  const report = await auditHostheavenVsOrders(company);

  console.log(`Panel VMs:     ${report.hostheavenTotalVms}`);
  console.log(`Order IPs:     ${report.oceanlinuxOrdersWithIp}`);
  console.log(`Untracked:     ${report.untrackedInOrdersCount}\n`);

  if (report.untrackedInOrdersCount === 0) {
    console.log('All panel VMs have a matching order.');
    process.exit(0);
  }

  console.log('IP\tVM ID\tServer\tExpiry\tIn inventory');
  for (const row of report.untrackedInOrders) {
    console.log(
      [
        row.ip,
        row.vmId,
        row.serverName || '-',
        row.expiryDate ? row.expiryDate.slice(0, 10) : '-',
        row.inCompanyInventory ? `yes (${row.inventoryStock})` : 'no',
      ].join('\t')
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
