/**
 * Debug Hostycare reinstall lookup for a specific IP/service.
 * Usage: node scripts/debug-hostycare-reinstall.js
 */
require('dotenv').config();
const { VirtualizorAPI } = require('../src/services/virtualizorApi');
const HostycareAPI = require('../src/services/hostycareApi');

const IP = '103.215.97.14:49965';
const SERVICE_ID = '58423';

async function main() {
  console.log('=== Virtualizor findVpsId ===');
  const vz = new VirtualizorAPI();
  const found = await vz.findVpsId({ ip: IP });
  console.log('findVpsId result:', found);

  console.log('\n=== Hostycare getServiceDetails ===');
  const hc = new HostycareAPI();
  try {
    const details = await hc.getServiceDetails(SERVICE_ID);
    console.log(JSON.stringify(details, null, 2).slice(0, 3000));
  } catch (e) {
    console.error('getServiceDetails failed:', e.message);
  }

  try {
    const info = await hc.getServiceInfo(SERVICE_ID);
    console.log('\n=== Hostycare getServiceInfo (trimmed) ===');
    console.log(JSON.stringify(info, null, 2).slice(0, 2000));
  } catch (e) {
    console.error('getServiceInfo failed:', e.message);
  }

  console.log('\n=== Hostycare getReinstallTemplates ===');
  try {
    const tpl = await hc.getReinstallTemplates(SERVICE_ID);
    console.log(JSON.stringify(tpl, null, 2).slice(0, 3000));
  } catch (e) {
    console.error('getReinstallTemplates failed:', e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
