# Автодеплой USD: состояния попыток и безопасные повторы

Root-owned deployer продолжает проверять точный main SHA/CI, обе подписанные OCI identity, историю Prisma, fresh backup/full restore, строго добавочный SQL и откат API/frontend. Существующая выбранная оператором backup policy не меняется. Принятый второй диск того же ПК **не является off-host копией** и не закрывает финальные требования мастер-плана.

## Что происходит автоматически

| Состояние | Поведение requester |
| --- | --- |
| CI, образы, подписи или сеть ещё не готовы | Ожидание и повтор с ограниченным бюджетом; публичная ревизия пока не проверяется |
| Безопасная уже разрешённая добавочная миграция | Существующие check → fresh backup → full isolated restore → apply; затем образы |
| Отказ read-only migration check | Явный blocker без карантина: база ещё не изменялась |
| Нет политики, старая версия helpers, схема не подходит | Немедленный фиксированный код причины; без двадцати повторов неправильной ревизии |
| Прерван apply или переключение образов | Durable private guard остаётся; автоматический повтор того же SHA запрещён до проверки |
| Подтверждённо завершено | Проверяется SHA именно этой попытки, а не случайно обновившийся main |

Если запрос B присоединился к ещё работающему A, успех A не засчитывается за B. Завершённый другой SHA принимается только если независимый read-only main ref подтверждает, что это текущий main. Точный SHA исходного запроса принимается независимо от последующих коммитов; новый коммит обслужит следующая попытка.

## Протокол и права

`/run/usd-deployer/status.json` — root-owned 0644 в root-owned 0755 директории; только закрытый набор полей, SHA, timestamp, причины, phase и retryability. Systemd сохраняет RuntimeDirectory после завершения oneshot. Отчёт не содержит environment, путей, исключений, SQL, строк БД или journal. Attempt ID совпадает с systemd InvocationID; старый report после lock-busy/ранней ошибки не становится успехом.

`/var/lib/usd-deployer` остаётся 0700. Перед live mutation атомарно и с fsync записывается private `failed-release-sha`. Он очищается только после подтверждённого завершения или подтверждённого отказа до switch. Прерывание после guard может потребовать ручной проверки даже если mutation фактически не успела начаться — это намеренная консервативная граница, а не разрешение повторять неизвестно завершившийся SQL.

Requester исполняется без root и сохраняет единственную прежнюю sudo-команду `systemctl start usd-auto-deploy.service`. Дополнительно читает публичный InvocationID без sudo. Нет checkout на privileged runner, Docker socket, production secrets или новых прав. Отчёт/протокол не разрешает релиз и не создаёт approvals.

У release executor протокол 2: старый executor без durable guard нельзя смешать с новым controller. У status/request протокол 1. Установка новой версии доверенных executables выполняется контролируемо, а не из произвольного public PR.

## Разовое обновление Ubuntu

После review и CI использовать **точный одобренный checkout** согласно `docs/UBUNTU_RELEASE_ACCEPTANCE.md`. На Ubuntu:

```bash
sudo bash deploy/home-pc/install-local-deployer.sh
sudo python3 deploy/home-pc/release-readiness.py --live --json
systemctl cat usd-auto-deploy.service
```

Installer берёт общий deploy lock, устанавливает проверенные root-owned helpers/service, не включает timer, не чистит quarantine, не меняет schema/backup approvals и не трогает production DB/containers. Уже включённый timer сохраняет своё состояние. Для первого нового автоматического запуска должны быть выполнены все исходные host prerequisites.

Явный операторский `--review-quarantined-schema-release` допускает один повтор
текущего проверенного main SHA. Для совпавшего quarantined SHA требуется свежий
read-only `usd-safe-schema-migration --check` с текущим private schema-pin и
root-only `.env`: проверяются deployed API identity, связь pin с deployed source,
неизменность старых миграций, live history/checksums и additive SQL. Pin мог
законно продвинуться после предыдущего релиза; сравнение только с bootstrap pin
не подтверждает текущее состояние. Ошибка проверки сохраняет quarantine.
Успех переносит marker в `reviewed-failed-release-<SHA>` для аудита, не применяя
SQL и не подменяя approvals. Повторный review того же SHA запрещён. Следующий
service launch вновь выполняет CI/signature/fresh backup/full restore gates.
Снятие immutable/append-only атрибута по-прежнему разрешено только для исходного
bootstrap baseline. Обычная установка без флага сохраняет карантин.

После штатной попытки доступны read-only команды:

```bash
/usr/local/libexec/usd-deploy-status read
systemctl show usd-auto-deploy.service --property=InvocationID --property=Result --property=ExecMainStatus
```

Проверить `RuntimeDirectoryPreserve=yes`. Проверить оба `/usd-release.json` и `/release`, журнал root service и безопасный реальный rollout. **До установки и двух unattended SHA-релизов на Ubuntu автодеплой не считать live accepted.**

Если schema pin отличается от bootstrap: runtime source-of-truth — `/var/lib/usd-deployer/schema-pin`; старый `/etc/usd-auto-release-schema` используется только установщиком для первого bootstrap. Не подменять pin ради зелёного статуса.

## Проверки

`python3 deploy/home-pc/test-deploy-status.py -v`, `test-request-deploy.py`, `test-deploy-diagnostics.py`, `test-release-readiness.py`, `test-safe-schema-migration.py`. Root-only mocks `test-auto-deploy.sh`, `test-release.sh` — только изолированная CI/контейнерная среда. Production Docker/PG18 rehearsal остаётся обязательным в Home PC safety CI. Status metadata не является доказательством off-host backup или полной продуктовой приёмки.
