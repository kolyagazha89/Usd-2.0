import { renderBrandedEmail } from './mail.service';

const base = {
  heading: 'Подтверждение email',
  intro: 'Завершите создание аккаунта USD.',
  actionLabel: 'Подтвердить email',
  actionUrl: 'https://api.usd-russia.ru/auth/verify-email?token=example-token&mode=secure',
  note: 'Никому не передавайте ссылку.',
  frontendUrl: 'https://app.usd-russia.ru',
};

describe('USD transactional mail — premium client-safe layout', () => {
  it('builds a branded, responsive, table-based email without remote assets', () => {
    const { html, text, subject } = renderBrandedEmail(base);
    expect(subject).toBe('Уведомление USD');
    expect(html).toContain('lang="ru"');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('width="600"');
    expect(html).toContain('border-bottom:4px solid #ed2638');
    expect(html).toContain('ULTIMATE SOUND DESTRUCTION');
    expect(html).toContain('background:#0d0e11');
    expect(html).toContain('@media only screen and (max-width:620px)');
    expect(html).toContain('name="color-scheme" content="light"');
    expect(html).toContain('href="https://app.usd-russia.ru"');
    expect(html).not.toMatch(/<img\b|<script\b|@import\b|src=["']https?:/i);
    expect(text).toContain('USD · ULTIMATE SOUND DESTRUCTION');
    expect(text).toContain(base.actionUrl);
    expect(text).toContain(base.note);
  });

  it('retains protected action URL while escaping untrusted CMS text and HTML attributes', () => {
    const { html, text, subject } = renderBrandedEmail({
      ...base,
      heading: 'Исходный заголовок',
      template: {
        subject: ' USD — {{heading}} \n уведомление',
        buttonLabel: '<img src=x onerror=alert(1)>',
        body: '{{intro}}\n{{details}}\n<script>alert(1)</script>',
        footer: 'Уведомление <em>USD</em>',
        variableTexts: {
          heading: '<svg onload=alert(1)>',
          intro: 'Проверка <script>опасно</script> и &',
          detailsBefore: '<b>Важное</b>',
        },
      },
    });
    expect(subject).toBe('USD — <svg onload=alert(1)> уведомление');
    expect(html).toContain('&lt;svg onload=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;опасно&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;Важное&lt;/b&gt;');
    expect(html).toContain('Уведомление &lt;em&gt;USD&lt;/em&gt;');
    expect(html).toContain('token=example-token&amp;mode=secure');
    expect(html).not.toContain('<svg onload');
    expect(html).not.toContain('<script>alert');
    expect(text).toContain(base.actionUrl);
  });

  it('keeps text and HTML content coherent for customized mail templates', () => {
    const { html, text, subject } = renderBrandedEmail({
      ...base,
      subject: 'Подтверждение email — USD',
      template: {
        subject: 'Здравствуйте: {{heading}}',
        body: '{{heading}}\n{{intro}}\n{{details}}',
        buttonLabel: 'Перейти к подтверждению',
        footer: 'Если письмо пришло по ошибке,\nпроигнорируйте его.',
        variableTexts: { heading: 'Новый адрес', intro: 'Сначала прочитайте это.', detailsAfter: 'До встречи в USD.' },
      },
    });
    expect(subject).toBe('Здравствуйте: Новый адрес');
    for (const phrase of ['Новый адрес', 'Сначала прочитайте это.', 'До встречи в USD.', 'Перейти к подтверждению']) {
      expect(text).toContain(phrase);
      expect(html).toContain(phrase);
    }
    expect(html).toContain('Если письмо пришло по ошибке,<br>проигнорируйте его.');
    expect(text).toContain('Если письмо пришло по ошибке,\nпроигнорируйте его.');
  });
});
