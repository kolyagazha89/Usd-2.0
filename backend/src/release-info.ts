import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Read image-owned metadata, never an overridable deployment environment value. */
export function readReleaseInfo(file = resolve(process.cwd(), 'usd-release.json')): { revision: string } {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const revision = value && typeof value === 'object' && 'revision' in value ? value.revision : undefined;
    return { revision: typeof revision === 'string' && /^[a-f0-9]{40}$/.test(revision) ? revision : 'development' };
  } catch {
    return { revision: 'development' };
  }
}
