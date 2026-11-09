export type TeamStandingSort = 'NAME' | 'FIRST_PLACES' | 'PODIUMS' | 'PERFORMANCES';

export type TeamStandingCounts = {
  teamId: string;
  teamName: string;
  firstPlaces: number;
  podiums: number;
  performances: number;
};

/** Transparent user-selected sorting only; never assign ranks or combine measurement units. */
export function sortTeamStandings<T extends TeamStandingCounts>(
  teams: readonly T[],
  sort: TeamStandingSort,
): T[] {
  const nameOrder = (a: T, b: T) =>
    a.teamName.localeCompare(b.teamName, 'ru') || a.teamId.localeCompare(b.teamId);
  const metric = sort === 'FIRST_PLACES' ? 'firstPlaces'
    : sort === 'PODIUMS' ? 'podiums'
    : sort === 'PERFORMANCES' ? 'performances'
    : null;
  return [...teams].sort((a, b) => (metric ? b[metric] - a[metric] : 0) || nameOrder(a, b));
}
