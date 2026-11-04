# USD — предрелизный аудит от 04.11.2026

**Вердикт: разрешать публичный релиз по результатам этой проверки нельзя.** Найдены дефекты защиты сессий и пробелы приёмки. Это завершённый отчёт текущего статического прохода, **не полный пентест и не полная визуальная приёмка**. Оставшаяся проверка перечислена явно; отсутствие находки не означает отсутствие уязвимостей.

Проверяемая версия: `701d624476505b071edaf8a3985acd4e91b45c7a`.
Требования: [MASTER PLAN](../USD_MASTER_PLAN.md), [tracker #114](https://github.com/kolyagazha89/Usd-2.0/issues/114), AGENTS.md.
База и основной домен не изменялись. Код приложения не изменялся. Платные генерации/сканеры не запускались.

## Метод и охват

Получены 449 файлов backend/src, frontend/src, deployment и workflows плюс Dockerfile, lockfiles и 3 браузерных QA-скрипта. Выполнен целевой статический разбор auth/JWT/RBAC, middleware, загрузок, nginx, Docker, API клиента, CSS и охвата CI. Не каждый из полученных файлов прошёл построчную проверку.
04.11.2026 отправлены реальные версии из обоих lockfile в бесплатный npm bulk advisories API; оба ответа HTTP 200. Backend: advisories для 5 имён пакетов; frontend: пустой ответ. Это не запуск npm audit и не анализ достижимости каждого advisory.
Проверены GitHub Actions для указанного SHA: Backend CI, Frontend CI, Public browser QA, home-PC safety, push, competition journey и API smoke — success. Зелёные Actions не заменяют ручную приёмку.

Все ссылки на исходники ниже закреплены на проверяемом SHA.

## Находки: безопасность и надёжность

### AUTH-01 · P1 · Refresh token доступен JavaScript и постоянно хранится в localStorage
**Подтверждено кодом; самостоятельная XSS не найдена и не воспроизводилась.**
[auth.controller.ts:197](https://github.com/kolyagazha89/Usd-2.0/blob/701d624476505b071edaf8a3985acd4e91b45c7a/backend/src/auth/auth.controller.ts#L197) и :230 возвращают refreshToken в JSON, хотя параллельно ставят HttpOnly cookie.
[api.ts:100](https://github.com/kolyagazha89/Usd-2.0/blob/701d624476505b071edaf8a3985acd4e91b45c7a/frontend/src/api.ts#L100), :107, :112 сохраняют/читают `usd_refresh_token` в localStorage. Срок refresh по умолчанию 30 дней.
**Влияние:** любой исполняющийся в origin вредоносный JS сможет скопировать долгоживущий токен; HttpOnly cookie эту копию не защищает.
**Исправление:** браузерный flow перевести на cookie-only refresh; перестать возвращать refresh в JSON, удалить старое значение из storage, access держать в памяти. Перед этим завершить CSRF-защиту.
**Приёмка:** login/refresh не раскрывают refresh JS; перезагрузка восстанавливает сессию через cookie; logout и гонки refresh проходят тесты.

### AUTH-02 · P1 · Отзыв сессии и смена пароля не отзывают access JWT
**Подтверждённая логика кода, live воспроизведение не выполнено.**
[auth.service.ts:48–53](https://github.com/kolyagazha89/Usd-2.0/blob/701d624476505b071edaf8a3985acd4e91b45c7a/backend/src/auth/auth.service.ts#L48): JWT содержит sub/email/role и живёт 15m.
[JwtAuthGuard](https://github.com/kolyagazha89/Usd-2.0/blob/701d624476505b071edaf8a3985acd4e91b45c7a/backend/src/auth/jwt-auth.guard.ts) проверяет актуальные isActive/emailVerifiedAt/роль, но не session id, revokedAt или версию токенов.
auth.service.ts:834–843, :1226–1245, :1299+ отзывают refreshSession.
**Влияние:** уже украденный access token остаётся рабочим до истечения 15 минут после logout, завершения всех сессий или смены пароля. Блокировка пользователя при этом проверяется — её обход не заявляется.
**Исправление:** связать JWT с session/family и проверять отзыв; для смены пароля — authVersion/issuedAt cutoff.
**Приёмка:** в изолированной среде получить access A, отозвать соответствующий сеанс и повторить безопасный GET с A: ожидается 401. Повторить для смены/reset пароля и bulk revoke.

### SEC-03 · P1 · Конфигурация CSRF допускает молчаливое отсутствие защиты
**Подтверждён дефект конфигурации; успешная cross-site атака не проверена.**
[main.ts:171–186](https://github.com/kolyagazha89/Usd-2.0/blob/701d624476505b071edaf8a3985acd4e91b45c7a/backend/src/main.ts#L171) вызывает optional `enableCsrfProtection` только если метод существует. В полученном коде нет реализации метода/CSRF middleware для auth. CORS сам по себе не запрещает отправку form POST.
auth.controller.ts:38 ставит SameSite=None в production; :213/:246 допускают cookie-only refresh/logout; main.ts принимает urlencoded body.
**Влияние:** наличие CSRF_TRUSTED_ORIGINS не доказывает работающую CSRF-защиту. Как минимум cookie logout требует отдельной проверки на принудительный выход; чтение токена сторонним сайтом не доказано.
**Исправление:** явная Origin/CSRF-проверка cookie-мутаций, fail-closed bootstrap; оценить SameSite=Lax для app/api на одном schemeful site.
**Приёмка:** чужой Origin + cookie на refresh/logout отклоняется; разрешённый app работает; отсутствующий Origin обрабатывается по явной политике.

### MEDIA-04 · P1 · Presigned PUT остаётся действительным после complete
**Архитектурный риск по коду, поведение S3 и bucket policy ещё проверить.**
[media.service.ts:148–166](https://github.com/kolyagazha89/Usd-2.0/blob/701d624476505b071edaf8a3985acd4e91b45c7a/backend/src/media/media.service.ts#L148) выдаёт PUT на тот же objectKey, который complete проверяет и публикует. Подпись ограничена временем, не одноразовая; публикация не перемещает файл на другой ключ.
**Влияние:** владелец ещё действующего PUT потенциально может перезаписать уже проверенный объект после complete, обойти проверку содержимого/размера финальной версии и менять опубликованный файл.
**Исправление:** staging key → проверка → отдельный финальный immutable key; либо привязка к подтверждённой версии/checksum с запретом overwrite.
**Приёмка:** в тестовом bucket PUT A → complete → повторный PUT B по прежней ссылке не изменяет публичный объект; проверить oversized/mismatched payload без воздействия на production.

### MEDIA-05 · P2 · Проверка формата файла ограничена сигнатурой
**Подтверждено кодом; вредоносный документ не отправлялся.**
media.service.ts `validateImageSignature` проверяет стартовые байты JPEG/PNG/RIFF-WEBP, `validateDocxSignature` — только ZIP magic PK0304.
**Влияние:** повреждённый файл или произвольный ZIP может пройти как DOCX; сигнатура не доказывает пригодность к отображению/конвертации. Это не доказательство RCE.
**Исправление:** ограниченный декодер изображений с проверкой размеров/пикселей и re-encode; для DOCX проверить структуру OOXML, лимиты распаковки и обработку внешних связей.
**Приёмка:** неправильный ZIP, truncated image и oversized dimensions безопасно отклоняются.

### WEB-06 · P2 · В frontend nginx отсутствует CSP
**Подтверждено в репозитории; внешние live headers не проверены.**
[frontend/nginx.conf](https://github.com/kolyagazha89/Usd-2.0/blob/701d624476505b071edaf8a3985acd4e91b45c7a/frontend/nginx.conf) задаёт nosniff/frame/referrer/permissions, но не Content-Security-Policy. CSP API из main.ts не защищает React HTML.
**Исправление:** сначала Report-Only, затем ограничить script-src, object-src, base-uri, frame-ancestors и connect/img/font источники с учётом картинок, push и графики. Проверить фактический edge proxy: возможно, CSP уже добавляется там.
**Приёмка:** CSP присутствует на HTML/direct routes, приложение работает без неожиданных нарушений.

### DEP-07 · P1/P2 · Известные advisories backend devDependencies присутствуют в итоговом Docker-образе
**Подтверждён lockfile и Dockerfile; достижимость атак не установлена.**
Backend lockfile: deepmerge 4.3.1 (low), glob 13.0.6 и nested 10.5.0 (moderate), minimatch 10.2.6/nested 9.0.9 (moderate), tmp 0.0.33 (low/high), undici 6.20.1 (включая high). Все отмечены dev=true; число advisory не равно числу эксплуатируемых дыр сайта.
[Dockerfile](https://github.com/kolyagazha89/Usd-2.0/blob/701d624476505b071edaf8a3985acd4e91b45c7a/backend/Dockerfile) делает полный npm ci, сборку в том же stage, без prune/отдельного runtime stage.
Источники: [tmp traversal](https://github.com/advisories/GHSA-ph9p-34f9-6g65), [undici TLS](https://github.com/advisories/GHSA-2m5v-pch6-74hx), [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).
**Исправление:** обновить цепочки через lockfile; multi-stage build с минимальными runtime dependencies. Отдельно проверить Node bundled undici: npm-пакет и встроенный fetch — не одно и то же.
**Приёмка:** повторный dependency scan + тесты + проверка состава финального image.

### OPS-08 · P2 · Backend Dockerfile запускает приложение без USER
**Подтверждено в Dockerfile; runtime override не установлен этой проверкой.**
Финальный stage node:24-bookworm-slim, USER отсутствует; по умолчанию root, если Compose/runtime не задаёт иной UID.
**Влияние:** при компрометации приложения увеличиваются права внутри контейнера; это не доказательство выхода на host.
**Исправление:** непривилегированный UID, корректные права на необходимые пути; проверить cap_drop/no-new-privileges/read-only где совместимо.
**Приёмка:** фактический процесс API работает с ненулевым UID и проходит health/загрузку файлов.

### UX-09 · P2 · При запрете localStorage login/refresh могут сломаться после успешного ответа сервера
**Подтверждён незащищённый доступ; браузерное воспроизведение требуется.**
api.ts:100/:107/:112/:134 используют getItem/setItem без try/catch. При этом clearAuthSession (:128) уже учитывает недоступность storage.
**Влияние:** SecurityError/quota/privacy policy может прервать вход или refresh, хотя cookie уже установлена. Пользователь получает противоречивое состояние.
**Исправление:** cookie-only схема из AUTH-01; до неё — единый safe-storage wrapper.
**Приёмка:** подставить throwing storage в тестовом браузере: вход, reload и выход дают понятное стабильное состояние.

### OPS-10 · P2 · Общая квота auth разделяется всеми посетителями одного IP
**Подтверждено кодом; нагрузочный тест не проводился.**
[security.middleware.ts:25–43](https://github.com/kolyagazha89/Usd-2.0/blob/701d624476505b071edaf8a3985acd4e91b45c7a/backend/src/common/security/security.middleware.ts#L25): login/register/verify/reset/refresh/logout вместе получают 30 запросов на 15 минут на IP.
**Влияние:** общий Wi-Fi соревнований/мобильный NAT может исчерпать квоту для других участников. Несколько refresh также расходуют квоту входа.
**Исправление:** раздельные бюджет/ключи для входа, refresh и recovery; сочетание IP, аккаунта и сессии, аккуратная анти-enumeration политика. Проверить доверие X-Forwarded-For в реальной proxy-цепочке.
**Приёмка:** моделирование общего NAT в staging без блокировки обычных участников; brute-force остаётся ограничен.

## Дизайн/доступность: только риски по исходникам

Визуальный аудит не состоялся: BrowserOS neo MCP недоступен в этом запуске. Скриншоты не получены; выдуманных оценок внешнего вида здесь нет.

### UI-11 · P2 · Малая высота кнопок выбора слайда
[home-results.css:29](https://github.com/kolyagazha89/Usd-2.0/blob/701d624476505b071edaf8a3985acd4e91b45c7a/frontend/src/public/home-results.css#L29) задаёт carousel dots height:7px, width:23px. Требуется проверить итоговый hitbox и интервалы с учётом остальных CSS. Это риск неудобного нажатия; нарушение стандарта автоматически не утверждается.
**Исправление:** оставить визуальную точку маленькой внутри более крупной кнопки; проверить touch/keyboard и видимость фокуса.

### UI-12 · P2 · Автосмена класса не приостанавливается при keyboard focus
HomeScoreboards.tsx:29–33 включает таймер; пауза предусмотрена кнопкой, ручным переключением и onScroll (:44), но нет onFocusCapture/onMouseEnter.
**Влияние:** при фокусе на ссылке внутри текущего слайда таймер может сделать этот слайд inert/aria-hidden; поведение фокуса и screen reader требует браузерной проверки.
**Исправление:** пауза, пока фокус внутри карусели, и при наведении; удобное явное возобновление. Сохранить уже реализованную поддержку reduced motion.
**Приёмка:** Tab внутрь слайда, ждать больше 7 секунд — фокус/видимый контент не меняются неожиданно.

## Пробелы релизной приёмки — не новые подтверждённые баги

- **QA-13 / P1:** candidate-browser-qa.mjs:94,105+ подменяет все remote запросы, включая API/картинки; account-security-browser-qa.mjs также работает с fixtures. Это полезные UI regression tests, но не доказательство live RBAC, почты, сохранения конфигураций и отсутствия потерь данных.
- live public-browser-qa.mjs проверяет анонимные страницы на 1440/390. Этого недостаточно для всех ролей и 320–1920, реальных iOS/Safari, клавиатуры, screen reader, performance.
- В трёх прочитанных browser QA скриптах нет интеграции axe/Lighthouse. Их отсутствие во всём репозитории не утверждается.
- #114 и #409 содержат открытые release требования. Статус checklist может отставать от кода: глобальный лимит классов, выдача/освобождение номеров, исторические конфигурации, results grid должны быть заново проверены на фактическом live SHA. Здесь они не объявляются повторно подтверждёнными дефектами.
- Наличие backup/deploy scripts не доказывает текущий независимый off-host backup, успешный restore, reboot recovery и второй unattended release. Нужны свежие evidence, не дата старого README.
- Не проверены production environment/secrets, server firewall/TLS/proxy, bucket policies, container image vulnerabilities, branch protection, полная история git на секреты, фактические настройки логирования.
- Не выполнены проверки IDOR по всем ресурсам, полная матрица custom roles, гонки регистрации/номеров/результатов, реальные письма/reset links, push iOS/Android, offline conflicts, юридическое утверждение контента.

## Что уже выглядит правильно по коду

JWT secret минимум 32 байта; production secure-cookie/CORS/S3 gates; глобальная whitelist валидация; чтение актуального пользователя/ролей в JWT guard; access token клиента в памяти; hashing refresh tokens и family locking; целевые проверки владельца фото; allowlist image MIME и проверка размера при complete; security headers API и nginx. Это наблюдения о защитах, не сертификат безопасности.

## Порядок доведения до релиза

1. AUTH-01/02 и SEC-03: исправить, добавить изолированные негативные тесты и повторно проверить login/logout/refresh races.
2. MEDIA-04: доказать невозможность изменения файла после complete; MEDIA-05 — безопасная проверка форматов.
3. Убрать уязвимые dev tools из runtime, обновить lockfile, проверить runtime UID и frontend CSP.
4. Поднять изолированную копию данных с обезличиванием; пройти PUBLIC → регистрация → onboarding → машина/конфигурация → этап/номера → инспекция → судейство → публикация/рекорды. Отдельно ADMIN/PARTICIPANT/custom judge и чужие ресурсы.
5. Получить/просмотреть скриншоты каждого шага на 320/390/768/1024/1440/1920; keyboard, axe, Lighthouse, реальный iPhone и Android. Проверить UI-11/12 и UX-09.
6. Записать deployment SHA, результаты CI, backup restore/off-host evidence, rollback/reboot и реальную доступность из РФ без VPN. Отметить в #114 отдельно code/CI/deployed/live accepted.

## Состояние проверки и продолжение

Терминал дважды завершился системной ошибкой Windows CET; локальные build/lint/unit/integration тесты не запускались. Вместо этого считаны результаты уже существующих Actions для точного SHA — они отдельно обозначены.
BrowserOS neo отсутствует в доступных MCP; inventory computer-use также не показал BrowserOS. Ни live скриншоты, ни приватные роли не проверены.
Не использованы все плагины подряд: генерация медиа/дизайна и нерелевантные сервисы не добавляют доказательств. Инструменты с неизвестной стоимостью не запускались.

**Отчёт сохраняет найденное, но полный аудит остаётся незавершённым из-за перечисленных ограничений. Следующий проход начать с восстановления терминала/BrowserOS, свежего SHA и выполнения оставшейся матрицы, сохраняя этот файл.**
