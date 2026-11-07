/** Optional CMS image framing. Only numeric geometry crosses the public API. */
export type PartnerImageLayout = {
  mode: 'LOGO' | 'BANNER';
  aspectWidth?: number; aspectHeight?: number;
  scale?: number; positionX?: number; positionY?: number;
};

export function readPartnerImageLayout(raw: unknown): PartnerImageLayout | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const mode = value.mode;
  if (mode !== 'LOGO' && mode !== 'BANNER') return undefined;
  const bounds = { aspectWidth: [0.1, 100], aspectHeight: [0.1, 100],
    scale: [50, 300], positionX: [0, 100], positionY: [0, 100] } as const;
  if (Object.keys(value).some(key => key !== 'mode' && !Object.prototype.hasOwnProperty.call(bounds,key))) return undefined;
  const result: PartnerImageLayout = { mode };
  for (const key of Object.keys(bounds) as (keyof typeof bounds)[]) {
    const number = value[key];
    if (number === undefined) continue;
    const [min, max] = bounds[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max)
      return undefined;
    result[key] = number;
  }
  if ((result.aspectWidth === undefined) !== (result.aspectHeight === undefined)) return undefined;
  if (result.aspectWidth !== undefined && result.aspectHeight !== undefined) {
    const ratio = result.aspectWidth / result.aspectHeight;
    if (ratio < 0.5 || ratio > 5) return undefined;
  }
  return result;
}
