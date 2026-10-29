import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readReleaseInfo } from './release-info';

describe('public release metadata', () => {
  let directory: string;
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'usd-release-')); });
  afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

  it('returns only the immutable image revision', () => {
    const file = join(directory, 'usd-release.json');
    const revision = 'a'.repeat(40);
    writeFileSync(file, JSON.stringify({ revision, unrelated: 'never exposed' }));
    expect(readReleaseInfo(file)).toEqual({ revision });
  });

  it('cannot turn missing, malformed or non-SHA metadata into a release claim', () => {
    const file = join(directory, 'usd-release.json');
    expect(readReleaseInfo(file).revision).toBe('development');
    for (const value of ['invalid json', '{"revision":"main"}', '{"revision":null}']) {
      writeFileSync(file, value);
      expect(readReleaseInfo(file).revision).toBe('development');
    }
  });
});
