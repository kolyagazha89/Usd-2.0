# USD — private home media storage and Yandex SMTP

This is an **optional staged change** for the existing Hyper-V/Ubuntu stack. Do not wipe the restored DB, existing S3 store, or media metadata. The home PC is the primary host. CloudPub remains only the HTTPS transport for `app.usd-russia.ru` and `api.usd-russia.ru`.

## 1. Media: SeaweedFS S3-compatible server

We use SeaweedFS instead of an archived MinIO community release. `compose.storage.yaml` adds a private service named `storage` on the same Docker `usd-internal` network, with durable Docker volume `usd_storage_data`. **It exposes no host port and no CloudPub route.** Backend HTTP upload via `PUT /media/upload` and public asset reads via `GET /media/public-file/...` are already implemented in `MediaService`.

Important: some authenticated view/media-library preview functions still return internally signed storage URLs. They need an API-only proxy before local SeaweedFS can support every private preview in the browser. Do not publish port 8333 just to make those URLs reachable.

### Environment (on Ubuntu, edit the existing private `deploy/home-pc/.env`)

```dotenv
S3_ENDPOINT=http://storage:8333
S3_REGION=us-east-1
S3_BUCKET=usd-media
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=<create-a-unique-non-public-access-key>
S3_SECRET_ACCESS_KEY=<create-a-long-random-secret>
```

Never put real credentials in GitHub, chat, logs, screenshots or unencrypted backups. If the current deployment already points to a working production S3 bucket, migrate its **objects** before switching S3_ENDPOINT. PostgreSQL rows and an existing dump only store references/metadata; they do **not** contain photos, posters or DOCX files. Take an independent verified backup before touching storage config.

To inspect the merged Compose file without printing sensitive interpolated values:

```bash
cd ~/usd-src/deploy/home-pc
sudo docker compose -f compose.yaml -f compose.storage.yaml config --quiet
sudo docker compose -f compose.yaml -f compose.storage.yaml pull storage
sudo docker compose -f compose.yaml -f compose.storage.yaml up -d storage
sudo docker compose -f compose.yaml -f compose.storage.yaml ps storage
sudo docker compose -f compose.yaml -f compose.storage.yaml logs --tail=50 storage
```

Do not restart the API until its environment is correct and old media objects are safely migrated (or the old store has been confirmed empty). The service uses the first run to create its private bucket from `S3_BUCKET`. Then restart the API through the same set of Compose files:

```bash
sudo docker compose -f compose.yaml -f compose.local.yaml -f compose.storage.yaml up -d api
```

The matching `compose.local.yaml` preserves the existing local smoke-test ports. Use the full set of overlays for future `up` commands. Never use `down -v` or `prisma migrate reset`.

### Release acceptance for media

Test a new JPG and PNG via the admin site and a participant-owned photo; check display through the public API, full-size file, site banner, event poster, DOCX rules download, permission checks, and media-library preview. Validate historical media copied from the old S3 source. Back up S3 storage to a separate physical disk and at least one external encrypted destination and perform a restore drill.

## 2. Email: Yandex SMTP (already supported by NestJS)

MailService already uses Nodemailer SMTP if neither Resend nor fully configured Gmail API is chosen. The existing notification templates, registration mails, account verification, reminders and admin test endpoint can stay unchanged.

Create a Yandex 360 for Business mailbox such as `notifications@usd-russia.ru` only **after you actually provision the mailbox**. Use its own app password, **not** the Yandex account password. Enable mail-client access in Yandex Mail settings.

In the existing private `.env`:

```dotenv
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<real-mailbox-address>
SMTP_PASSWORD=<Yandex-Mail-application-password>
SMTP_FROM=<same-real-mailbox-address>
SMTP_EGRESS_ALLOWED=true
```

`MailService` selects Resend first, then **complete** Gmail API, then SMTP. If switching to Yandex, remove `RESEND_API_KEY` and `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_EMAIL` from the API's environment. **Do not remove GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or GOOGLE_TOKEN_ENCRYPTION_KEY:** those may be required for Google OAuth login/integrations and decoding existing tokens.

Check connection to Yandex SMTP from Ubuntu before restarting the API:

```bash
timeout 12 openssl s_client -connect smtp.yandex.ru:465 -servername smtp.yandex.ru -brief </dev/null
```

The real SMTP provider selection can be verified in **Admin -> Mail -> Status**, backed by `GET /mail/status` (ADMIN-only); use Admin's **Test email** endpoint `POST /mail/test` and verify inbox, Spam, confirmation/reset and notification triggers. Provider acceptance is not proof of inbox delivery.

### DNS for custom-domain Yandex 360 mailbox

If receiving mail for `usd-russia.ru` via Yandex 360, configure the provider-provided MX and DKIM plus the applicable SPF in the authoritative DNS provider (for example REG.RU), **without touching the app/api CNAMEs**. Official Yandex example: MX `@` priority 10 -> `mx.yandex.net.`, TXT `mail._domainkey` -> the unique Yandex DKIM value, TXT `@` -> `v=spf1 redirect=_spf.yandex.net` when Yandex is the only permitted outgoing sender. Do not replace working MX or an existing SPF record without confirming existing mail routing and permitted providers. Consider a staged DMARC policy after authenticating real mail.

Official instructions: https://www.yandex.ru/support/yandex-360/business/mail/ru/mail-clients/others and https://yandex.ru/support/yandex-360/business/admin/ru/domains/dns/ .

## Production gates

- Local storage is a single point of failure: monitor disks and reserve sufficient free space.
- Upgrade the unsupported Windows host and use an SSD, an UPS and off-host encrypted backups before accepting real registrations.
- Validate CloudPub upload size limits and API timeouts for 10-MB photos.
- No additional public storage domain, S3 ports, DB ports or admin consoles should be exposed.
