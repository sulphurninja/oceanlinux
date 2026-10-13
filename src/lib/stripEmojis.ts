/** Remove emoji characters from marketing copy for a cleaner, professional UI. */
/** Display-only: drop emoji/pictograph characters but keep the rest of the name untouched
 *  (no spacing changes, so IPs like 103.173.xx stay exact). */
export function removeEmojiKeepText(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function stripEmojis(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, " ")
    .replace(/([\d.])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])([\d.])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();
}