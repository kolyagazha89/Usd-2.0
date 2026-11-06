# USD autodeploy: достоверные состояния и безопасные повторы

Спецификация: USD_MASTER_PLAN.md §2–3, AGENTS.md. Запрос владельца: «перепиши автодеплой, чтоб таких блокеров больше не было». База: main 00ea6534. Реализация ограничена orchestration/диагностикой, существующие CI/signature/backup/restore/additive-SQL/rollback gates обязательны.

## Контракт

Обычный релиз и уже разрешённая строго добавочная миграция проходят через существующие проверенные исполнители автоматически. Ожидание CI/образов/сети не считается установленным релизом и не отравляет SHA карантином. Неодобренная политика, небезопасная миграция и повреждённый текущий релиз дают немедленный конкретный статус. После изменяющей БД/переключающей контейнеры ошибки сохраняется консервативная остановка. Production БД, apex/DNS, approvals и секреты при разработке не изменяются.

### Интерфейс attempt-status v1

Отдельный `/run/usd-deployer/status.json`, root-owned директория 0755 и файл 0644; `/var/lib/usd-deployer` остаётся 0700. Только фиксированные поля, SHA/UUID, фазы/коды причин и время, никаких исключений/журналов/путей/данных окружения. Запись атомарная, обновление только с текущим attempt ID. Чтение ограничено размером и валидирует версию, поля, типы, владельца/права/симлинки и разумное время.

Фазы: running/waiting/blocked/failed/succeeded. Причины из закрытого словаря, retryable выводится из причины. Успех содержит SHA завершённого кандидата; `.env`/built-marker сами по себе успех не доказывают. Старый success после lock-busy или ранней ошибки не принимается как новый.

### Runner

Один root-owned установленный Python requester; unprivileged runner не checkout-ит репозиторий, не получает Docker/секреты/новые sudo-права. Единственная sudo-команда — прежний systemctl start. До/после неё читается безопасный статус; pending повторяется с ограниченным бюджетом, blocker завершается сразу, exact public verifier вызывается только для подтверждённого SHA актуальной попытки, а не нового main. Неизвестная/старая версия helper требует явного обновления установки.

### Исполнитель

Все выходы auto-deploy получают состояния. Отказ read-only проверки миграции не записывает failed-release-sha, apply/post-switch отказ остаётся карантином. Уже совпавший tag дополнительно проверяет реально запущенные API/frontend и публичную ревизию; неполный выпуск после прерывания становится явным blocker. Не вводится автоматическое переписывание privileged helpers из публичной ветки.

### Диагностика

Разница публичных Prisma trees означает только `schema_changed_host_eligibility_unknown`. Без root-отчёта нельзя утверждать, что хост остановился именно на миграции. Документирован точный разовый upgrade reviewed helpers и проверка протокола; установка не меняет approvals/DB и не включает timer автоматически.

## Исполнение и проверка

1. [x] RED: status storage/validation + requester state transitions (freshness, wrong protocol, stale success, moving main, retries, blockers).
2. [x] GREEN: минимальные stdlib Python status/request helpers, интеграция auto-deploy/installer/service/workflow; исправление ложной диагностики.
3. [x] Регрессии существующего auto-deploy/release/migration + текущая ProfileLinkRequest SQL; root-only shell fixtures только внутри изолированного контейнера без сети.
4. [x] Дополнительный adversarial review другой моделью; устранение важных замечаний через RED→GREEN.
5. [ ] Exact-SHA CI/PR и #114. Ubuntu installed/deployed/live accepted отдельно; до SSH/проверенной установки не отмечать выполненными.

Команды: `python3 deploy/home-pc/test-deploy-status.py -v`, `python3 deploy/home-pc/test-request-deploy.py -v`, `python3 deploy/home-pc/test-deploy-diagnostics.py -v`, `python3 deploy/home-pc/test-safe-schema-migration.py -v`; `bash deploy/home-pc/test-auto-deploy.sh`, `bash deploy/home-pc/test-release.sh` (UID0, изолированные mock fixtures), `bash -n deploy/home-pc/*.sh`. В CI сохранить все старые safety проверки, добавить новые; не ослаблять failing tests ради зелёного результата.

## Решения

- Сохранить существующие исполнители backup/restore, SQL allowlist и rollback вместо их полной замены: это уменьшает область риска.
- Кодовая версия в GitHub не доказывает версию установленного root-helper. Обновление привилегированного исполняемого кода остаётся контролируемой установкой.
- Повтор до переключения образов не равен разрешению повторять неизвестно завершившуюся миграцию. Apply failures остаются закрытыми.

## Дополнение после независимого cross-model review

- Приватный guard с fsync ставится ДО live apply и .env switch; сохраняется при TERM/SIGKILL, одноразовый rollback не откатывает БД. Reconcile после неизвестно завершившейся mutation требует оператора.
- Attempt привязан к systemd InvocationID, не только UUID из JSON.
- Другой completed SHA должен совпадать с независимым текущим main ref; старый coalesced релиз не подтверждает новый trigger.
- Все inspect-команды должны завершиться успешно, ID должен быть непустым sha256; равенство пустых outputs не доказывает already-current.
- Readiness читает действующий private schema-pin, не immutable bootstrap.
- Новые stdlib helpers проверены 9 status +11 requester tests. Полный root mock deploy/rollback и все Python safety suites прошли в изолированном контейнере без сети; сервер не изменялся.
