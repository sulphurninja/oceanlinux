/** Predefined sites for proxy reachability checks (whitelist only — no arbitrary URLs). */
const PROXY_CHECK_TARGETS = [
  {
    id: 'irctc',
    label: 'IRCTC',
    url: 'https://www.irctc.co.in',
    category: 'India',
    preferGet: true,
    headersOnly: true,
    probeUrls: [
      'https://www.irctc.co.in/nget/assets/images/logo.png',
      'https://www.irctc.co.in',
    ],
    probeHeaders: {
      Referer: 'https://www.irctc.co.in/',
      Origin: 'https://www.irctc.co.in',
    },
  },
  { id: 'google', label: 'Google', url: 'https://www.google.com/generate_204', category: 'General' },
  { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com', category: 'General' },
  { id: 'facebook', label: 'Facebook', url: 'https://www.facebook.com', category: 'Social' },
  { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com', category: 'Social' },
  { id: 'twitter', label: 'X (Twitter)', url: 'https://x.com', category: 'Social' },
  { id: 'whatsapp', label: 'WhatsApp Web', url: 'https://web.whatsapp.com', category: 'Social' },
  { id: 'amazon_in', label: 'Amazon India', url: 'https://www.amazon.in', category: 'Shopping' },
  { id: 'flipkart', label: 'Flipkart', url: 'https://www.flipkart.com', category: 'Shopping' },
  { id: 'paytm', label: 'Paytm', url: 'https://paytm.com', category: 'India' },
  { id: 'netflix', label: 'Netflix', url: 'https://www.netflix.com', category: 'Streaming' },
  { id: 'hotstar', label: 'Hotstar / JioCinema', url: 'https://www.jiocinema.com', category: 'Streaming' },
  { id: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com', category: 'General' },
  { id: 'microsoft', label: 'Microsoft', url: 'https://www.microsoft.com', category: 'General' },
  { id: 'cloudflare', label: 'Cloudflare', url: 'https://www.cloudflare.com', category: 'General' },
];

function getProxyCheckTarget(id) {
  return PROXY_CHECK_TARGETS.find((t) => t.id === id) || null;
}

function listProxyCheckTargets() {
  return PROXY_CHECK_TARGETS.map(({ id, label, category }) => ({ id, label, category }));
}

module.exports = { PROXY_CHECK_TARGETS, getProxyCheckTarget, listProxyCheckTargets };
