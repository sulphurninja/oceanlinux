/**
 * Lightweight probes for ZeptoMail / Resend before bulk sends.
 * Avoids blasting 4000+ users when providers are quota-blocked.
 */

const ZEPTOMAIL_DEFAULT_API_URL = 'https://api.zeptomail.in/v1.1/email';

function zeptomailAuthHeader(key) {
  const trimmed = String(key).trim();
  if (trimmed.toLowerCase().startsWith('zoho-enczapikey')) return trimmed;
  return `Zoho-enczapikey ${trimmed}`;
}

function getZeptoFromAddress() {
  return (
    process.env.ZEPTOMAIL_FROM ||
    process.env.ZEPTOMAIL_FROM_EMAIL ||
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM_EMAIL ||
    'hello@oceanlinux.com'
  );
}

function parseZeptoError(body) {
  const details = body?.error?.details || [];
  const codes = details.map((d) => d.code).filter(Boolean);
  const messages = details.map((d) => d.message).filter(Boolean);
  return {
    code: body?.error?.code,
    message: body?.error?.message || 'ZeptoMail error',
    subCodes: codes,
    details: messages,
    trialLimitExceeded: codes.includes('SM_133'),
    dailyLimitExceeded: codes.includes('SMI_115'),
    creditsExpired: codes.includes('LE_101'),
    senderNotVerified: codes.includes('SM_111'),
    accountBlocked: codes.includes('AE_101'),
  };
}

async function probeZeptoMail() {
  const key = process.env.ZEPTOMAIL_API_KEY || process.env.ZEPTOMAIL_SEND_TOKEN;
  if (!key) {
    return { configured: false, ok: false, reason: 'ZEPTOMAIL_API_KEY not set' };
  }

  const from = getZeptoFromAddress();
  const apiUrl = process.env.ZEPTOMAIL_API_URL || ZEPTOMAIL_DEFAULT_API_URL;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: zeptomailAuthHeader(key),
      },
      body: JSON.stringify({
        from: { address: from, name: process.env.EMAIL_FROM_NAME || 'OceanLinux' },
        to: [{ email_address: { address: 'healthcheck@oceanlinux.invalid' } }],
        subject: 'OceanLinux provider health check',
        htmlbody: '<p>health check — do not deliver</p>',
      }),
    });

    const body = await response.json().catch(() => ({}));
    const parsed = parseZeptoError(body);

    // Invalid recipient still means API + sender are OK (quota not hit yet).
    if (parsed.subCodes.includes('SM_113') || parsed.message.toLowerCase().includes('invalid')) {
      return {
        configured: true,
        ok: true,
        from,
        provider: 'zeptomail',
        note: 'API reachable; sender verified',
      };
    }

    if (response.ok) {
      return { configured: true, ok: true, from, provider: 'zeptomail' };
    }

    if (parsed.trialLimitExceeded || parsed.dailyLimitExceeded) {
      return {
        configured: true,
        ok: false,
        from,
        provider: 'zeptomail',
        reason:
          parsed.trialLimitExceeded
            ? 'ZeptoMail trial limit exceeded — account review ya paid credits chahiye'
            : 'ZeptoMail aaj ka daily limit (≈110) khatam — kal retry karo ya plan upgrade karo',
        ...parsed,
      };
    }

    if (parsed.senderNotVerified) {
      return {
        configured: true,
        ok: false,
        from,
        provider: 'zeptomail',
        reason: `Sender "${from}" ZeptoMail me verified nahi — Mail Agent me add karo`,
        ...parsed,
      };
    }

    if (parsed.creditsExpired) {
      return {
        configured: true,
        ok: false,
        from,
        provider: 'zeptomail',
        reason: 'ZeptoMail credits expired — naye credits khareedo',
        ...parsed,
      };
    }

    return {
      configured: true,
      ok: false,
      from,
      provider: 'zeptomail',
      reason: parsed.details.join('; ') || parsed.message,
      ...parsed,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      provider: 'zeptomail',
      reason: error.message,
    };
  }
}

async function probeResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { configured: false, ok: false, reason: 'RESEND_API_KEY not set' };
  }

  try {
    const { Resend } = require('resend');
    const client = new Resend(key);
    const from =
      process.env.EMAIL_FROM ||
      process.env.SMTP_FROM_EMAIL ||
      'noreply@updates.oceanlinux.com';

    const result = await client.emails.send({
      from: `OceanLinux <${from}>`,
      to: ['healthcheck@oceanlinux.invalid'],
      subject: 'OceanLinux provider health check',
      html: '<p>health check</p>',
    });

    if (result.error) {
      const msg = result.error.message || 'Resend error';
      const monthlyQuota = /monthly email sending quota/i.test(msg);
      const dailyQuota = /daily email sending quota/i.test(msg);
      return {
        configured: true,
        ok: false,
        provider: 'resend',
        reason: monthlyQuota
          ? 'Resend monthly quota khatam — plan upgrade ya next month'
          : dailyQuota
            ? 'Resend daily quota khatam — kal retry'
            : msg,
        monthlyQuota,
        dailyQuota,
      };
    }

    return { configured: true, ok: true, provider: 'resend' };
  } catch (error) {
    return { configured: true, ok: false, provider: 'resend', reason: error.message };
  }
}

/**
 * Returns whether at least one bulk-capable HTTP provider can send right now.
 * GoDaddy SMTP is intentionally excluded — not reliable for 1000+ marketing blasts.
 */
async function checkBulkEmailReadiness() {
  const [zepto, resend] = await Promise.all([probeZeptoMail(), probeResend()]);

  const zeptoOk = zepto.ok;
  const resendOk = resend.ok;

  let recommended = null;
  if (zeptoOk) recommended = 'zeptomail';
  else if (resendOk) recommended = 'resend';

  const ready = zeptoOk || resendOk;

  let summary;
  if (ready) {
    summary = `Bulk email ready via ${recommended}`;
  } else if (zepto.configured && !zepto.ok) {
    summary = zepto.reason;
  } else if (resend.configured && !resend.ok) {
    summary = resend.reason;
  } else {
    summary = 'Koi email provider configured nahi';
  }

  return {
    ready,
    recommended,
    summary,
    zepto,
    resend,
    smtpNotBulkSafe:
      'GoDaddy SMTP sirf ~250 email/day — 4000+ announcement ke liye use mat karo',
  };
}

module.exports = {
  probeZeptoMail,
  probeResend,
  checkBulkEmailReadiness,
  parseZeptoError,
  isZeptoQuotaError(errorOrParsed) {
    const text = typeof errorOrParsed === 'string'
      ? errorOrParsed
      : [
          errorOrParsed?.message,
          ...(errorOrParsed?.subCodes || []),
          ...(errorOrParsed?.details || []),
        ].join(' ');
    return /SM_133|SMI_115|trial mail sending limit|per day limit exhausted|credit exhausted|LE_101|LE_102/i.test(
      text
    );
  },
};
