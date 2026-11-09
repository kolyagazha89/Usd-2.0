import {catalogRequestNotification} from '../admin-notifications/admin-notification-event';
import {lockSiteSettings} from '../site-settings/catalog-concurrency';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

type RequestInput = { category: string; brand: string; model: string; details?: string };

const categoryLabels: Record<string, string> = {
  HEAD_UNIT: 'Головное устройство',
  AUDIO_COMPONENT: 'Акустика и динамики',
  AMPLIFIER: 'Усилитель',
  SUBWOOFER: 'Сабвуфер',
  DSP: 'Процессор / DSP',
  BATTERY: 'Аккумулятор',
  GENERATOR: 'Генератор',
  WIRING: 'Проводка и силовые компоненты',
  ACCESSORY: 'Аксессуары',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}

@Injectable()
export class ComponentCatalogRequestsService {
  private readonly frontendUrl = (process.env.FRONTEND_URL ?? 'https://usd-russia.ru').replace(/\/+$/, '');

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  private emailHtml(title: string, intro: string, lines: string[], url: string) {
    const safeTitle = escapeHtml(title);
    const safeIntro = escapeHtml(intro);
    const detailHtml = lines.map(line => '<li style="margin:0 0 8px">' + escapeHtml(line) + '</li>').join('');
    return {
      text: ['USD · ULTIMATE SOUND DESTRUCTION', title, '', intro, '', ...lines, '', 'Открыть: ' + url].join('\\n'),
      html: '<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;background:#f2f2f3;color:#171719;padding:20px"><main style="max-width:620px;margin:auto;background:#fff;border-radius:12px;padding:28px"><div style="font-weight:900;font-size:26px">USD<span style="color:#ed2638">.</span></div><p style="font-size:10px;letter-spacing:2px;color:#777">ULTIMATE SOUND DESTRUCTION</p><h1>' + safeTitle + '</h1><p>' + safeIntro + '</p><ul>' + detailHtml + '</ul><p><a href="' + escapeHtml(url) + '" style="display:inline-block;padding:12px 16px;background:#ed2638;color:#fff;text-decoration:none;border-radius:8px">Открыть USD</a></p></main></body></html>',
    };
  }

  private async send(to: string, subject: string, title: string, intro: string, lines: string[], url: string) {
    const rendered = this.emailHtml(title, intro, lines, url);
    await this.mail.sendNotificationEmail({ to, subject, ...rendered });
  }

  async create(userId: string, input: RequestInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
    if (!user?.email) throw new BadRequestException('Не удалось определить email аккаунта');
    const normalized = { category: input.category.toUpperCase(), brand: input.brand.trim(), model: input.model.trim() };
    const settings = await this.prisma.siteSettings.findUnique({ where: { id: 'default' }, select: { catalogs: true } });
    const catalogs = (settings?.catalogs && typeof settings.catalogs === 'object' ? settings.catalogs : {}) as Record<string, any>;
    const existing = Array.isArray(catalogs.componentModels) ? catalogs.componentModels : [];
    const duplicate = existing.find((item: any) => String(item.category).toUpperCase() === normalized.category
      && String(item.brand).trim().toLocaleLowerCase('ru') === normalized.brand.toLocaleLowerCase('ru')
      && String(item.model).trim().toLocaleLowerCase('ru') === normalized.model.toLocaleLowerCase('ru'));
    if (duplicate) throw new BadRequestException('Это комплектующее уже есть в каталоге. Попробуйте найти его через поиск.');
    const pending = await this.prisma.componentCatalogRequest.findFirst({
      where: { userId, status: 'PENDING', category: normalized.category, brand: { equals: normalized.brand, mode: 'insensitive' }, model: { equals: normalized.model, mode: 'insensitive' } },
    });
    if (pending) throw new BadRequestException('Такой запрос уже находится на рассмотрении');

    const request = await this.prisma.$transaction(async tx=>{
      const saved = await tx.componentCatalogRequest.create({
        data: { id: randomUUID(), userId, userEmail: user.email, category: normalized.category, brand: normalized.brand, model: normalized.model, details: input.details, adminEmailStatus:'DISABLED_PUSH' },
      });
      await tx.adminNotification.create({data:catalogRequestNotification(saved)});
      return saved;
    });
    return { success:true,requestId:request.id,status:request.status,notificationChannel:'PUSH',message:'Запрос сохранён в центре уведомлений администраторов. PUSH отправляется на подключённые устройства с разрешённой темой уведомлений. Статус запроса доступен в личном кабинете.' };
  }

