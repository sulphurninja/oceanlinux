/**
 * SmartVPS package names are IP prefixes like 103.148 / 103.82.72 / 103.83.x.
 * Never strip all letters from "🌊 103.148 - 8GB Vps" — that produced 103.1488.
 */
function extractSmartVpsIpPrefix(productName) {
  const raw = String(productName || '');
  const withoutSize = raw
    .replace(/\b\d+\s*GB(?:\s*Vps)?\b/gi, ' ')
    .replace(/\b\d+\s*MB\b/gi, ' ')
    .replace(/\b\d+\s*vCPU\b/gi, ' ');

  const match = withoutSize.match(/(\d{1,3}(?:\.\d{1,3}){1,2}(?:\.x+|\.\d{1,3})?)/i);
  if (match) return match[1];

  const fromOriginal = raw.match(/(\d{1,3}(?:\.\d{1,3}){1,2}(?:\.x+)?)/i);
  return fromOriginal ? fromOriginal[1] : '';
}

module.exports = { extractSmartVpsIpPrefix };
