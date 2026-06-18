require('dotenv').config();
const SmartVpsAPI = require('../src/services/smartvpsApi');

const IP = '103.225.205.184';

async function main() {
  const api = new SmartVpsAPI();
  const raw = await api.status(IP);
  console.log('=== RAW status type ===', typeof raw);
  console.log(JSON.stringify(raw, null, 2).slice(0, 4000));

  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch (e) { /* keep */ }
  }
  if (parsed && typeof parsed === 'object' && Object.keys(parsed).every((k) => !isNaN(Number(k)))) {
    const jsonString = Object.keys(parsed)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map((k) => parsed[k])
      .join('');
    try { parsed = JSON.parse(jsonString); } catch (e) { /* keep */ }
  }

  console.log('\n=== PARSED ===');
  console.log(JSON.stringify(parsed, null, 2));

  const { PowerStatus, MachineStatus, ActionStatus } = parsed || {};
  console.log('\n=== FIELDS ===', { PowerStatus, MachineStatus, ActionStatus });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
