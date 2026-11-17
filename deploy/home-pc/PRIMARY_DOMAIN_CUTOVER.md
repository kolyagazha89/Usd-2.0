# USD — финальный перенос на usd-russia.ru

**Владелец отдельно одобрил перенос 17.11.2026.** REG.RU уже указывает `usd-russia.ru` на CloudPub, и независимые GET показали открытие страницы этапов и результатов с live API после [PR #598](https://github.com/kolyagazha89/Usd-2.0/pull/598). Корневой сайт — основная публичная точка; API остаётся на `api.usd-russia.ru`. БД и RustFS не переносятся.

## Выполнено в коде

- Signed frontend GHCR после этого PR генерирует canonical, Open Graph, structured data и `robots.txt` с **`https://usd-russia.ru`** по умолчанию. При необходимости владельцем можно вернуть старый build origin `USD_PUBLIC_SITE_ORIGIN=https://app.usd-russia.ru`; другие домены недопустимы.
- Production API использует только проверенный `https://usd-russia.ru` для новых адресов аккаунта, писем, сброса/смены email, уведомлений, Google callback и sitemap. Старая `FRONTEND_URL=https://app.usd-russia.ru` остаётся внутренним значением root-owned deploy gate; ни `.env`, ни `APP_DOMAIN`, ни `API_DOMAIN`, ни baseline backup-механизм не меняем. Новые токены в письмах не теряются при переходе.
- API PR #598 принимает browser requests с root + app по строгому списку HTTPS origins; никакого wildcard.
- Nginx frontend переводит HTTP-Host `app.usd-russia.ru` на `https://usd-russia.ru$request_uri` постоянным 301, сохраняя глубокие ссылки и query. Разрешены только фиксированные домены; перенос происходит **после** наличия исправного root HTTPS. При этом `/usd-release.json`, `/usd-push-sw.js`, `/usd-offline-sw.js`, `/manifest.webmanifest` остаются доступными на прежнем origin для существующих PWA, PUSH и protected SHA gate.
- Nginx знает о `www.usd-russia.ru` и будет редиректить его только **после** отдельной регистрации www в CloudPub, DNS и HTTPS. Установка этого PR не создаёт DNS и сертификаты.
- LIVE browser QA теперь делает только анонимные GET/HEAD/OPTIONS root и API; реальные POST/регистрации не выполняются автоматом.

## Приёмка после зелёных main CI + Ubuntu update

1. Проверить один **точный SHA** на трёх endpoints:
   `https://usd-russia.ru/usd-release.json`,
   `https://app.usd-russia.ru/usd-release.json`,
   `https://api.usd-russia.ru/release`.
   Старый app release marker специально отдаёт 200 (без 301), чтобы deployment gate продолжил работать.
2. Проверить `https://usd-russia.ru/`, `/stages`, `/results`, `/documents`, `/login` и инспекцию с нового hostname; реальная API загрузка, изображения, постеры, фото, регламенты и юридические документы без CORS/CSRF и 404.
3. По ответу страницы `/stages` без браузера проверить canonical `https://usd-russia.ru/stages`, OG URL/image тоже root. Проверить `https://usd-russia.ru/robots.txt` на `Sitemap: https://usd-russia.ru/sitemap.xml`, а XML `/sitemap.xml` должен выдавать root URLs только опубликованных этапов.
4. Проверить обычный `https://app.usd-russia.ru/stages?season=2026`: **301** c `Location: https://usd-russia.ru/stages?season=2026`. Не применять этот redirect к API или старым PWA service worker endpoints; `app.usd-russia.ru/usd-release.json` по-прежнему 200.
5. В чистом браузере на реальном телефоне пройти **вход в существующий тестовый аккаунт** с root, проверку личного кабинета и вкладки согласий. Для участника и судьи проверить успешные сохранения без 403. Не создавайте фиктивные результаты и не регистрируйте реального участника только ради теста.
6. По согласованию с владельцем выполнить **одну разрешённую тестовую регистрацию** на тестовом этапе и проверить появление заявки, номера, QR, USD ID, отзыв согласия и сохранение после перезахода. Тестировать email-верификацию и восстановление только на принадлежащем владельцу проверочном адресе; запросы реальных пользователей не изменять.
7. Проверить получение реального тестового письма Яндекс: адрес ссылки root (доставка должна быть подтверждена отдельно, не просто SMTP accept). Старые письма с API verify-email продолжают переадресовывать на root. QR ссылку из приложения создавать относительно `window.location.origin`.
8. Уже установленные PUSH подписки app принадлежат **другому браузерному origin** и не могут переноситься автоматически. Не удалять старую worker-подписку; на root пользователям нужно заново включить PUSH в ЛК. Проверить тестовое PUSH для ADMIN на root после явного consent.
9. Проверить индексацию root через Яндекс Вебмастер и Google Search Console: sitemap, корректные title/description, отсутствие дублей old app. Старые Tilda URL при необходимости сопоставить с новыми маршрутам.
10. Перепроверить после следующего безручного Ubuntu deploy: signed GHCR SHA, live 301, API public data, полный backup и реальные тесты PostgreSQL/RustFS restore на disposable базе.

## Оставшиеся внешние действия

**www:** зарегистрировать `www.usd-russia.ru` в CloudPub, связать с той же frontend-публикацией, получить выданную **для www** CNAME, занести в REG.RU, проверить HTTPS и 301. **Не придумывать CNAME**, не копировать API target, не менять NS/MX/SPF/DKIM/DMARC/TXT Яндекса/Google.

**Авторизованная приёмка:** только реальный браузер владельца или явно предоставленный тестовый аккаунт; безопасные GET-проверки не подтверждают действующую регистрацию, юридические согласия и почтовую доставку.

## Аварийный откат

Если root HTTP/HTTPS перестал открываться после новой сборки, не удалять Docker volumes и не повторять импорт. Сохранить `.env` и SHA; root-owned release rollback вернёт предыдущие подписанные образы при failure. Для ручного отката действовать по `deploy/home-pc/release-approved.sh`/инструкциям; не обходить trusted snapshot. GitHub owner может изменить только repo variable `USD_PUBLIC_SITE_ORIGIN=https://app.usd-russia.ru` для следующего signed frontend image, но это не откат API и не исправление CloudPub, а лишь запасной SEO build origin.

Не менять DNS `api`, `app`, `@` и NS без новой потребности. Не делать `docker compose down -v`. Если CloudPub теряет Host при проксировании, server-side nginx 301 может не сработать: сначала подтвердить через публичный HTTP ответ, а затем настроить редирект в CloudPub, не используя произвольный `X-Forwarded-Host` для небезопасного обхода.
