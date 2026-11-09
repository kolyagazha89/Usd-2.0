/** A factual ledger of published personal performances, not team championship points. */
export type TeamStandingResultRow = {
  id: string;
  place: number | null;
  value: { toString(): string };
  unit: string;
  registration: {
    teamIdAtInspection: string | null;
    teamNameAtInspection: string | null;
    participant: { id: string; firstName: string; lastName: string };
    stage: { id: string; name: string; city: string | null; date: Date };
  };
  registrationClass: {
    class: { id: string; name: string; direction: { name: string } };
  };
};

export function assembleTeamStandings(
  rows: readonly TeamStandingResultRow[],
  names: readonly { id: string; name: string }[],
  truncated: boolean,
) {
  const namesById = new Map(names.map(team => [team.id, team.name]));
  const groups = new Map<string, {
    teamId: string;
    teamName: string;
    performances: number;
    participants: number;
    stages: number;
    firstPlaces: number;
    podiums: number;
    results: {
      id: string;
      participant: { id: string; firstName: string; lastName: string };
      stage: { id: string; name: string; city: string | null; date: Date };
      historicalTeamName: string | null;
      classId: string;
      className: string;
      direction: string;
      place: number | null;
      value: string;
      unit: string;
    }[];
    participantIds: Set<string>;
    stageIds: Set<string>;
  }>();
  let total = 0;
  for (const row of rows) {
    const registration = row.registration;
    const teamId = registration.teamIdAtInspection;
    // Missing historical attribution MUST NOT be reconstructed from the live roster.
    if (!teamId) continue;
    total++;
    const group = groups.get(teamId) ?? {
      teamId,
      teamName: namesById.get(teamId) || registration.teamNameAtInspection || 'Команда в архиве',
      performances: 0,
      participants: 0,
      stages: 0,
      firstPlaces: 0,
      podiums: 0,
      results: [],
      participantIds: new Set<string>(),
      stageIds: new Set<string>(),
    };
    group.performances++;
    group.participantIds.add(registration.participant.id);
    group.stageIds.add(registration.stage.id);
    if (row.place === 1) group.firstPlaces++;
    if (row.place !== null && row.place >= 1 && row.place <= 3) group.podiums++;
    group.results.push({
      id: row.id,
      participant: registration.participant,
      stage: registration.stage,
      historicalTeamName: registration.teamNameAtInspection,
      classId: row.registrationClass.class.id,
      className: row.registrationClass.class.name,
      direction: row.registrationClass.class.direction.name,
      place: row.place,
      value: row.value.toString(),
      unit: row.unit,
    });
    groups.set(teamId, group);
  }
  const teams = [...groups.values()]
    .map(({ participantIds, stageIds, ...group }) => ({
      ...group,
      participants: participantIds.size,
      stages: stageIds.size,
    }))
    // No official cross-class comparison metric was approved: neutral directory order.
    .sort((a, b) => a.teamName.localeCompare(b.teamName, 'ru') || a.teamId.localeCompare(b.teamId));
  return { teams, total, truncated };
}
