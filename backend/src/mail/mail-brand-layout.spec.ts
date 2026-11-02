import { renderUsdMailShell } from './mail-brand-layout';

describe('premium USD email shell', () => {
  const base = {
    heading: 'Подтверждение email',
    bodyHtml: '<p>Проверьте адрес аккаунта USD.</p>',
    actionUrl: 'https://app.usd-russia.ru/verify-email?token=fixture',
    actionLabel: 'Подтвердить адрес',
    frontendUrl: 'https://app.usd-russia.ru',
    footerHtml: 'Срок действия ссылки ограничен.',
  };

  it('keeps branded hierarchy and a robust responsive email table', () => {
    const html = renderUsdMailShell(base);
    expect(html).toContain('lang="ru"');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('max-width:620px');
    expect(html).toContain('width="600"');
    expect(html).toContain('border-bottom:4px solid #ed2638');
    expect(html).toContain('ULTIMATE<br>SOUND<br>DESTRUCTION');
    expect(html).toContain('Подтверждение email');
    expect(html).toContain('Подтвердить адрес');
    expect(html).toContain('href="https://app.usd-russia.ru/verify-email?token=fixture"');
    expect(html).toContain('Официальный сайт соревнований');
    expect(html).not.toContain('<script');
  });

  it('escapes editable heading, preheader, CTA and all link attributes', () => {
    const html = renderUsdMailShell({
      ...base,
      heading: '<img src=x onerror=alert(1)>',
      actionLabel: '<b>Click</b>',
      actionUrl: 'https://app.usd-russia.ru/?a=" onclick="evil',
      preheader: '<script>alert(1)</script>',
      footerLinkHref: 'https://app.usd-russia.ru/?a=" bad="value',
      footerLinkText: 'USD <ADMIN>',
    });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;Click&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a=&quot; onclick=&quot;evil');
    expect(html).toContain('USD &lt;ADMIN&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('allows a trusted CMS logo and a distinct notifications link', () => {
    const html = renderUsdMailShell({
      ...base,
      logoHtml: '<img alt="Логотип USD" src="https://app.usd-russia.ru/branding.png">',
      footerLinkHref: 'https://app.usd-russia.ru/participant?tab=profile',
      footerLinkText: 'Управление уведомлениями',
    });
    expect(html).toContain('alt="Логотип USD"');
    expect(html).toContain('Управление уведомлениями');
    expect(html).toContain('href="https://app.usd-russia.ru/participant?tab=profile"');
  });
});
