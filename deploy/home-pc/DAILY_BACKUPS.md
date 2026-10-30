# Daily PostgreSQL 18 and media backups

This is the daily backup milestone for [master plan sections 2–3, 12 and 14](../../docs/USD_MASTER_PLAN.md)
and [tracker #114](https://github.com/kolyagazha89/Usd-2.0/issues/114). Installation ships an
**inactive** timer. Repository tests do not prove a real remote backup, physical
independence, installed host configuration, or a restore of the owner's data.
Record those separately with the date, host, code SHA and private receipt ID.
Never change `usd-russia.ru`, DNS, or the historical database for this setup.

The root worker holds `/run/lock/usd-home-deploy.lock`, shared with releases and
installers. It checks the actual local Docker API/frontend image references,
content IDs and revision labels against the deployed SHA; validates PostgreSQL
18, health, credentials and the API's actual server connection; then dumps the
existing database without changing it. It uses the existing root-installed
database off-site, media and full PostgreSQL 18 restore helpers. Prisma commands
run only in an isolated temporary restore using the current API image ID.
It never starts, restarts or switches application services, applies a live
migration, changes historical rows, or deletes retained snapshots.

## Reviewed configuration

Use a root shell on the separately authorized Ubuntu host. Prerequisites:
Python 3.10+, Docker, rclone, Bash, OpenSSL, util-linux/coreutils and systemd.
The live stack must already be the `usd-home` Compose project with the reviewed
`.env` at `/home/usd/usd-deploy/deploy/home-pc/.env` (mode `0600`, no symlinks).
The restore helper requires at least 1.5 GiB available memory and Docker storage
greater than six times the compressed archive plus 2 GiB. Full media download
verification needs temporary free space larger than the source media size.
Budget additional space for every retained local archive and restore.

1. From the reviewed checkout, run `bash deploy/home-pc/install-daily-backup.sh`
   as root. It takes the shared lock, copies root-owned helpers and units,
   reloads systemd, and creates no credentials, policy, enablement gate or
   activation. Existing active/enabled backup timers or an enablement gate
   cause refusal; for replacement, first stop/disable the timer, stop any
   pending retries and remove the gate during the supervised maintenance.
2. Configure `/var/lib/usd-deployer/rclone.conf`, owned by root with mode `0600`.
   Its directory and `/etc/usd-deployer` must be root-owned, mode `0700`.
   The media source must use the **same access key and secret as the actual
   running API**, and cover its entire bucket. An example with placeholders:

   ```ini
   [usd-media-source]
   type = s3
   provider = Other
   env_auth = false
   endpoint = http://127.0.0.1:19000
   access_key_id = REPLACE_WITH_CURRENT_API_SOURCE_KEY
   secret_access_key = REPLACE_WITH_CURRENT_API_SOURCE_SECRET
   force_path_style = true

   [usd-independent]
   type = s3
   provider = Other
   env_auth = false
   endpoint = https://REPLACE_WITH_REAL_OFF_HOST_S3_ENDPOINT
   region = REPLACE_WITH_PROVIDER_REGION
   access_key_id = REPLACE_WITH_BACKUP_KEY
   secret_access_key = REPLACE_WITH_BACKUP_SECRET
   ```

   Use private buckets and least-privilege credentials that can create, list
   and download backups. Grant no delete permission to this job. Configure
   provider encryption and any separately approved Object Lock/immutability
   outside this installer. Optional rclone `crypt` over S3 is accepted; keep
   its recovery passwords separately, or a host loss can make copies useless.
   S3 options are restricted to `type`, `provider`, `env_auth`, credentials,
   `endpoint`, `region`, `location_constraint`, `acl`, `force_path_style`,
   `server_side_encryption`, `sse_kms_key_id` and `storage_class`. Crypt options
   are `type`, `remote`, `password`, `password2`, `filename_encryption`,
   `directory_name_encryption` and `suffix`. Inherited DEFAULT sections,
   credential overrides, custom headers and TLS bypasses are rejected.
3. Write these root-owned `0600` files without trailing comments or blank
   lines. `db-backup.conf` has one line; `media-backup.conf` has two:

   ```text
   # /etc/usd-deployer/db-backup.conf (omit this comment)
   usd-independent:YOUR_PRIVATE_BUCKET/postgres
   ```

   ```text
   # /etc/usd-deployer/media-backup.conf (omit this comment)
   usd-media-source:YOUR_API_BUCKET
   usd-independent:YOUR_PRIVATE_BUCKET/media
   ```

4. Write `/etc/usd-deployer/daily-backup.json`, root-owned mode `0600`:

   ```json
   {
     "version": 1,
     "independent_of_hyperv_host": true,
     "retention": "keep-all",
     "api_media_endpoint": "http://usd-s3:9000",
     "api_media_bucket": "YOUR_API_BUCKET",
     "media_source_endpoint": "http://127.0.0.1:19000",
     "source_maps_to_api": true
   }
   ```

   Replace endpoint/bucket examples with observed values. Review that the
   host-visible `media_source_endpoint` reaches the exact S3 service used by
   the API's internal endpoint, with the same full bucket and credentials.
   `source_maps_to_api` records that operator-reviewed routing fact; software
   cannot prove an arbitrary proxy/DNS mapping from strings alone.

   Set `independent_of_hyperv_host` only after establishing that **both**
   destinations survive loss of the entire Windows/Hyper-V PC, its disks and
   local backups. A second local HDD, SMB share backed by that PC, localhost
   S3 gateway or alias is insufficient. The validator rejects local/alias
   backends, non-HTTPS destinations, and non-public literal/resolved endpoint
   addresses. An external-looking hostname alone cannot prove independent
   hardware, account control, availability or power; record provider/location
   and recovery access outside this PC. Private VPN endpoints are intentionally
   unsupported by this S3-only policy.

Secrets remain in root-private files and memory. The worker discards ambient
Docker/rclone/cloud/proxy overrides, fixes the local Docker socket, and uses
the private rclone config. Do not paste configuration, inspection output,
private logs, archives or participant data into issues or CI artifacts.

## Source check, first run, scheduling

As root, run `/usr/local/sbin/usd-daily-backup --check-source`. This acquires the
shared lock and validates policies, running images, the actual API database
connection and media configuration. It creates no archive or enablement gate.
It is a source/policy check; destination credentials and content transport are
proved by the full backup run.

After review, create the separate root-owned `0600` enablement gate:

```bash
umask 077
printf 'verified-off-host-backup-v1\n' > /etc/usd-backup-enabled
/usr/local/sbin/usd-daily-backup
```

A successful full run creates
`/var/lib/usd-deployer/daily-backup-last-success.json`. Privately verify its
date, revision, snapshot ID and both remote destinations, and inspect the
matching root-private snapshot directory. Compare the remote manifest using
the private rclone config. Only then enable daily scheduling explicitly:

```bash
systemctl enable --now usd-daily-backup.timer
systemctl list-timers usd-daily-backup.timer
```

The timer runs at 03:15 UTC plus up to 30 minutes jitter, catches up after
downtime, and the service retries failures after 15 minutes. Lock contention
or network/verification command failures exit `75`; other validation failures
also remain failures and are retried by systemd. The service has a 12-hour
runtime limit, private temporary directories and root-private state. The
worker is disabled when the gate is absent. Stopping the timer alone does
not cancel an already running service or pending restart; to suspend, remove
the gate and stop both the timer and service under operator supervision.

## Verification, consistency and recovery

Each attempt uses a timestamp plus 96 random bits for a unique snapshot and
remote object/prefix. The database archive is uploaded, fully downloaded and
compared byte-for-byte, then fully restored into an isolated PostgreSQL 18
database. Existing table row counts are checked across current-image Prisma
history checks; the temporary database/volume/network must be removed before
that helper reports success. Media is copied, checked by full download,
restored to a new private directory, checked again and the restore removed.
The source media inventory is observed before the dump and after verification;
source/image/environment/policy drift prevents the last-success receipt.

The receipt records SHA-256 hashes, image ID, revision, both destinations and
the observed media inventory. It is also uploaded to the database prefix and
read back before the private last-success receipt is atomically replaced.
An older last-success receipt remains unchanged after a failure: **always
check its age**. A failed manifest read-back can leave a remote manifest but
does not establish that the scheduled attempt completed locally. Incomplete
attempts may leave private local archives and partial remote prefixes; never
overwrite them on retry. No automatic local or remote retention deletion is
enabled. Monitor disk/capacity/quota and arrange a separately reviewed retention
policy before space runs out.

`pg_dump` is transactionally consistent for PostgreSQL. The database and S3
media are **not an atomic shared snapshot**: stable inventories cannot exclude
concurrent database writes, replace-and-revert uploads, or application changes
between the services' observations. Do not claim full cross-service consistency
from this receipt. A strict matching recovery point needs an approved write
freeze or application/object versioning protocol and its own restore rehearsal.
This job deliberately does not put the live application into maintenance mode.

For a failure, inspect `systemctl status usd-daily-backup.service` and
`journalctl -u usd-daily-backup.service` for the sanitized phase error. Detailed
helper output is in the private snapshot's `verification.log`. A lock failure
is expected during a deployment; do not bypass the lock. Repair policy,
capacity or connectivity and let the service retry with a new snapshot ID.
On abrupt termination/host loss, shared helper cleanup may not finish. Inspect
only the `usd-migration-rehearsal-*` disposable resources and private restore
paths reported by that attempt; establish their ownership and identity before
any manual cleanup. Never remove the real database container or volume.
No failed/interrupted run publishes a new local success receipt.

Actual disaster recovery remains a separate supervised operation: download the
chosen archive and media into an isolated environment, verify recorded hashes,
restore PG18 and media, and check representative historic registrations,
results and photo references before planning any application switch. Recover
rclone/crypt/provider credentials from the independently secured recovery copy.
Do not reset or replace the source database as part of backup verification.

## Offline development evidence

`python3 -B deploy/home-pc/test-daily-backup.py -v` runs synthetic policies,
filesystem/lock/timeout checks and mocked Docker/rclone boundaries. Run it as
root in a disposable, network-disabled Python container to include the real
inert installer fixture. `.github/workflows/daily-backup-safety.yml` additionally
builds the current API image and runs `test-daily-backup-docker.sh` on a disposable
hosted runner: real PG18 dump/full restore/current Prisma history, real local
rclone media download/restore and reused-prefix refusal. These local transport
fixtures intentionally do not count as physical off-host proof.

Final isolated root suite: 26 tests passed. A SIGTERM regression verifies that
the worker retains the shared deployment lock until a TERM-ignoring verifier
has been killed and reaped. The service requires Docker to be already active;
starting a backup does not start the Docker daemon. Actual power loss can still
interrupt cleanup and requires the recovery inspection described above.
