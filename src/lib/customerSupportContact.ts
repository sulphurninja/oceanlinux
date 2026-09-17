/** Public storefront support: WhatsApp when configured, else support tickets. */

export type PublicSupportSettings = {
  WHATSAPP_NUMBER?: string;
  WHATSAPP_MESSAGE?: string;
  SUPPORT_EMAIL?: string;
};

export function normalizeWhatsAppNumber(raw: unknown): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8) return '';
  return trimmed.replace(/[\s\-()]/g, '');
}

export function buildWhatsAppChatUrl(number: unknown, message: unknown): string | null {
  const clean = normalizeWhatsAppNumber(number);
  if (!clean) return null;
  const waDigits = clean.replace(/^\+/, '');
  const text = encodeURIComponent(
    String(message ?? '').trim() || 'Hi! I need help with OceanLinux services.'
  );
  return `https://wa.me/${waDigits}?text=${text}`;
}

export async function fetchPublicSupportSettings(): Promise<PublicSupportSettings> {
  try {
    const res = await fetch('/api/settings', { credentials: 'include' });
    if (!res.ok) return {};
    const data = await res.json();
    return (data.settings ?? {}) as PublicSupportSettings;
  } catch {
    return {};
  }
}

export function openWhatsAppSupport(number: unknown, message: unknown): boolean {
  const url = buildWhatsAppChatUrl(number, message);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

type ContactSupportOptions = {
  router: { push: (path: string) => void };
  ticketPath?: string;
  message?: string;
  settings?: PublicSupportSettings;
};

/** Opens WhatsApp chat or navigates to tickets if no valid WhatsApp number. */
export async function contactCustomerSupport({
  router,
  ticketPath = '/dashboard/support/tickets',
  message,
  settings: preloadedSettings,
}: ContactSupportOptions): Promise<'whatsapp' | 'ticket'> {
  const settings = preloadedSettings ?? (await fetchPublicSupportSettings());
  const defaultMsg =
    String(settings.WHATSAPP_MESSAGE ?? '').trim() || 'Hi! I need help with OceanLinux services.';
  const extra = message?.trim();
  const fullMessage = extra ? `${defaultMsg}\n\n${extra}` : defaultMsg;

  if (openWhatsAppSupport(settings.WHATSAPP_NUMBER, fullMessage)) {
    return 'whatsapp';
  }
  router.push(ticketPath);
  return 'ticket';
}
