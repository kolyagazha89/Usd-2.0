import {Controller,Get,Header} from '@nestjs/common';
import {Public} from '../auth/public.decorator';
import {PrismaService} from '../prisma/prisma.service';
import {renderSitemapXml} from './seo-sitemap';

@Controller('seo')
export class SeoController{
 constructor(private readonly prisma:PrismaService){}
 @Public()
 @Get('sitemap.xml')
 @Header('Content-Type','application/xml; charset=utf-8')
 @Header('Cache-Control','public, max-age=300')
 async sitemap():Promise<string>{
  const stages=await this.prisma.stage.findMany({
   where:{status:{in:['PUBLISHED','COMPLETED']},isDeleted:false},
   select:{id:true,status:true,isDeleted:true,updatedAt:true},
   orderBy:{date:'desc'},
   take:5000,
  });
  return renderSitemapXml(process.env.FRONTEND_URL||'http://localhost:5173',stages);
 }
}
