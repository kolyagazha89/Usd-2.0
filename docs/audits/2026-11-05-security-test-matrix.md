# USD — матрица негативных проверок API

Дата05.11.2026. Только localhost:3302 и disposable-аккаунты. A/B — участники с разными закрытыми данными, C — подтверждённый аккаунт без профиля; hidden — закрытый непривязанный профиль. Значения токенов/паролей не записаны. Положительные контроли и последующая сверка БД нужны для интерпретации403/400.

| Сценарий | Метод / маршрут | HTTP | Интерпретация |
|---|---|---|---|
| login-a | POST /auth/login | 201 | Ожидаемый результат |
| login-b | POST /auth/login | 201 | Ожидаемый результат |
| login-c | POST /auth/login | 201 | Ожидаемый результат |
| positive-me | GET /auth/me | 200 | Ожидаемый результат |
| positive-own-profile | GET /participants/me | 200 | Ожидаемый результат |
| positive-own-config | GET /configurations/{A_configurationId} | 200 | Ожидаемый результат |
| positive-owner-registration | GET /registrations/{B_registrationId} | 200 | Ожидаемый результат |
| mass-assignment-role | PATCH /participants/me | 400 | Ожидаемый результат |
| mass-assignment-isAdmin | PATCH /participants/me | 400 | Ожидаемый результат |
| mass-assignment-customRoleId,permissions | PATCH /participants/me | 400 | Ожидаемый результат |
| mass-assignment-user | PATCH /participants/me | 400 | Ожидаемый результат |
| mass-assignment-participantId | PATCH /participants/me | 400 | Ожидаемый результат |
| mass-assignment-__proto__ | PATCH /participants/me | 200 | Ключи проигнорированы, роль не изменилась |
| mass-assignment-constructor | PATCH /participants/me | 200 | Ключи проигнорированы, роль не изменилась |
| login-role-injection | POST /auth/login | 400 | Ожидаемый результат |
| self-admin-role | PATCH /auth/admin/users/{A_userId}/role | 403 | Ожидаемый результат |
| self-admin-custom-role | PATCH /auth/admin/users/{A_userId}/custom-role | 403 | Ожидаемый результат |
| create-admin-as-participant | POST /auth/admin/users | 403 | Ожидаемый результат |
| admin-read-/auth/admin/users | GET /auth/admin/users | 403 | Ожидаемый результат |
| admin-read-/auth/admin/roles | GET /auth/admin/roles | 403 | Ожидаемый результат |
| admin-read-/admin/participants | GET /admin/participants | 403 | Ожидаемый результат |
| admin-read-/registrations | GET /registrations | 403 | Ожидаемый результат |
| admin-read-/media/library | GET /media/library | 403 | Ожидаемый результат |
| header-role-spoof | GET /auth/admin/users | 403 | Ожидаемый результат |
| jwt-payload-admin-forged | GET /auth/admin/users | 401 | Ожидаемый результат |
| jwt-alg-none | GET /auth/me | 401 | Ожидаемый результат |
| anonymous-private | GET /participants/me | 401 | Ожидаемый результат |
| idor-private-profile-public-route | GET /participants/{B_participantId} | 404 | Ожидаемый результат |
| idor-private-car-public-route | GET /cars/{B_carId} | 404 | Ожидаемый результат |
| idor-patch-profile | PATCH /participants/{B_participantId} | 403 | Ожидаемый результат |
| idor-patch-car | PATCH /cars/{B_carId} | 403 | Ожидаемый результат |
| idor-transfer-own-car | PATCH /cars/{A_carId} | 400 | Ожидаемый результат |
| idor-car-configurations | GET /cars/{B_carId}/configurations | 403 | Ожидаемый результат |
| idor-config-details | GET /configurations/{B_configurationId} | 403 | Ожидаемый результат |
| idor-config-versions | GET /configurations/{B_configurationId}/versions | 403 | Ожидаемый результат |
| idor-registration | GET /registrations/{B_registrationId} | 403 | Ожидаемый результат |
| idor-cancel-registration | DELETE /registrations/me/{B_registrationId} | 403 | Ожидаемый результат |
| idor-registration-version | PATCH /registrations/{B_registrationId}/configuration | 403 | Ожидаемый результат |
| idor-create-config | POST /cars/{B_carId}/configurations | 403 | Ожидаемый результат |
| sql-email-login | POST /auth/login | 400 | Ожидаемый результат |
| sql-password-login | POST /auth/login | 401 | Ожидаемый результат |
| json-password-login | POST /auth/login | 400 | Ожидаемый результат |
| sql-password-delay-probe | POST /auth/login | 401 | Ожидаемый результат |
| sql-string-profile | PATCH /participants/me | 200 | Ожидаемый результат |
| sql-historical-search | POST /auth/profile/historical-candidates | 201 | Строка поиска, обхода нет |
| sql-string-profile | PATCH /participants/me | 200 | Ожидаемый результат |
| sql-historical-search | POST /auth/profile/historical-candidates | 201 | Строка поиска, обхода нет |
| sql-string-profile | PATCH /participants/me | 200 | Ожидаемый результат |
| sql-historical-search | POST /auth/profile/historical-candidates | 201 | Строка поиска, обхода нет |
| json-object-profile-field | PATCH /participants/me | 400 | Ожидаемый результат |
| json-object-historical-link | POST /auth/profile/link-historical | 500 | SEC-04: нет валидации типа |
| hidden-public-profile | GET /participants/{HIDDEN_participantId} | 404 | Ожидаемый результат |
| hidden-public-car | GET /cars/{HIDDEN_carId} | 404 | Ожидаемый результат |
| hidden-historical-candidate | POST /auth/profile/historical-candidates | 201 | SEC-01: приватные данные в ответе |
| forbidden-historical-link | POST /auth/profile/link-historical | 403 | Ожидаемый результат |
| forbidden-session-delete | DELETE /auth/admin/users/{B_userId}/sessions | 403 | Ожидаемый результат |
| store-benign-xss-marker | PATCH /participants/me | 200 | Ожидаемый результат |
| logout-a | POST /auth/logout | 201 | Ожидаемый результат |
| access-after-logout | GET /auth/me | 200 | SEC-02: старый access принят |
| refresh-after-logout | POST /auth/refresh | 401 | Ожидаемый результат |
| extra-login-a | POST /auth/login | 201 | Ожидаемый результат |
| extra-login-b | POST /auth/login | 201 | Ожидаемый результат |
| media-foreign-car | POST /media/prepare | 403 | Ожидаемый результат |
| media-foreign-profile | POST /media/prepare | 403 | Ожидаемый результат |
| media-site-asset-admin-only | POST /media/prepare | 403 | Ожидаемый результат |
| media-html-rejected | POST /media/prepare | 400 | Ожидаемый результат |
| media-svg-car-rejected | POST /media/prepare | 400 | Ожидаемый результат |
| media-docx-car-rejected | POST /media/prepare | 400 | Ожидаемый результат |
| media-target-traversal | POST /media/prepare | 403 | Ожидаемый результат |
| media-invalid-target-type | POST /media/prepare | 400 | Ожидаемый результат |
| media-foreign-private-file | GET /media/private-file/CAR_PHOTO/{B_carId} | 403 | Ожидаемый результат |
| media-foreign-private-view | GET /media/view/CAR_PHOTO/{B_carId} | 403 | Ожидаемый результат |
| media-fake-complete-token | POST /media/complete | 400 | Ожидаемый результат |
| media-json-token-rejected | POST /media/complete | 400 | Ожидаемый результат |
| cors-foreign-origin-read | GET /participants | 200 | Ожидаемый результат |
| csrf-foreign-logout | POST /auth/logout | 403 | Ожидаемый результат |
| csrf-session-survives-blocked-logout | GET /auth/me | 200 | Ожидаемый результат |
| password-change-fixture | POST /auth/change-password | 201 | Ожидаемый результат |
| access-after-password-change | GET /auth/me | 200 | SEC-02: старый access принят |
| refresh-after-password-change | POST /auth/refresh | 401 | Ожидаемый результат |
| old-password-after-change | POST /auth/login | 401 | Ожидаемый результат |
| server-after-malformed-input | GET /auth/me | 200 | Ожидаемый результат |
| race-before-login-b | POST /auth/login | 201 | Ожидаемый результат |
| reset-race-first | POST /auth/reset-password | 201 | SEC-06: оба конкурентных запроса201 |
| reset-race-second | POST /auth/reset-password | 201 | SEC-06: оба конкурентных запроса201 |
| reset-token-reuse-after-race | POST /auth/reset-password | 400 | Ожидаемый результат |
| access-after-password-reset | GET /auth/me | 200 | SEC-02: старый access принят |

Всего87 HTTP-запросов. Дополнительные literal-storage, disclosure, CORS-header и DB-integrity проверки записаны отдельно. UI-попытки через инпуты не включены в этот счётчик.

SQL-строки были неразрушающими: сравнения OR, UNION/null и одиночная pg_sleep(1) проба. DROP/DELETE дампов и атак production не было. Приватность проверялась на специально созданных синтетических данных.