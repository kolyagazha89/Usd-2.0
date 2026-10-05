import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SiteSettingsShape = {
  branding: {
    siteName: string;
    logoUrl: string | null;
    mobileLogoUrl: string | null;
    faviconUrl: string | null;
    organizationName: string;
  };
  homepage: {
    blocks: Array<{ id: string; enabled: boolean; title?: string | null }>;
    heroTitle: string;
    heroSubtitle: string;
    showNextStage: boolean;
    showLatestResults: boolean;
    showRecords: boolean;
    showParticipants: boolean;
    showLiveStream: boolean;
    showLiveResults: boolean;
  };
  stream: {
    enabled: boolean;
    provider: 'YOUTUBE' | 'VK' | 'RUTUBE' | 'CUSTOM';
    url: string;
    embedUrl: string;
    title: string;
    autoShowOnStageDay: boolean;
    showChat: boolean;
  };
  liveResults: {
    enabled: boolean;
    stageId: string | null;
    refreshSeconds: number;
    showOnlyPublished: boolean;
  };
  navigation: { items: Array<{ id: string; label: string; path: string; enabled: boolean; sortOrder: number }> };
  contacts: Record<string, string>;
  social: Record<string, string>;
  seo: Record<string, string>;
  legal: Record<string, string>;
  footer: Record<string, string>;
  registration: Record<string, unknown>;
  updatedAt?: string;
};

const DEFAULTS: SiteSettingsShape = {
  branding: { siteName: 'USD 2.0', logoUrl: null, mobileLogoUrl: null, faviconUrl: null, organizationName: 'USD Russia' },
  homepage: {
    blocks: [
      { id: 'hero', enabled: true, title: null },
      { id: 'next-stage', enabled: true, title: 'Ближайший этап' },
      { id: 'live-stream', enabled: true, title: 'Прямая трансляция' },
      { id: 'live-results', enabled: true, title: 'Результаты LIVE' },
      { id: 'latest-results', enabled: true, title: 'Последние результаты' },
      { id: 'records', enabled: true, title: 'Рекорды' },
      { id: 'participants', enabled: true, title: 'Участники' },
    ],
    heroTitle: 'United Sound Derby',
    heroSubtitle: 'Официальный чемпионат по автозвуку',
    showNextStage: true,
    showLatestResults: true,
    showRecords: true,
    showParticipants: true,
    showLiveStream: true,
    showLiveResults: true,
  },
  stream: { enabled: false, provider: 'YOUTUBE', url: '', embedUrl: '', title: 'USD LIVE', autoShowOnStageDay: true, showChat: false },
  liveResults: { enabled: true, stageId: null, refreshSeconds: 5, showOnlyPublished: true },
  navigation: { items: [] },
  contacts: {}, social: {}, seo: {}, legal: {}, footer: {},
  registration: { enabled: true, price: 2000, additionalClassPrice: 2000 },
};

@Injectable()
export class SiteSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private merge<T>(base: T, value: unknown): T {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
    return { ...(base as any), ...(value as any) };
  }

  private toShape(row: any): SiteSettingsShape {
    const s = row ?? {};
    return {
      branding: this.merge(DEFAULTS.branding, s.branding),
      homepage: this.merge(DEFAULTS.homepage, s.homepage),
      stream: this.merge(DEFAULTS.stream, s.stream),
      liveResults: this.merge(DEFAULTS.liveResults, s.liveResults),
      navigation: this.merge(DEFAULTS.navigation, s.navigation),
      contacts: s.contacts ?? DEFAULTS.contacts,
      social: s.social ?? DEFAULTS.social,
      seo: s.seo ?? DEFAULTS.seo,
      legal: s.legal ?? DEFAULTS.legal,
      footer: s.footer ?? DEFAULTS.footer,
      registration: s.registration ?? DEFAULTS.registration,
      updatedAt: row?.updatedAt?.toISOString?.() ?? undefined,
    };
  }

  async getAdmin() {
    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    return { success: true, settings: this.toShape(row) };
  }

  async getPublic() {
    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const settings = this.toShape(row);
    return {
      success: true,
      settings: {
        branding: settings.branding,
        homepage: settings.homepage,
        stream: settings.stream,
        liveResults: settings.liveResults,
        navigation: settings.navigation,
        contacts: settings.contacts,
        social: settings.social,
        seo: settings.seo,
        footer: settings.footer,
        registration: settings.registration,
      },
    };
  }

  async update(input: Partial<SiteSettingsShape>, userId: string) {
    const current = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const currentShape = this.toShape(current);
    const next = {
      branding: this.merge(currentShape.branding, input.branding),
      homepage: this.merge(currentShape.homepage, input.homepage),
      stream: this.merge(currentShape.stream, input.stream),
      liveResults: this.merge(currentShape.liveResults, input.liveResults),
      navigation: this.merge(currentShape.navigation, input.navigation),
      contacts: input.contacts ?? currentShape.contacts,
      social: input.social ?? currentShape.social,
      seo: input.seo ?? currentShape.seo,
      legal: input.legal ?? currentShape.legal,
      footer: input.footer ?? currentShape.footer,
      registration: input.registration ?? currentShape.registration,
    };
    const row = await this.prisma.siteSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...next },
      update: { ...next },
    });
    await this.prisma.auditLog.create({
      data: { userId, action: 'SITE_SETTINGS_UPDATED', entity: 'SiteSettings', entityId: 'default', metadata: { sections: Object.keys(input) } },
    });
    return { success: true, settings: this.toShape(row) };
  }
}