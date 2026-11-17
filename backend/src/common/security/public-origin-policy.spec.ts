import { withApprovedUsdApexOrigin } from './public-origin-policy';

describe('USD public origin policy', () => {
  const staging = 'https://app.usd-russia.ru';
  const apex = 'https://usd-russia.ru';

  it('allows browsers from the newly connected apex while preserving the prerelease origin', () => {
    expect(withApprovedUsdApexOrigin([staging], true)).toEqual([staging, apex]);
  });

  it('keeps an explicitly configured approved apex without duplication', () => {
    expect(withApprovedUsdApexOrigin([staging, apex], true)).toEqual([staging, apex]);
  });

  it('does not extend arbitrary development or unrelated origins', () => {
    expect(withApprovedUsdApexOrigin(['http://localhost:5173'], false)).toEqual(['http://localhost:5173']);
    expect(withApprovedUsdApexOrigin([staging], false)).toEqual([staging]);
    expect(withApprovedUsdApexOrigin(['https://other.example'], true)).toEqual(['https://other.example']);
  });

  it('never adds a wildcard, insecure HTTP apex, or an attacker lookalike', () => {
    const result = withApprovedUsdApexOrigin([staging, 'https://usd-russia.ru.evil.example'], true);
    expect(result).toEqual([staging, 'https://usd-russia.ru.evil.example', apex]);
    expect(result).not.toContain('*');
    expect(result).not.toContain('http://usd-russia.ru');
  });
});
