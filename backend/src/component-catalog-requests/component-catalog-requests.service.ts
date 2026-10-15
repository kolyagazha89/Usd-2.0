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
  private readonly frontendUrl = (process.env.FRONTEND_URL ?? 'https://usd-russia.ru').replace(/\\/+$/, '');

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

    const request = await this.prisma.componentCatalogRequest.create({
      data: { id: randomUUID(), userId, userEmail: user.email, category: normalized.category, brand: normalized.brand, model: normalized.model, details: input.details },
    });
    const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { email: true } });
    const lines = ['Категория: ' + (categoryLabels[normalized.category] ?? normalized.category), 'Бренд: ' + normalized.brand, 'Модель: ' + normalized.model, 'Участник: ' + (user.name?.trim() || user.email), 'Email участника: ' + user.email, ...(input.details ? ['Комментарий: ' + input.details] : [])];
    const delivery = await Promise.allSettled(admins.map(admin => this.send(admin.email, 'USD — запрос на добавление комплектующего', 'Новый запрос в каталоге комплектующих', 'Участник просит добавить оборудование в справочник USD.', lines, this.frontendUrl + '/admin/components')));
    const accepted = delivery.some(result => result.status === 'fulfilled');
    await this.prisma.componentCatalogRequest.update({ where: { id: request.id }, data: { adminEmailStatus: accepted ? 'PROVIDER_ACCEPTED' : 'FAILED' } });
    return { success: true, requestId: request.id, status: request.status, emailQueued: accepted, message: accepted ? 'Запрос отправлен администратору. Статус можно посмотреть в личном кабинете.' : 'Запрос сохранён, но письмо администратору не отправлено. Команда увидит его в очереди заявок.' };
  }

  async list(_request: AuthenticatedRequest) {
    const items = await this.prisma.componentCatalogRequest.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 500 });
    return { success: true, items };
  }

  async approve(id: string, adminId: string, adminNote?: string) {
    const request = await this.prisma.componentCatalogRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Запрос не найден');
    if (request.status === 'APPROVED') return { success: true, item: request, alreadyApproved: true };
    if (request.status !== 'PENDING') throw new BadRequestException('Запрос уже закрыт');
    const settings = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    if (!settings) throw new BadRequestException('Сначала сохраните настройки сайта, затем повторите добавление');
    const catalogs = (settings.catalogs && typeof settings.catalogs === 'object' ? settings.catalogs : {}) as Record<string, any>;
    const brands = Array.isArray(catalogs.componentBrands) ? [...catalogs.componentBrands] : [];
    const models = Array.isArray(catalogs.componentModels) ? [...catalogs.componentModels] : [];
    const brandExists = brands.some((item: any) => item.category === request.category && String(item.name).toLocaleLowerCase('ru') === request.brand.toLocaleLowerCase('ru'));
    if (!brandExists) brands.push({ id: randomUUID(), category: request.category, name: request.brand, isActive: true });
    const duplicate = models.find((item: any) => item.category === request.category && String(item.brand).toLocaleLowerCase('ru') === request.brand.toLocaleLowerCase('ru') && String(item.model).toLocaleLowerCase('ru') === request.model.toLocaleLowerCase('ru'));
    const entry = duplicate ?? { id: randomUUID(), category: request.category, brand: request.brand, model: request.model, isActive: true, lifecycle: 'UNKNOWN', source: 'PARTICIPANT_REQUEST', addedAt: new Date().toISOString() };
    if (!duplicate) models.push(entry);
    await this.prisma.siteSettings.update({ where: { id: 'default' }, data: { catalogs: { ...catalogs, componentBrands: brands, componentModels: models } } });
    const item = await this.prisma.componentCatalogRequest.update({
      where: { id },
      data: { status: 'APPROVED', adminNote: adminNote?.trim() || null, catalogEntryId: entry.id, resolvedAt: new Date(), resolvedByUserId: adminId, participantEmailStatus: 'PENDING' },
    });
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