  async list(_request: AuthenticatedRequest) {
    const items = await this.prisma.componentCatalogRequest.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 500 });
    return { success: true, items };
  }

  async approve(id: string, adminId: string, adminNote?: string) {
    const result=await this.prisma.$transaction(async tx=>{
    await lockSiteSettings(tx);
    const request = await tx.componentCatalogRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Запрос не найден');
    if (request.status === 'APPROVED') return { request, alreadyApproved: true };
    if (request.status !== 'PENDING') throw new BadRequestException('Запрос уже закрыт');
    const settings = await tx.siteSettings.findUnique({ where: { id: 'default' } });
    if (!settings) throw new BadRequestException('Сначала сохраните настройки сайта, затем повторите добавление');
    const catalogs = (settings.catalogs && typeof settings.catalogs === 'object' ? settings.catalogs : {}) as Record<string, any>;
    const brands = Array.isArray(catalogs.componentBrands) ? [...catalogs.componentBrands] : [];
    const models = Array.isArray(catalogs.componentModels) ? [...catalogs.componentModels] : [];
    const norm=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
    let brand=brands.find((item:any)=>item.category===request.category&&norm(item.name)===norm(request.brand));
    const visited=new Set<string>();
    while(brand?.mergedIntoId){if(visited.has(brand.id))throw new BadRequestException('Некорректная связь объединённой марки');visited.add(brand.id);brand=brands.find((item:any)=>item.id===brand.mergedIntoId);if(!brand)throw new BadRequestException('Целевая марка не найдена');}
    if(!brand){brand={id:randomUUID(),category:request.category,name:request.brand,isActive:true};brands.push(brand)}
    if(brand.isArchived||brand.isActive===false)throw new BadRequestException('Марка отключена. Сначала включите её в справочнике.');
    const duplicate=models.find((item:any)=>item.category===request.category&&norm(item.brand)===norm(brand.name)&&norm(item.model)===norm(request.model)&&!item.isArchived);
    const entry=duplicate??{id:randomUUID(),category:request.category,brand:brand.name,model:request.model,isActive:true,lifecycle:'UNKNOWN',source:'PARTICIPANT_REQUEST',addedAt:new Date().toISOString()};
    if (!duplicate) models.push(entry);
    await tx.siteSettings.update({ where: { id: 'default' }, data: { catalogs: { ...catalogs, componentBrands: brands, componentModels: models } } });
    await tx.componentCatalogRequest.update({
      where: { id },
      data: { status: 'APPROVED', adminNote: adminNote?.trim() || null, catalogEntryId: entry.id, resolvedAt: new Date(), resolvedByUserId: adminId, participantEmailStatus: 'PENDING' },
    });
    return {request, alreadyApproved:false};
    });
    const {request}=result;
    if(result.alreadyApproved)return {success:true,item:request,alreadyApproved:true};
    let participantEmailStatus = 'FAILED';
    try {
      await this.send(request.userEmail, 'USD — комплектующее добавлено в каталог', 'Комплектующее добавлено по вашему запросу', 'Спасибо за помощь в развитии каталога USD. Запрошенное оборудование добавлено.', ['Категория: ' + (categoryLabels[request.category] ?? request.category), 'Бренд: ' + request.brand, 'Модель: ' + request.model, ...(adminNote?.trim() ? ['Комментарий администратора: ' + adminNote.trim()] : [])], this.frontendUrl + '/participant?tab=cars');
      participantEmailStatus = 'PROVIDER_ACCEPTED';
    } catch {
      participantEmailStatus = 'FAILED';
    }
    const updated = await this.prisma.componentCatalogRequest.update({ where: { id }, data: { participantEmailStatus } });
    return { success: true, item: updated, emailQueued: participantEmailStatus === 'PROVIDER_ACCEPTED' };
  }


  async retryEmail(id: string, adminId: string) {
    const request = await this.prisma.componentCatalogRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Запрос не найден');
    let adminEmailStatus = request.adminEmailStatus;
    let participantEmailStatus = request.participantEmailStatus;
    const category = categoryLabels[request.category] ?? request.category;
    const details = ['Категория: ' + category, 'Бренд: ' + request.brand, 'Модель: ' + request.model, 'Email участника: ' + request.userEmail];
    // Pending administrative requests use the durable inbox/PUSH channel.
    // Retrying an old failed email must never resurrect administrative mail.
    if (request.status === 'PENDING') adminEmailStatus='DISABLED_PUSH';
    if (request.status === 'APPROVED' && request.participantEmailStatus === 'FAILED') {
      try {
        await this.send(request.userEmail, 'USD — комплектующее добавлено в каталог', 'Комплектующее добавлено по вашему запросу', 'Запрошенное оборудование добавлено в каталог USD.', details, this.frontendUrl + '/participant?tab=cars');
        participantEmailStatus = 'PROVIDER_ACCEPTED';
      } catch {
        participantEmailStatus = 'FAILED';
      }
    }
    const item = await this.prisma.componentCatalogRequest.update({ where: { id }, data: { adminEmailStatus, participantEmailStatus } });
    return { success: true, item, retriedBy: adminId };
  }

  async reject(id: string, adminId: string, adminNote?: string) {
    const request = await this.prisma.componentCatalogRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Запрос не найден');
    if (request.status !== 'PENDING') throw new BadRequestException('Запрос уже закрыт');
    const item = await this.prisma.componentCatalogRequest.update({ where: { id }, data: { status: 'REJECTED', adminNote: adminNote?.trim() || null, resolvedAt: new Date(), resolvedByUserId: adminId } });
    try {
      await this.send(request.userEmail, 'USD — запрос на комплектующее', 'Результат рассмотрения запроса', 'Администратор рассмотрел ваш запрос на добавление оборудования.', ['Категория: ' + (categoryLabels[request.category] ?? request.category), 'Бренд: ' + request.brand, 'Модель: ' + request.model, ...(adminNote?.trim() ? ['Комментарий администратора: ' + adminNote.trim()] : [])], this.frontendUrl + '/participant?tab=cars');
    } catch {
      // The decision is persisted even if email transport is temporarily unavailable.
    }
    return { success: true, item };
  }
}
