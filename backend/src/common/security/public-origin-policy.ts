/** The owner connected the USD apex through CloudPub before the final SEO cutover.
 * Accept browser requests from that one verified site without switching
 * FRONTEND_URL, cookies, DNS or the existing fail-closed Ubuntu deploy gates.
 *
 * Deliberately narrow: only an explicit production allowlist containing the
 * existing USD app origin gains the exact HTTPS apex; no wildcard, subdomains
 * or cross-domain aliases. The final canonical/email cutover remains opt-in.
 */
export function withApprovedUsdApexOrigin(origins: readonly string[], isProduction: boolean): string[] {
  const result = [...new Set(origins)];
  const prerelease = 'https://app.usd-russia.ru';
  const apex = 'https://usd-russia.ru';
  if (isProduction && result.includes(prerelease) && !result.includes(apex)) {
    result.push(apex);
  }
  return result;
}
