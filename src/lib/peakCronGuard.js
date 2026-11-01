const { isIstPeakTrafficHour, istPeakSkipBody } = require('@/lib/istPeakTraffic');

/** Return skip payload during 8–12 IST, else null (cron may run). */
function tryPeakCronSkip() {
  if (!isIstPeakTrafficHour()) return null;
  return istPeakSkipBody();
}

module.exports = { tryPeakCronSkip };
