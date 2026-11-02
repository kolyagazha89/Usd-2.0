import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { EmailNotificationsService } from '../mail/email-notifications.service';
import { isValidRegistrationPlate } from '../participants/profile-validation';
import { configurationStillPending } from './pending-configuration';
import type { CreateOnSiteProfileDto, CreateOnSiteCarDto } from './dto/create-registration.dto';


type RegistrationSource =
  | 'PRE_REGISTRATION'
  | 'ON_SITE'
  | 'IMPORT';

type RegistrationStatus = 'ACTIVE' | 'CANCELLED';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailNotifications?: EmailNotificationsService,
  ) {}

  private readonly registrationInclude = {
    stage: {
      include: {
        season: true,
      },
    },
    participant: {
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        team: true,
        city: true,
        photoUrl: true,
      },
    },
    car: {
      select: {
        id: true,
        participantId: true,
        brand: true,
        model: true,
        registrationCountry: true,
        registrationNumber: true,
        color: true,
        photoUrl: true,
        isActive: true,
      },
    },
    configurationVersion: {
      include: {
        configuration: true,
      },
    },
    classes: {
      include: {
        class: {
          include: {
            direction: true,
          },
        },
        number: true,
        inspection: true,
      },
    },
    numbers: {
      orderBy: { number: 'asc' as const },
    },
    inspection: true,
    stageInspection: true,
    results: true,
  };


  private isBassRaceClass(className: string, directionName = ''): boolean {
    const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_-]/g, '');
    return normalize(className).startsWith('bassrace') ||
      normalize(directionName).includes('bassrace');
  }

  private getMissingConfigurationRequirement(
    stageClass: { class: { name: string; code?: string | null; direction?: { name?: string | null } | null } },
    configurationVersion: { audioComponents: { direction: string; type: string; brand?: string | null; model?: string | null; quantity?: number | null }[] },
  ): string | null {
    const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
    const hasUsableAudio = (direction: 'SUB' | 'FRONT' | 'REAR', requireSubwoofer = false) =>
      configurationVersion.audioComponents.some((item) =>
        item.direction === direction &&
        (!requireSubwoofer || item.type === 'SUBWOOFER') &&
        Boolean(String(item.brand ?? '').trim()) &&
        Boolean(String(item.model ?? '').trim()) &&
        Number.isSafeInteger(Number(item.quantity)) &&
        Number(item.quantity) > 0,
      );
    const className = normalize(stageClass.class.name);
    const directionName = normalize(stageClass.class.direction?.name);
    const code = normalize(stageClass.class.code);
    const identity = className + ' ' + directionName + ' ' + code;

    // Imported classes can carry the legacy SPL parent direction. The
    // specific BFSPL/BDW identity must win before the generic SPL rule.
    if (identity.includes('bfspl')) {
      return hasUsableAudio('FRONT') ? null : 'Для участия в BFSPL необходимо заполнить фронтальную акустику в конфигурации автомобиля.';
    }

    if (identity.includes('bdw') || identity.includes('dbwspl') || directionName === 'dbw') {
      return hasUsableAudio('REAR') ? null : 'Для участия в BDW необходимо заполнить тыловую акустику в конфигурации автомобиля.';
    }

    if (
      ['spl', 'bassrace', 'hurrican', 'hurricane'].includes(directionName) ||
      identity.includes('bassrace') ||
      identity.includes('stormwall')
    ) {
      return hasUsableAudio('SUB', true) ? null : 'Для направлений SPL, BassRace и Hurrican необходимо добавить сабвуфер в конфигурацию автомобиля.';
    }

    return null;
  }

  private async getActiveDisqualifications(
    tx: PrismaService | any,
    participantId: string,
    stageId: string,
  ) {
    const stage = await tx.stage.findUnique({
      where: {
        id: stageId,
      },
      select: {
        id: true,
        seasonId: true,
      },
    });

    if (!stage) {
      throw new NotFoundException(
        'Этап не найден',
      );
    }

    return tx.disqualification.findMany({
      where: {
        participantId,
        status: 'ACTIVE',
        OR: [
          {
            scope: 'FORMAT',
          },
          {
            scope: 'SEASON',
            seasonId: stage.seasonId,
          },
          {
            scope: 'STAGE',
            stageId: stage.id,
          },
        ],
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  // ==========================================
  // СПИСОК РЕГИСТРАЦИЙ
  // ==========================================

  async findAll(
    stageId?: string,
    status?: RegistrationStatus,
  ) {
    return this.prisma.registration.findMany({
      where: {
        ...(stageId ? { stageId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [
        { stageId: 'asc' },
        { participantNumber: 'asc' },
      ],
      include: this.registrationInclude,
    });
  }

  // ==========================================
  // ОДНА РЕГИСТРАЦИЯ
  // ==========================================

  async findByParticipant(
    participantId: string,
    status?: RegistrationStatus,
  ) {
    return this.prisma.registration.findMany({
      where: {
        participantId,
        ...(status ? { status } : {}),
      },
      orderBy: [
        { stage: { date: 'desc' } },
        { participantNumber: 'asc' },
      ],
      include: this.registrationInclude,
    });
  }

  async findOne(id: string) {
    const registration =
      await this.prisma.registration.findUnique({
        where: {
          id,
        },
        include: this.registrationInclude,
      });

    if (!registration) {
      throw new NotFoundException(
        'Регистрация не найдена',
      );
    }

    return registration;
  }

    private async requireGateCreationAccess(request: AuthenticatedRequest): Promise<void> {
    if (request.user.role !== 'ADMIN') {
      if (!request.user.customRoleId) {
        throw new BadRequestException('Только сотрудник соревнований может создать профиль на въезде');
      }
      const actor = await this.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { isActive: true, emailVerifiedAt: true, customRoleId: true },
      });
      if (!actor?.isActive || !actor.emailVerifiedAt || actor.customRoleId !== request.user.customRoleId) {
        throw new BadRequestException('Учётная запись сотрудника недоступна');
      }
      const role = await this.prisma.role.findUnique({
        where: { id: request.user.customRoleId },
        select: { permissions: true },
      });
      const permissions = (role?.permissions ?? {}) as Record<string, unknown>;
      const module = permissions.registrations;
      const allowed = Array.isArray(module)
        ? module.includes('create') || module.includes('*')
        : Boolean(module && typeof module === 'object' && ((module as Record<string, unknown>).create === true || (module as Record<string, unknown>).create === '*'));
      if (!allowed) {
        throw new BadRequestException('Недостаточно прав на регистрацию на месте');
      }
    }
  }

  /** Create an unlinked profile and its car in one transaction for on-site staff.
   * A colliding name or plate is never silently claimed; the judge must inspect
   * the existing profile. This operation is not a stage registration.
   */
  async createOnSiteProfile(request: AuthenticatedRequest, body: CreateOnSiteProfileDto) {
    await this.requireGateCreationAccess(request);
    if (body.privacyConsent !== true || body.termsAccepted !== true) {
      throw new BadRequestException('Для создания профиля на месте необходимо согласие участника на обработку данных и условия');
    }
    const site = await this.prisma.siteSettings.findUnique({
      where: { id: 'default' },
      select: { legal: true, contacts: true, footer: true },
    });
    const legal = (site?.legal ?? {}) as Record<string, unknown>;
    const contactEmail = (site?.contacts as Record<string, unknown> | null)?.email ??
      (site?.footer as Record<string, unknown> | null)?.email;
    if (legal.legalApproved !== true || !String(legal.legalVersion ?? '').trim()
        || !String(legal.ipName ?? '').trim()
        || !String(contactEmail ?? '').trim() || !String(legal.privacyText ?? '').trim()
        || !String(legal.termsText ?? '').trim() || !String(legal.consentText ?? '').trim()) {
      throw new BadRequestException('Регистрация недоступна: юридические документы не утверждены');
    }
    const lastName = String(body.lastName ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    const firstName = String(body.firstName ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    const middleName = String(body.middleName ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ') || null;
    const brand = String(body.brand ?? '').normalize('NFKC').trim();
    const model = String(body.model ?? '').normalize('NFKC').trim();
    const country = body.registrationCountry;
    let number = String(body.registrationNumber ?? '').normalize('NFKC').trim().toLocaleUpperCase('ru-RU');
    if (country === 'RU') {
      const chars: Record<string, string> = {A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
      number = [...number].map(char => /[|\s.\-_/\\]/.test(char) ? '' : chars[char] ?? char).join('');
    } else {
      number = number.replace(/\s+/g, ' ');
    }
    if (!firstName || !lastName || !brand || !model ||
      firstName.length > 120 || lastName.length > 120 || (middleName?.length ?? 0) > 120 ||
      brand.length > 80 || model.length > 120 || !isValidRegistrationPlate(country, number)) {
      throw new BadRequestException('Укажите корректные ФИО, марку, модель и госномер автомобиля');
    }
    const plateKey = country + ':' + number.replace(/[^\p{L}\p{N}]/gu, '');
    return this.prisma.$transaction(async tx => {
      // Serialise both the identity check and plate check for concurrent gate
      // operators. Without the name lock, two different cars could generate
      // duplicate participant profiles from simultaneous check-ins.
      const nameKey = 'gate-name:' + lastName.toLocaleLowerCase('ru-RU') + ':' + firstName.toLocaleLowerCase('ru-RU');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${nameKey}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${plateKey}))`;
      const sameName = await tx.participant.findFirst({
        where: { firstName: { equals: firstName, mode: 'insensitive' },
                 lastName: { equals: lastName, mode: 'insensitive' } },
        select: { id: true },
      });
      if (sameName) {
        throw new ConflictException('Профиль с таким ФИО уже существует. Проверьте найденного участника перед созданием.');
      }
      const cars = await tx.car.findMany({
        where: { registrationCountry: country },
        select: { id: true, registrationNumber: true },
      });
      const canonical = (value: string) => {
        let normalized = value.normalize('NFKC').toLocaleUpperCase('ru-RU');
        if (country === 'RU') {
          const lookalikes: Record<string,string> = {A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
          normalized = [...normalized].map(char => lookalikes[char] ?? char).join('');
        }
        return normalized.replace(/[^\p{L}\p{N}]/gu, '');
      };
      if (cars.some(car => canonical(car.registrationNumber) === canonical(number))) {
        throw new ConflictException('Автомобиль с таким госномером уже существует. Выберите существующий профиль.');
      }
      const participant = await tx.participant.create({
        data: { firstName, lastName, middleName, isPublic: false },
        select: { id: true },
      });
      const car = await tx.car.create({
        data: { participantId: participant.id, brand, model, registrationCountry: country,
                registrationNumber: number, isPublic: false },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { userId: request.user.sub, action: 'ON_SITE_PROFILE_CREATED',
                entity: 'Participant', entityId: participant.id,
                metadata: { carId: car.id, participantConsentRecorded: true, legalVersion: String(legal.legalVersion), consentConfirmedAt: new Date().toISOString() } },
      });
      return { participantId: participant.id, carId: car.id };
    });
  }

  /** Staff-only intake for an existing entrant driving a previously unseen car.
   * Never reassign someone else's plate or silently change the participant owner.
   */
  async createOnSiteCar(request: AuthenticatedRequest, body: CreateOnSiteCarDto) {
    await this.requireGateCreationAccess(request);
    if (body.privacyConsent !== true || body.termsAccepted !== true) {
      throw new BadRequestException('Для добавления автомобиля на месте подтвердите согласия участника');
    }
    const legalRow = await this.prisma.siteSettings.findUnique({
      where: { id: 'default' }, select: { legal: true, contacts: true, footer: true },
    });
    const legal = (legalRow?.legal ?? {}) as Record<string, unknown>;
    const contactEmail = (legalRow?.contacts as Record<string, unknown> | null)?.email ??
      (legalRow?.footer as Record<string, unknown> | null)?.email;
    if (legal.legalApproved !== true || !String(legal.legalVersion ?? '').trim() ||
        !String(legal.ipName ?? '').trim() || !String(contactEmail ?? '').trim() ||
        !String(legal.privacyText ?? '').trim() || !String(legal.termsText ?? '').trim() ||
        !String(legal.consentText ?? '').trim()) {
      throw new BadRequestException('Регистрация недоступна: юридические документы не утверждены');
    }
    const brand = String(body.brand ?? '').normalize('NFKC').trim();
    const model = String(body.model ?? '').normalize('NFKC').trim();
    const country = body.registrationCountry;
    let number = String(body.registrationNumber ?? '').normalize('NFKC').trim().toLocaleUpperCase('ru-RU');
    const lookalikes: Record<string,string> = {A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
    if (country === 'RU') number = [...number].map(char => /[|\s.\-_/\\]/.test(char) ? '' : lookalikes[char] ?? char).join('');
    else number = number.replace(/\s+/g, ' ');
    if (!body.participantId || !brand || !model || brand.length > 80 || model.length > 120 ||
        !isValidRegistrationPlate(country, number)) {
      throw new BadRequestException('Укажите участника, марку, модель и корректный госномер автомобиля');
    }
    const canonical = (plate: string) => {
      let normalized = plate.normalize('NFKC').toLocaleUpperCase('ru-RU');
      if (country === 'RU') normalized = [...normalized].map(char => lookalikes[char] ?? char).join('');
      return normalized.replace(/[^\p{L}\p{N}]/gu, '');
    };
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${country + ':' + canonical(number)}))`;
      const participant = await tx.participant.findUnique({
        where: { id: body.participantId },
        select: { id: true },
      });
      if (!participant) throw new NotFoundException('Участник не найден');
      const cars = await tx.car.findMany({
        where: { registrationCountry: country }, select: { id: true, registrationNumber: true },
      });
      if (cars.some(car => canonical(car.registrationNumber) === canonical(number))) {
        throw new ConflictException('Автомобиль с таким госномером уже существует. Проверьте существующую запись.');
      }
      const car = await tx.car.create({
        data: {
          participantId: participant.id, brand, model,
          registrationCountry: country, registrationNumber: number,
          isPublic: false,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          userId: request.user.sub, action: 'ON_SITE_CAR_CREATED',
          entity: 'Car', entityId: car.id, metadata: {
            participantId: participant.id, consentConfirmed: true, legalVersion: String(legal.legalVersion), consentConfirmedAt: new Date().toISOString(),
          },
        },
      });
      return { participantId: participant.id, carId: car.id };
    });
  }

  /** Complete an entrance-only draft with a real, immutable equipment snapshot.
   * No registration number, stage, class or historic result is ever rewritten.
   */
  async confirmOnSiteConfiguration(
    request: AuthenticatedRequest, registrationId: string, versionId: string,
  ) {
    if (!versionId || !/^[a-f0-9-]{36}$/i.test(versionId)) {
      throw new BadRequestException('Укажите действительную версию конфигурации');
    }
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${registrationId}))`;
      const registration = await tx.registration.findUnique({
        where: { id: registrationId },
        include: {
          stage: { select: { status: true, isDeleted: true } },
          classes: { include: { class: { include: { direction: true } } } },
          results: { select: { id: true } },
        },
      });
      if (!registration) throw new NotFoundException('Регистрация не найдена');
      if (request.user.role !== 'ADMIN') {
        const own = request.user.participantId === registration.participantId;
        if (!own) {
          if (!request.user.customRoleId) throw new ForbiddenException('Недостаточно прав на изменение регистрации');
          const actor = await this.prisma.user.findUnique({
            where: { id: request.user.sub },
            select: { isActive: true, customRoleId: true, emailVerifiedAt: true },
          });
          if (!actor?.isActive || !actor.emailVerifiedAt || actor.customRoleId !== request.user.customRoleId) {
            throw new ForbiddenException('Учётная запись сотрудника недоступна');
          }
          const role = await this.prisma.role.findUnique({
            where: { id: request.user.customRoleId },
            select: { permissions: true },
          });
          const entry = ((role?.permissions ?? {}) as Record<string, unknown>).registrations;
          const allowed = Array.isArray(entry)
            ? entry.includes('update') || entry.includes('*')
            : Boolean(entry && typeof entry === 'object' &&
              ((entry as Record<string, unknown>).update === true || (entry as Record<string, unknown>).update === '*'));
          if (!allowed) throw new ForbiddenException('Нет прав на изменение регистраций');
        }
      }
      if (registration.source !== 'ON_SITE' || registration.status !== 'ACTIVE' ||
          !configurationStillPending(registration.configurationSnapshot)) {
        throw new ConflictException('Подтверждение доступно только для незаполненной регистрации на месте');
      }
      // The participant can complete the equipment record AFTER the stage,
      // including after results have been entered. Historic event-day snapshots
      // must not be overwritten by documentation supplied retrospectively.
      if (registration.stage.isDeleted) {
        throw new ConflictException('Удалённый этап недоступен для дополнения конфигурации');
      }
      const config = await tx.carConfigurationVersion.findFirst({
        where: { id: versionId, configuration: { carId: registration.carId, isActive: true } },
        include: {
          configuration: true, headUnits: true, audioComponents: true,
          amplifiers: { include: { componentLinks: true } },
          batteries: true, generators: true,
        },
      });
      if (!config || config.additionalDescription === 'USD_ON_SITE_DRAFT_PENDING') {
        throw new BadRequestException('Выберите заполненную конфигурацию этого автомобиля');
      }
      for (const row of registration.classes) {
        const missing = this.getMissingConfigurationRequirement(row, config);
        if (missing) throw new BadRequestException(missing);
      }
      // Append documentary evidence, never alter equipment recorded on event day.
      const original = registration.configurationSnapshot as Record<string, unknown>;
      const documentedAt = new Date().toISOString();
      const snapshot = {
        ...original,
        postStageCompletion: {
          versionId: config.id,
          configurationId: config.configurationId,
          configurationName: config.configuration.name,
          version: config.version,
          documentedAt,
          documentedByUserId: request.user.sub,
          vibrationIsolation: config.vibrationIsolation,
          additionalDescription: config.additionalDescription,
          headUnits: config.headUnits,
          audioComponents: config.audioComponents,
          amplifiers: config.amplifiers,
          batteries: config.batteries,
          generators: config.generators,
        },
      };
      await tx.registration.update({
        where: { id: registrationId },
        data: { configurationSnapshot: snapshot },
      });
      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: 'ON_SITE_CONFIGURATION_CONFIRMED',
          entity: 'Registration', entityId: registrationId,
          metadata: { oldConfigurationVersionId: registration.configurationVersionId, newConfigurationVersionId: config.id },
        },
      });
      return { id: registrationId, configurationVersionId: config.id, configurationPending: false };
    });
  }

  // ==========================================
  // СОЗДАНИЕ РЕГИСТРАЦИИ
  // ==========================================

  async create(
    request: AuthenticatedRequest,
    body: {
      stageId: string;
      participantId?: string;
      carId: string;
      classIds: string[];
      configurationVersionId?: string;
      source?: RegistrationSource;
      rulesAccepted?: boolean;
      privacyConsent?: boolean;
      termsAccepted?: boolean;
    },
  ) {
    const {
      stageId,
      carId,
      classIds,
      configurationVersionId,
    } = body;
    const source = body.source ?? 'PRE_REGISTRATION';
    let consentLegalVersion: string | null = null;
    let registrationPrivacyConsentAt: Date | null = null;
    let registrationTermsAcceptedAt: Date | null = null;
    let consentCapturedByUserId: string | null = null;
    let publishedRulesReady = false;
    let publishedRulesVersion = '';

    const participantId =
      (request.user.role === 'PARTICIPANT' && !request.user.customRoleId)
        ? request.user.participantId
        : body.participantId;

    if ((request.user.role === 'PARTICIPANT' && !request.user.customRoleId) && body.rulesAccepted !== true) {
      throw new BadRequestException('Подтвердите ознакомление с общим регламентом соревнований');
    }

    if (!participantId) {
      throw new BadRequestException(
        'Для операции требуется профиль участника',
      );
    }

    if (!configurationVersionId && source !== 'ON_SITE') {
      throw new BadRequestException(
        'Для регистрации необходимо выбрать версию конфигурации автомобиля',
      );
    }

    if (source !== 'IMPORT') {
      const legalRow = await this.prisma.siteSettings.findUnique({
        where: { id: 'default' },
        select: { legal: true, contacts: true, footer: true, registration: true },
      });
      const registrationSettings = (legalRow?.registration ?? {}) as Record<string, any>;
      const publishedRules = registrationSettings.rulesDocument?.published;
      publishedRulesReady = Boolean(publishedRules && Array.isArray(publishedRules.blocks) && publishedRules.blocks.length > 0 && String(publishedRules.id ?? '').trim());
      publishedRulesVersion = String(publishedRules?.id ?? '');
      const legal = (legalRow?.legal ?? {}) as Record<string, any>;
      const contactEmail = (legalRow?.contacts as Record<string, any> | null)?.email
        ?? (legalRow?.footer as Record<string, any> | null)?.email;
      const version = String(legal.legalVersion ?? '');
      const legalReady = legal.legalApproved === true && Boolean(version)
        && Boolean(String(legal.ipName ?? '').trim())
        && Boolean(String(legal.privacyText ?? '').trim())
        && Boolean(String(legal.consentText ?? '').trim())
        && Boolean(String(legal.termsText ?? '').trim())
        && Boolean(String(contactEmail ?? '').trim());
      if (!legalReady) {
        throw new BadRequestException('Регистрация временно недоступна: юридические документы не утверждены организатором');
      }
      consentLegalVersion = version;
      if ((request.user.role === 'PARTICIPANT' && !request.user.customRoleId)) {
        const consentUser = await this.prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { privacyConsentAt: true, privacyConsentVersion: true, termsAcceptedAt: true, termsVersion: true },
        });
        const currentConsents = consentUser
          && consentUser.privacyConsentAt && consentUser.privacyConsentVersion === 'privacy-v' + version
          && consentUser.termsAcceptedAt && consentUser.termsVersion === 'terms-v' + version;
        if (!currentConsents) {
          throw new BadRequestException('Перед регистрацией примите актуальные юридические документы в форме регистрации');
        }
        registrationPrivacyConsentAt = consentUser.privacyConsentAt;
        registrationTermsAcceptedAt = consentUser.termsAcceptedAt;
        consentCapturedByUserId = request.user.sub;
      } else {
        if (body.rulesAccepted !== true || body.privacyConsent !== true || body.termsAccepted !== true) {
          throw new BadRequestException('Для регистрации участника подтвердите согласие на обработку данных, пользовательское соглашение и ознакомление с регламентом');
        }
        registrationPrivacyConsentAt = new Date();
        registrationTermsAcceptedAt = new Date();
        consentCapturedByUserId = request.user.sub;
      }
    }

    // A participant must be blocked before opening a transaction if the shared
    // organizer regulation is not published. This applies to the single general
    // regulation for the competition, not a separate document per stage.
    if ((request.user.role === 'PARTICIPANT' && !request.user.customRoleId) && source !== 'IMPORT' && !publishedRulesReady) {
      throw new BadRequestException('Регистрация недоступна: организатор должен опубликовать действующий общий регламент соревнований в разделе «Документы»');
    }

    if (
      (request.user.role === 'PARTICIPANT' && !request.user.customRoleId) &&
      request.user.participantId !== participantId
    ) {
      throw new ConflictException(
        'Нельзя создавать регистрацию за другого участника',
      );
    }

    if (
      (request.user.role === 'PARTICIPANT' && !request.user.customRoleId) &&
      body.source &&
      body.source !== 'PRE_REGISTRATION'
    ) {
      throw new BadRequestException(
        'Участник может создавать только предрегистрацию',
      );
    }


    if (!stageId || !participantId || !carId) {
      throw new BadRequestException(
        'Необходимо указать этап, участника и автомобиль',
      );
    }

    if (
      !Array.isArray(classIds) ||
      classIds.length === 0
    ) {
      throw new BadRequestException(
        'Выберите хотя бы один класс',
      );
    }

    if (
      classIds.some(
        (id) =>
          typeof id !== 'string' ||
          !id.trim(),
      )
    ) {
      throw new BadRequestException(
        'Список классов содержит некорректный ID',
      );
    }

    if (classIds.length > 5) {
      throw new BadRequestException(
        'В одной регистрации нельзя выбрать более 5 классов',
      );
    }

    if (
      new Set(classIds).size !== classIds.length
    ) {
      throw new BadRequestException(
        'Один и тот же класс указан несколько раз',
      );
    }


    if (
      ![
        'PRE_REGISTRATION',
        'ON_SITE',
        'IMPORT',
      ].includes(source)
    ) {
      throw new BadRequestException(
        'Недопустимый источник регистрации',
      );
    }

    const registration = await this.prisma.$transaction(
      async (tx) => {
        // Блокируем выдачу номеров для конкретного этапа.
        //
        // Это защищает от ситуации, когда два
        // параллельных запроса одновременно получают
        // один и тот же participantNumber.
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${stageId})
          )
        `;

        // 1. Проверяем этап.
        const stage =
          await tx.stage.findUnique({
            where: {
              id: stageId,
            },
          });

        if (!stage || stage.isDeleted) {
          throw new NotFoundException(
            'Этап не найден или удалён',
          );
        }

        if (stage.status !== 'PUBLISHED') {
          throw new BadRequestException(
            'Регистрация доступна только на опубликованный этап',
          );
        }

        const season = await tx.season.findUnique({
          where: { id: stage.seasonId },
          select: { status: true },
        });

        if (!season || season.status !== 'ACTIVE') {
          throw new BadRequestException(
            'Регистрация недоступна: сезон не активен',
          );
        }

        if (!stage.registrationOpen) {
          throw new BadRequestException(
            'Регистрация на этот этап закрыта',
          );
        }

        const now = new Date();

        if (
          stage.registrationStartsAt &&
          now < stage.registrationStartsAt
        ) {
          throw new BadRequestException(
            'Регистрация на этот этап ещё не началась',
          );
        }

        if (
          stage.registrationEndsAt &&
          now > stage.registrationEndsAt
        ) {
          throw new BadRequestException(
            'Срок регистрации на этот этап завершён',
          );
        }

        // 2. Проверяем участника.
        const participant =
          await tx.participant.findUnique({
            where: {
              id: participantId,
            },
          });

        if (!participant) {
          throw new NotFoundException(
            'Участник не найден',
          );
        }

        // The first on-site competition must never be blocked by missing
        // hardware. Only a DIFFERENT stage after the previous event has taken
        // place requires the participant to document that event's equipment.
        // Same-stage registrations (additional cars/classes) remain possible.
        if (source !== 'IMPORT') {
          const prior = await tx.registration.findMany({
            where: {
              participantId,
              status: 'ACTIVE',
              stageId: { not: stageId },
              stage: { isDeleted: false, date: { lt: now } },
              configurationSnapshot: { path: ['configurationPending'], equals: true },
            },
            select: { id: true, configurationSnapshot: true },
          });
          const missing = prior.find(item => configurationStillPending(item.configurationSnapshot));
          if (missing) {
            throw new ConflictException({
              code: 'PREVIOUS_CONFIGURATION_REQUIRED',
              message: 'Перед регистрацией на следующий этап заполните конфигурацию автомобиля с прошлого этапа',
              registrationId: missing.id,
            });
          }
        }

        // 3. Проверяем дисквалификацию.
        const activeDisqualifications =
          await this.getActiveDisqualifications(
            tx,
            participantId,
            stageId,
          );

        if (
          activeDisqualifications.length > 0
        ) {
          const format =
            activeDisqualifications.find(
              (item: { scope: string }) =>
                item.scope === 'FORMAT',
            );

          if (format) {
            throw new ConflictException({
              message:
                'Участник не может зарегистрироваться: действует дисквалификация FORMAT',
              code:
                'PARTICIPANT_FORMAT_DISQUALIFIED',
              disqualificationId: format.id,
            });
          }

          const season =
            activeDisqualifications.find(
              (item: { scope: string }) =>
                item.scope === 'SEASON',
            );

          if (season) {
            throw new ConflictException({
              message:
                'Участник не может зарегистрироваться: действует дисквалификация SEASON на этот сезон',
              code:
                'PARTICIPANT_SEASON_DISQUALIFIED',
              disqualificationId: season.id,
            });
          }

          const stageDisqualification =
            activeDisqualifications.find(
              (item: { scope: string }) =>
                item.scope === 'STAGE',
            );

          if (stageDisqualification) {
            throw new ConflictException({
              message:
                'Участник не может зарегистрироваться: действует дисквалификация STAGE на этот этап',
              code:
                'PARTICIPANT_STAGE_DISQUALIFIED',
              disqualificationId:
                stageDisqualification.id,
            });
          }
        }

        // 4. Проверяем автомобиль.
        const car =
          await tx.car.findUnique({
            where: {
              id: carId,
            },
          });

        if (!car) {
          throw new NotFoundException(
            'Автомобиль не найден',
          );
        }

        if (
          car.participantId !== participantId
        ) {
          throw new BadRequestException(
            'Этот автомобиль не принадлежит выбранному участнику',
          );
        }

        if (!car.isActive) {
          throw new BadRequestException(
            'Нельзя зарегистрировать неактивный автомобиль',
          );
        }

        // 5. Проверяем классы этапа.
        const stageClasses =
          await tx.stageClass.findMany({
            where: {
              stageId,
              classId: {
                in: classIds,
              },
              isActive: true,
              class: {
                isActive: true,
                direction: {
                  isActive: true,
                },
              },
            },
            select: {
              classId: true,
              participantLimit: true,
              class: {
                select: {
                  directionId: true,
                  name: true,
                  direction: { select: { name: true } },
                },
              },
            },
          });

        if (
          stageClasses.length !==
          classIds.length
        ) {
          throw new BadRequestException(
            'Один или несколько классов неактивны или не назначены этому этапу',
          );
        }

        // 6. В одной регистрации максимум один класс
        // из каждого направления, кроме BassRace.
        // BassRace специально допускает несколько классов
        // одного направления: каждое такое выступление
        // получает собственный зарезервированный номер.
        const nonBassRaceDirectionIds = stageClasses
          .filter((item) => !this.isBassRaceClass(item.class.name, item.class.direction?.name))
          .map((item) => item.class.directionId);

        if (
          new Set(nonBassRaceDirectionIds).size !==
          nonBassRaceDirectionIds.length
        ) {
          throw new BadRequestException(
            'В одной регистрации нельзя выбрать несколько классов одного направления (кроме BassRace)',
          );
        }

        // 7. Проверяем лимиты классов на этом этапе.
        for (const stageClass of stageClasses) {
          if (stageClass.participantLimit === null) continue;

          const currentCount = await tx.registrationClass.count({
            where: {
              classId: stageClass.classId,
              registration: {
                stageId,
                status: 'ACTIVE',
              },
            },
          });

          if (currentCount >= stageClass.participantLimit) {
            throw new ConflictException({
              message: 'Лимит участников в выбранном классе уже достигнут',
              code: 'STAGE_CLASS_PARTICIPANT_LIMIT_REACHED',
              classId: stageClass.classId,
              limit: stageClass.participantLimit,
            });
          }
        }

        // 8. Проверяем регистрацию этого автомобиля
        // на этом этапе.
        //
        // Один участник может иметь несколько машин
        // на одном этапе.
        const existing = await tx.registration.findUnique({
          where: { stageId_carId: { stageId, carId } },
        });

        if (existing?.status === 'ACTIVE') {
          throw new ConflictException('Этот автомобиль уже зарегистрирован на этапе');
        }

        // On-site intake is allowed without an equipment list. Persist an
        // explicitly marked empty draft version to retain the existing FK and
        // immutable registration snapshot; never invent hardware details.
        let chosenVersionId = configurationVersionId;
        let isOnSiteDraft = false;
        if (source === 'ON_SITE' && !chosenVersionId) {
          const draft = await tx.carConfiguration.create({
            data: {
              carId,
              name: 'Запись на месте · конфигурация ожидает заполнения',
              versions: { create: { version: 1, additionalDescription: 'USD_ON_SITE_DRAFT_PENDING' } },
            },
            include: { versions: { select: { id: true } } },
          });
          chosenVersionId = draft.versions[0].id;
          isOnSiteDraft = true;
        }
        const configurationVersion =
          await tx.carConfigurationVersion.findFirst({
            where: {
              id: chosenVersionId,
              configuration: {
                carId,
              },
            },
            include: {
              configuration: true,
              headUnits: true,
              audioComponents: true,
              amplifiers: {
                include: {
                  componentLinks: true,
                },
              },
              batteries: true,
              generators: true,
            },
          });

        if (!configurationVersion) {
          throw new BadRequestException(
            'Выбранная версия конфигурации не принадлежит этому автомобилю',
          );
        }

        // Internal gate placeholders are not real audio configurations. Only
        // the draft created atomically for THIS on-site registration may use
        // one; never let a client reuse a different event's placeholder.
        if (!isOnSiteDraft && configurationVersion.additionalDescription === 'USD_ON_SITE_DRAFT_PENDING') {
          throw new BadRequestException('Служебный черновик конфигурации нельзя использовать для новой регистрации');
        }

        // Configuration completeness is a hard admission rule. Validate on the
        // server so the checks cannot be bypassed by sending a direct API request.
        if (!isOnSiteDraft) {
          for (const stageClass of stageClasses) {
            const missingRequirement = this.getMissingConfigurationRequirement(
              stageClass,
              configurationVersion,
            );
            if (missingRequirement) {
              throw new BadRequestException(missingRequirement);
            }
          }
        }

        // 8. Выдаём минимальные свободные номера, чтобы отменённые
        // регистрации не оставляли пустые места в нумерации наклеек.
        // Удаляем старые резервы отменённой регистрации до поиска свободных
        // номеров: повторная регистрация получает новый номер, если старый уже занят.
        if (existing?.status === 'CANCELLED') {
          await tx.registrationClass.deleteMany({ where: { registrationId: existing.id } });
          await tx.inspection.deleteMany({ where: { registrationId: existing.id } });
          await tx.registrationNumber.deleteMany({ where: { registrationId: existing.id } });
        }

        const bassRaceClassIds = stageClasses
          .filter((item) => this.isBassRaceClass(item.class.name, item.class.direction?.name))
          .map((item) => item.classId);
        const requiredNumberCount = Math.max(1, bassRaceClassIds.length);
        // Older class edits could leave non-primary sticker rows without
        // any class linked to them. Remove those stale reservations before
        // allocating numbers for a different registration.
        await tx.registrationNumber.deleteMany({
          where: { stageId, isPrimary: false, classes: { none: {} } },
        });
        const occupiedRows = await tx.registrationNumber.findMany({
          where: { stageId },
          select: { number: true },
        });
        const occupiedNumbers = new Set(occupiedRows.map((item: { number: number }) => item.number));
        const reservedNumbers: number[] = [];
        let candidateNumber = 1;
        while (reservedNumbers.length < requiredNumberCount) {
          if (!occupiedNumbers.has(candidateNumber)) {
            reservedNumbers.push(candidateNumber);
          }
          candidateNumber += 1;
        }
        const participantNumber = reservedNumbers[0];
        const numberRows = reservedNumbers.map((number) => ({
          id: randomUUID(),
          stageId,
          number,
          isPrimary: number === participantNumber,
        }));

        // A participant has one shared inspection per stage. New registrations inherit it.
        const sharedInspection = await tx.participantStageInspection.findUnique({
          where: { participantId_stageId: { participantId, stageId } },
          select: { id: true, status: true },
        });
        if (sharedInspection?.status === 'FAILED') {
          throw new ConflictException('Участник не допущен к этапу по результатам общей инспекции');
        }
        // 10. Создаём новую регистрацию. Номера связываются
        // с регистрацией после её создания.
        const registrationData = {
          stageId,
          participantId,
          participantStageInspectionId: sharedInspection?.id ?? null,
          carId,
          configurationVersionId: configurationVersion.id,
          configurationSnapshot: {
            configurationPending: isOnSiteDraft,
            configurationId: configurationVersion.configurationId,
            configurationName: configurationVersion.configuration.name,
            version: configurationVersion.version,
            vibrationIsolation: configurationVersion.vibrationIsolation,
            additionalDescription: configurationVersion.additionalDescription,
            headUnits: configurationVersion.headUnits,
            audioComponents: configurationVersion.audioComponents,
            amplifiers: configurationVersion.amplifiers,
            batteries: configurationVersion.batteries,
            generators: configurationVersion.generators,
          },
          participantNumber,
          registeredAt: new Date(),
          ...(consentLegalVersion ? {
            privacyConsentAt: registrationPrivacyConsentAt,
            privacyConsentVersion: 'privacy-v' + consentLegalVersion,
            termsAcceptedAt: registrationTermsAcceptedAt,
            termsVersion: 'terms-v' + consentLegalVersion,
            consentCapturedByUserId,
          } : {}),
          ...(body.rulesAccepted === true ? {
            rulesAcceptedAt: new Date(),
            rulesVersion: publishedRulesVersion || String((stage.rulesSnapshot as any)?.revisionId ?? stage.updatedAt.toISOString()),
          } : {}),
          source,
          status: 'ACTIVE' as const,
        };

        const registration = existing?.status === 'CANCELLED'
          ? await tx.registration.update({ where: { id: existing.id }, data: registrationData })
          : await tx.registration.create({ data: registrationData });

        if (numberRows.length > 0) {
          await tx.registrationNumber.createMany({
            data: numberRows.map((row) => ({
              ...row,
              registrationId: registration.id,
            })),
          });
        }

        const createdNumbers = await tx.registrationNumber.findMany({
          where: { registrationId: registration.id },
          orderBy: [{ isPrimary: 'desc' }, { number: 'asc' }],
        });

        const primaryNumber = createdNumbers.find((item) => item.isPrimary) ?? createdNumbers[0];
        const numberByClassId = new Map<string, string>();
        let bassRaceIndex = 0;

        for (const classId of classIds) {
          const stageClass = stageClasses.find((item) => item.classId === classId)!;
          const number = this.isBassRaceClass(stageClass.class.name, stageClass.class.direction?.name)
            ? createdNumbers[bassRaceIndex++] ?? primaryNumber
            : primaryNumber;
          numberByClassId.set(classId, number.id);
        }

        await tx.registrationClass.createMany({
          data: classIds.map((classId) => ({
            registrationId: registration.id,
            classId,
            numberId: numberByClassId.get(classId)!,
          })),
        });

        return tx.registration.findUniqueOrThrow({
          where: { id: registration.id },
          include: this.registrationInclude,
        });
      },
    );
    void this.emailNotifications?.registrationConfirmed(registration).catch((error) => {
      this.logger.error('Registration confirmation email could not be prepared: ' + (error instanceof Error ? error.name : 'UnknownError'));
    });
    return registration;
  }
  // ==========================================
  // ОТМЕНА
  // ==========================================

  async cancel(id: string, request: AuthenticatedRequest) {
    const registration =
      await this.prisma.registration.findUnique({
        where: {
          id,
        },
        include: {
          results: {
            select: { id: true },
          },
          stage: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

    if (!registration) {
      throw new NotFoundException(
        'Регистрация не найдена',
      );
    }

    if (
      registration.status === 'CANCELLED'
    ) {
      throw new BadRequestException(
        'Регистрация уже отменена',
      );
    }

    if (registration.results.length > 0) {
      throw new ConflictException(
        'Нельзя отменить регистрацию: по ней уже внесён результат',
      );
    }

    if (registration.stage.status === 'COMPLETED') {
      throw new ConflictException(
        'Нельзя отменить регистрацию после завершения этапа',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Serialize cancellation with registration creation for this stage.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${registration.stage.id}))
      `;

      // Keep the cancelled registration and audit log, but release every
      // sticker number so another active registration can use it.
      await tx.registrationClass.deleteMany({ where: { registrationId: id } });
      await tx.inspection.deleteMany({ where: { registrationId: id } });
      await tx.registrationNumber.deleteMany({ where: { registrationId: id } });

      // Keep Prisma's stage/participantNumber uniqueness intact by assigning
      // the cancelled audit row a unique negative archival value. Sticker
      // allocation only uses positive numbers, so the released number is reusable.
      const lowestNumber = await tx.registration.aggregate({
        where: { stageId: registration.stage.id },
        _min: { participantNumber: true },
      });
      const archivalNumber = Math.min(lowestNumber._min.participantNumber ?? 0, 0) - 1;

      const changed = await tx.registration.update({
        where: {
          id,
        },
        data: {
          status: 'CANCELLED',
          participantNumber: archivalNumber,
        },
        include:
          this.registrationInclude,
      });

      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: 'REGISTRATION_CANCELLED',
          entity: 'Registration',
          entityId: id,
          metadata: {
            stageId: registration.stage.id,
            participantId: registration.participantId,
            carId: registration.carId,
          },
        },
      });

      return changed;
    });

    if (typeof this.emailNotifications?.registrationCancelled === 'function') {
      void Promise.resolve(this.emailNotifications.registrationCancelled(updated.id, new Date())).catch(() => undefined);
    }
    return updated;
  }

}
