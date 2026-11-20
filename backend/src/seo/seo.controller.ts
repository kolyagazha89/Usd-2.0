import {Controller,Get,Header} from '@nestjs/common';
import {Public} from '../auth/public.decorator';
import {PrismaService} from '../prisma/prisma.service';
import {renderSitemapXml} from './seo-sitemap';
import {publicUsdSiteOrigin} from '../common/public-site-origin';

@Controller('seo')
export class SeoController{
 constructor(private readonly prisma:PrismaService){}
 @Public()
 @Get('sitemap.xml')
 @Header('Content-Type','application/xml; charset=utf-8')
 @Header('Cache-Control','public, max-age=300')
 async sitemap():Promise<string>{
  const [stages,siteSettings]=await Promise.all([
   this.prisma.stage.findMany({
   where:{status:{in:['PUBLISHED','COMPLETED']},isDeleted:false},
   select:{id:true,status:true,isDeleted:true,updatedAt:true},
   orderBy:{date:'desc'},
   take:5000,
   }),
   this.prisma.siteSettings.findUnique({where:{id:'default'},select:{news:true}}),
  ]);
  return renderSitemapXml(publicUsdSiteOrigin(process.env.FRONTEND_URL),stages,Array.isArray(siteSettings?.news)?siteSettings.news:[]);
 }
}
