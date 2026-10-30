/** 08:00–11:59 Asia/Kolkata — keep the store and manage APIs off heavy cron work. */

function getHourInTimeZone(timeZone, date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(date)
  );
  return hour === 24 ? 0 : hour;
}

function isIstPeakTrafficHour(date = new Date()) {
  const hour = getHourInTimeZone('Asia/Kolkata', date);
  return hour >= 8 && hour < 12;
}

function istPeakSkipBody() {
  return {
    success: true,
    skipped: true,
    reason: 'ist_peak_8_12',
  };
}

module.exports = {
  isIstPeakTrafficHour,
  istPeakSkipBody,
  getHourInTimeZone,
};
