import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

type Client = PrismaService | Prisma.TransactionClient;

@Injectable()
export class HistoricalNameRepairService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: NameNormalizerService,
  ) {}

  private async plan(db: Client = this.prisma) {
    const participants = await db.participant.findMany({
      select: {
        id: true, lastName: true, firstName: true, middleName: true,
        historicalAlias: true,
        user: { select: { id: true } },
        registrations: { select: { id: true } },
      },
      orderBy: { id: 'asc' },
    });
    const proposals = participants.map((p) => {
      const original = [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');
      const inspected = this.names.inspect(original);
      const parts = inspected.normalized.split(/\s+/).filter(Boolean);
      const next = {
        lastName: parts[0] ?? '',
        firstName: parts[1] ?? '',
        middleName: parts.length > 2 ? parts.slice(2).join(' ') : null,
      };
      const changed = p.lastName !== next.lastName || p.firstName !== next.firstName ||
        (p.middleName ?? null) !== next.middleName;
      return {
        id: p.id,
        original,
        next,
        changed,
        reason: inspected.reasons,
        accountLinked: Boolean(p.user),
        historicalAlias: Boolean(p.historicalAlias),
        registrations: p.registrations.length,
        key: [next.lastName, next.firstName, next.middleName ?? '']
          .join('|').toLocaleLowerCase('ru').replace(/ё/g, 'е'),
      };
    });
    const shared = new Map<string, string[]>();
    for (const item of proposals) {
      shared.set(item.key, [...(shared.get(item.key) ?? []), item.id]);
    }
    const reviewed = proposals.map((p) => {
      const reasons = [...p.reason];
      if (p.accountLinked && p.changed)
        reasons.push('Профиль привязан к аккаунту; имя изменяет только владелец/администратор вручную');
      if (p.historicalAlias)
        reasons.push('Это архивный псевдоним: исходное название не переписывается нормализацией');
      if ((shared.get(p.key)?.length ?? 0) > 1)
        reasons.push('Совпадает с другой карточкой участника: объединять автоматически нельзя');
      return { ...p, reasons, eligible: p.changed && reasons.length === 0 };
    });
    const eligible = reviewed.filter((r) => r.eligible);
    const uncertain = reviewed.filter((r) => r.reasons.length > 0);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(reviewed.map(({ id, original, next, accountLinked, historicalAlias, registrations }) =>
        ({ id, original, next, accountLinked, historicalAlias, registrations }))))
      .digest('hex');
    return {
      eligible, uncertain, fingerprint,
      counts: {
        totalParticipants: participants.length,
        safeCorrections: eligible.length,
        requiresReview: uncertain.length,
        accountLinked: proposals.filter((p) => p.accountLinked).length,
        archivalAliasesProtected: proposals.filter((p) => p.historicalAlias).length,
        noChange: reviewed.filter((p) => !p.changed && p.reasons.length === 0).length,
      },
      examples: {
        safe: eligible.slice(0, 150).map((r) => ({ before: r.original, after:
          [r.next.lastName, r.next.firstName, r.next.middleName].filter(Boolean).join(' ') })),
        review: uncertain.slice(0, 150).map((r) => ({ name: r.original,
          suggested: [r.next.lastName, r.next.firstName, r.next.middleName].filter(Boolean).join(' '),
          reason: r.reasons.join('; '), registrations: r.registrations })),
      },
    };
  }

  async preview() {
    const plan = await this.plan();
    return {
      success: true,
      mode: 'NAME_REPAIR_PREVIEW',
      readOnly: true,
      fingerprint: plan.fingerprint,
      counts: plan.counts,
      examples: plan.examples,
      confirmationRequired: `REPAIR ${plan.counts.safeCorrections} VERIFIED NAMES`,
      warning: 'Изменяются только явно нормализуемые ФИО без совпадений и без аккаунтов. Сомнительные фамилии, дубли и псевдонимы не изменяются и не объединяются.',
    };
  }

  async execute(
    confirmation: string, fingerprint: string, expectedCount: number,
    request?: AuthenticatedRequest,
  ) {
    if (process.env.ALLOW_HISTORICAL_IMPORT_RESET !== 'true' ||
      process.env.ALLOW_TEST_NAME_REPAIR !== 'true') {
      throw new ForbiddenException('Исправление тестовых ФИО отключено. Нужна проверенная резервная копия и два временных флага ALLOW_HISTORICAL_IMPORT_RESET=true и ALLOW_TEST_NAME_REPAIR=true.');
    }
    if (!Number.isSafeInteger(expectedCount) || expectedCount < 1 ||
      !/^[a-f0-9]{64}$/.test(fingerprint) ||
      confirmation !== `REPAIR ${expectedCount} VERIFIED NAMES`) {
      throw new BadRequestException('Введите точную контрольную фразу и fingerprint из предпросмотра.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('USD_TEST_HISTORICAL_NAME_REPAIR'))::text AS locked`;
      const plan = await this.plan(tx);
      if (plan.fingerprint !== fingerprint || plan.eligible.length !== expectedCount) {
        throw new BadRequestException('База изменилась. Повторите предпросмотр: имена не исправлялись.');
      }
      for (const item of plan.eligible) {
        await tx.participant.update({
          where: { id: item.id },
          data: item.next,
        });
      }
      await tx.auditLog.create({
        data: {
          userId: request?.user?.sub ?? null,
          action: 'HISTORICAL_TEST_NAME_REPAIR',
          entity: 'Participant',
          metadata: {
            changed: plan.eligible.length,
            fingerprint,
            examples: plan.examples.safe.slice(0, 30),
          },
          ipAddress: request?.ip ?? null,
        },
      });
      return {
        success: true,
        fixed: plan.eligible.length,
        skippedForReview: plan.uncertain.length,
        note: 'Неоднозначные ФИО и аккаунты не изменялись. Существующие профили не объединялись.',
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 15000, timeout: 120000,
    });
  }
}
