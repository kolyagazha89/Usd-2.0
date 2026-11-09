import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { compareSeasons, summarizeSeason } from './season-summary';

@Injectable()
export class SeasonReportsService {
 constructor(private readonly prisma:PrismaService){}
 /** Batch reads: four queries regardless of the number of athletes or stages. */
 async getReport(seasonId:string,comparisonSeasonId?:string){
  const validId=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  if(!validId(seasonId)||(comparisonSeasonId!==undefined&&(!validId(comparisonSeasonId)||comparisonSeasonId===seasonId))){
   throw new BadRequestException('Выберите два разных действительных сезона для сравнения');
  }
  const ids=[...new Set([seasonId,comparisonSeasonId].filter((id):id is string=>Boolean(id)))];
  const [seasons,stages,registrations,records]=await Promise.all([
   this.prisma.season.findMany({where:{id:{in:ids}},select:{id:true,name:true,year:true}}),
   this.prisma.stage.findMany({where:{seasonId:{in:ids},isDeleted:false},select:{id:true,seasonId:true,stageNumber:true,name:true,status:true,date:true},orderBy:[{seasonId:'asc'},{stageNumber:'asc'}]}),
   this.prisma.registration.findMany({
    where:{stage:{seasonId:{in:ids},isDeleted:false}},
    select:{id:true,stageId:true,participantId:true,status:true,participantNumber:true,teamIdAtInspection:true,teamNameAtInspection:true,
     participant:{select:{createdAt:true,city:true,team:true}},
     classes:{select:{id:true,classId:true,numberId:true,
      class:{select:{id:true,name:true,sortOrder:true,direction:{select:{id:true,name:true,sortOrder:true}}}},
      results:{select:{id:true,place:true}},
     }},
    },
   }),
   this.prisma.record.findMany({
    where:{seasonId:{in:ids}},
    select:{id:true,seasonId:true,class:{select:{direction:{select:{name:true}}}}},
   }),
  ]);
  // Index once: historical seasons can have thousands of registrations.
  // Avoid a stage scan for every registration and each comparison season.
  const stageSeasonById=new Map(stages.map(stage=>[stage.id,stage.seasonId]));
  const reports=ids.map(id=>{
   const season=seasons.find(item=>item.id===id);
   if(!season)throw new NotFoundException('Сезон не найден');
   return summarizeSeason({
    season,stages:stages.filter(stage=>stage.seasonId===id),
    registrations:registrations.filter(row=>stageSeasonById.get(row.stageId)===id),
    records:records.filter(record=>record.seasonId===id),
   });
  });
  return comparisonSeasonId
   ? {success:true,report:reports[0],comparison:compareSeasons(reports[1],reports[0])}
   : {success:true,report:reports[0]};
 }
}
