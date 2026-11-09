import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { assembleTeamStandings } from './team-standings';

const stageId = '11111111-1111-4111-8111-111111111111';
const timestamp = new Date('2026-08-09T12:00:00Z');
const performance = (id: string, teamId: string | null, participantId: string, place: number | null, unit: 'DB' | 'MPS', direction: string, at = timestamp) => ({
  id, place, value: { toString: () => unit === 'DB' ? '152.000' : '23.100' }, unit,
  registration: {
    teamIdAtInspection: teamId, teamNameAtInspection: 'Историческое имя команды',
    participant: { id: participantId, firstName: 'Иван', lastName: 'Петров' },
    stage: { id: stageId, name: 'Этап USD', city: 'Тюмень', date: at },
  },
  registrationClass: { class: { id: 'class-' + direction, name: direction + ' Open', direction: { name: direction } } },
});

describe('historically verified team standings without invented scores', () => {
  it('groups only identified team IDs, keeps official units/classes/results and never compares decibels against speed', () => {
    const rows = [
      performance('a1','team-a','p1',1,'DB','SPL'),
      performance('b1','team-b','p2',2,'MPS','BDW SPL'),
      performance('a2','team-a','p1',2,'MPS','BDW SPL'),
      performance('a3','team-a','p3',null,'DB','SPL'),
      performance('not-attributed',null,'p4',1,'DB','SPL'),
    ];
    const data = assembleTeamStandings(rows, [{id:'team-b',name:'Бета'},{id:'team-a',name:'Альфа'}], false);
    expect(data.teams.map(team => team.teamName)).toEqual(['Альфа','Бета']);
    expect(data.teams[0]).toMatchObject({
      teamId: 'team-a', performances: 3, participants: 2,
      stages: 1, firstPlaces: 1, podiums: 2,
    });
    expect(data.teams[0].results.map(r => ({id:r.id,unit:r.unit,place:r.place,direction:r.direction}))).toEqual([
      {id:'a1',unit:'DB',place:1,direction:'SPL'},
      {id:'a2',unit:'MPS',place:2,direction:'BDW SPL'},
      {id:'a3',unit:'DB',place:null,direction:'SPL'},
    ]);
    expect(data.teams[0].results[0]).toMatchObject({
      historicalTeamName:'Историческое имя команды',
      classId:'class-SPL',className:'SPL Open',
      stage:{id:stageId},participant:{id:'p1'},
    });
    expect(data.teams[0]).not.toHaveProperty('points');
    expect(data.teams[0]).not.toHaveProperty('rank');
    expect(data.total).toBe(4);
    expect(data.truncated).toBe(false);
  });

  it('marks partial data as truncated and handles removed teams using the frozen historical name', () => {
    const data = assembleTeamStandings([performance('x','team-removed','p1',3,'DB','SPL')],[],true);
    expect(data.truncated).toBe(true);
    expect(data.teams[0].teamName).toBe('Историческое имя команды');
    expect(data.teams[0].results[0].place).toBe(3);
  });

  it('returns no standings without inspection-attributed published performances',()=>{
    const data=assembleTeamStandings([], [{id:'team-a',name:'Альфа'}],false);
    expect(data).toEqual({teams:[],total:0,truncated:false});
  });
});

describe('public historical standings query',()=>{
  const db:any={
    team:{findMany:jest.fn()},
    stage:{findMany:jest.fn()},
    direction:{findMany:jest.fn()},
    result:{findMany:jest.fn()},
  };
  const service=new TeamsService(db);
  beforeEach(()=>{
    jest.clearAllMocks();
    db.team.findMany.mockResolvedValue([{id:'team-a',name:'Альфа'}]);
    db.stage.findMany.mockResolvedValue([{id:stageId,name:'Этап USD',city:'Тюмень',date:timestamp}]);
    db.direction.findMany.mockResolvedValue([{name:'SPL'},{name:'BDW SPL'}]);
    db.result.findMany.mockResolvedValue([performance('r1','team-a','p1',1,'DB','SPL')]);
  });

  it('filters season/stage/direction before aggregation and does not leak private or unpublished data',async()=>{
    const data=await service.publicTeamStandings({season:'2026',stageId,direction:'SPL'});
    expect(data).toMatchObject({season:'2026',stageId,direction:'SPL',total:1,truncated:false});
    expect(data.teams[0]).toMatchObject({teamName:'Альфа',firstPlaces:1});
    expect(db.result.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{
        registration: expect.objectContaining({
          teamIdAtInspection:{not:null},
          teamAffiliationCapturedAt:{not:null},
          participant:{isPublic:true},
          status:'ACTIVE',
          stage:expect.objectContaining({
            id:stageId, isDeleted:false,
            status:{in:['PUBLISHED','COMPLETED']},
            resultsPublishedAt:{not:null},
            date:{gte:new Date('2026-01-01T00:00:00.000Z'),lt:new Date('2027-01-01T00:00:00.000Z')},
          }),
        }),
        registrationClass:{class:{direction:{name:'SPL'}}},
      },
      take:5001,
    }));
    expect(data.availableStages[0].id).toBe(stageId);
    expect(data.directions).toEqual(['SPL','BDW SPL']);
  });

  it('rejects invalid public filter values without running a database query',async()=>{
    await expect(service.publicTeamStandings({season:'2026 OR 1=1'})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.publicTeamStandings({stageId:'../admin'})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.publicTeamStandings({direction:' '.repeat(200)})).rejects.toBeInstanceOf(BadRequestException);
    expect(db.result.findMany).not.toHaveBeenCalled();
  });

  it('reports the row cap explicitly instead of inventing a complete ranking',async()=>{
    db.result.findMany.mockResolvedValue(Array.from({length:5001},(_,i)=>performance('r'+i,'team-a','p1',1,'DB','SPL')));
    const data=await service.publicTeamStandings({});
    expect(data.total).toBe(5000);
    expect(data.truncated).toBe(true);
    expect(data.teams[0].performances).toBe(5000);
  });
});
