/**
 * Debug Hostheaven stop for a given IP — run: node scripts/debug-reseller-stop.js 192.232.56.28
 */
const ResellerApi = require('../src/services/resellerApi');
const { RESELLER_API_DEFAULTS } = require('../src/lib/companyResellerApi');

const ip = process.argv[2] || '192.232.56.28';

async function main() {
  const api = new ResellerApi(RESELLER_API_DEFAULTS);
  console.log('Finding VM for IP:', ip);
  const found = await api.findVmByIp(ip);
  if (!found) {
    console.log('NOT FOUND');
    return;
  }
  console.log('Found vmId:', found.vmId);
  console.log('Overview raw keys:', Object.keys(found.raw || {}));
  console.log('Overview sample:', JSON.stringify({
    id: found.raw?.id,
    orderId: found.raw?.orderId,
    virtualMachineId: found.raw?.virtualMachineId,
    vmId: found.raw?.vmId,
    liveState: found.raw?.liveState,
    status: found.raw?.status,
    locked: found.raw?.locked,
    ip: found.raw?.ip || found.raw?.ipAddress,
  }, null, 2));

  const before = await api.resolveVmPowerState(found.vmId, { overviewRaw: found.raw });
  console.log('Power BEFORE:', before);

  try {
    const details = await api.getVmDetails(found.vmId);
    console.log('Details keys:', Object.keys(details || {}));
    console.log('Details VM ids:', {
      id: details?.id,
      virtualMachineId: details?.virtualMachineId,
      vmId: details?.vmId,
      liveState: details?.liveState,
      status: details?.status,
    });
  } catch (e) {
    console.log('getVmDetails error:', e.message);
  }

  if (process.argv.includes('--start')) {
    console.log('Sending START to vmId', found.vmId);
    try {
      const res = await api.start(found.vmId);
      console.log('Start response:', JSON.stringify(res, null, 2));
    } catch (e) {
      console.log('Start error:', e.message, e.body);
    }
    await new Promise((r) => setTimeout(r, 15000));
    const mid = await api.resolveVmPowerState(found.vmId, { overviewRaw: null });
    console.log('Power AFTER start:', mid);
  }

  if (process.argv.includes('--stop')) {
    console.log('Sending STOP to vmId', found.vmId);
    try {
      const res = await api.stop(found.vmId);
      console.log('Stop response:', JSON.stringify(res, null, 2));
    } catch (e) {
      console.log('Stop error:', e.message, e.body);
    }
    await new Promise((r) => setTimeout(r, 5000));
    const after = await api.resolveVmPowerState(found.vmId, { overviewRaw: null });
    console.log('Power AFTER (fresh):', after);
  } else {
    console.log('Dry run — pass --stop to actually send stop command');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
