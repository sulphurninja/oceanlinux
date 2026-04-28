/**
 * After ADVPS rebuild/format, the new login password only comes from generate-password.
 * This module retries that call (long HTTP timeout + spaced delays) until ADVPS responds,
 * then writes the password onto the order.
 */

const ADVPS_REBUILD_GENERATE_PASSWORD_TIMEOUT_MS = 120_000;

/** Delays between generate-password attempts (ms); first attempt is immediate after boot wait. */
const ADVPS_REBUILD_PASSWORD_RETRY_DELAYS_MS = [
  0, 30_000, 45_000, 60_000, 90_000, 120_000, 120_000, 120_000,
];

/**
 * @param {object} params
 * @param {object} params.api - AdvpsAPI instance
 * @param {object} params.Order - Mongoose Order model
 * @param {string} params.rebuildOrderId
 * @param {string} params.rebuildServiceId
 * @param {string} params.logPrefix e.g. "[ADVPS-ACTION]" or "[INTERNAL-ADVPS]"
 */
async function runAdvpsPostRebuildGeneratePasswordFlow({
  api,
  Order,
  rebuildOrderId,
  rebuildServiceId,
  logPrefix,
}) {
  try {
    await api.start(rebuildServiceId);
    console.log(`${logPrefix} Post-rebuild start sent for ${rebuildServiceId}`);
  } catch (startErr) {
    console.log(`${logPrefix} Post-rebuild start: ${startErr.message} (may already be running)`);
  }

  await new Promise((r) => setTimeout(r, 45_000));

  for (let attempt = 0; attempt < ADVPS_REBUILD_PASSWORD_RETRY_DELAYS_MS.length; attempt++) {
    const waitMs = ADVPS_REBUILD_PASSWORD_RETRY_DELAYS_MS[attempt];
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

    try {
      const passRes = await api.generatePassword(rebuildServiceId, {
        timeoutMs: ADVPS_REBUILD_GENERATE_PASSWORD_TIMEOUT_MS,
      });
      const pd = passRes?.data || {};
      const newPass = pd.password || pd.newPassword || pd.existingPassword;
      console.log(
        `${logPrefix} Post-rebuild generate-password attempt ${attempt + 1}/${ADVPS_REBUILD_PASSWORD_RETRY_DELAYS_MS.length}: ` +
          `status=${pd.status}, hasPassword=${!!newPass}`
      );

      if (newPass) {
        console.log(`${logPrefix} 🔑 POST-REBUILD NEW PASSWORD for service=${rebuildServiceId} order=${rebuildOrderId}`);
        for (let dbAttempt = 0; dbAttempt < 5; dbAttempt++) {
          try {
            await Order.findByIdAndUpdate(rebuildOrderId, {
              password: newPass,
              provisioningStatus: 'active',
              provisioningError: '',
            });
            console.log(`${logPrefix} ✅ New password saved to order (DB attempt ${dbAttempt + 1})`);
            return;
          } catch (dbErr) {
            console.error(`${logPrefix} ❌ DB save ${dbAttempt + 1}/5:`, dbErr.message);
            if (dbAttempt < 4) await new Promise((r) => setTimeout(r, 2000));
          }
        }
        console.error(`${logPrefix} 🚨 Password from ADVPS but all DB saves failed for order ${rebuildOrderId}`);
        return;
      }
    } catch (passErr) {
      const msg = passErr.message || '';
      console.log(`${logPrefix} Post-rebuild generate-password error (attempt ${attempt + 1}): ${msg}`);

      const existingMatch = msg.match(/existingPassword[:\s]+"?([^"}\s,]+)/);
      if (existingMatch) {
        const extractedPass = existingMatch[1];
        console.log(`${logPrefix} 🔑 Extracted existingPassword from error`);
        await Order.findByIdAndUpdate(rebuildOrderId, {
          password: extractedPass,
          provisioningStatus: 'active',
          provisioningError: '',
        });
        return;
      }

      if (msg.includes('must be running')) {
        console.log(`${logPrefix} Server not ready for generate-password (attempt ${attempt + 1})`);
        continue;
      }
    }
  }

  console.error(`${logPrefix} Post-rebuild: generate-password exhausted for order ${rebuildOrderId}`);
  await Order.findByIdAndUpdate(rebuildOrderId, {
    provisioningStatus: 'active',
    provisioningError:
      'Rebuild finished but ADVPS did not return a new password in time. Use Sync later or run generate-password again from ADVPS.',
  });
}

module.exports = {
  ADVPS_REBUILD_GENERATE_PASSWORD_TIMEOUT_MS,
  runAdvpsPostRebuildGeneratePasswordFlow,
};
