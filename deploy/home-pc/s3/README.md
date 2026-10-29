# USD SSD / private S3 setup (Ubuntu guest in Hyper-V)

This does not change the live app, DNS, PostgreSQL, or the existing USD ingress.
The **same-PC SSD is NOT an off-host backup**. The home release gate still requires
independent DB and media remotes and a complete restore rehearsal.

## 1. Use the SSD and 300-GiB VHDX already installed on 28 October 2026

**Do not create another VHDX. Do not format the OS volume.** The real USD setup is:

- Windows stays on the existing HDD.
- SSD: ARDOR GAMING NVMe, 512 GB, Windows drive `S:`.
- Ubuntu VM: `S:\\HyperV\\USD-SERVER`; OS VHDX about 120 GiB, Ubuntu root LV about 115 GiB.
- Existing, separately attached **dynamic** `USD-S3.vhdx`: 300 GiB, previously visible inside Ubuntu as `/dev/sdb`.
- Planned permanent mount: `/srv/usd-s3`, with RustFS objects under `/srv/usd-s3/data`.

The last confirmed `lsblk` showed `/dev/sdb` as a **blank disk**; a successful partition,
format or mount was NOT confirmed. Device names may have changed. Before any change, inspect:

```bash
lsblk -o NAME,PATH,SIZE,FSTYPE,MOUNTPOINTS,UUID,MODEL
findmnt /
findmnt /srv/usd-s3 || true
sudo blkid
sudo grep -n '/srv/usd-s3' /etc/fstab || true
sudo docker ps --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}'
```

**If /srv/usd-s3 already has a valid ext4 filesystem mounted, skip partitioning and formatting.**
Inspect the existing objects and permissions; do not delete or overwrite them.

If the 300-GiB disk is unformatted and **only after confirming** its identity and that it
contains no existing files/partitions/data, follow a controlled initial setup.
In the previously observed device layout that disk was `/dev/sdb` (not the OS disk):

```bash
# DESTRUCTIVE only for the positively identified, unused 300-GiB S3 VHDX.
sudo parted /dev/sdb --script mklabel gpt mkpart primary ext4 1MiB 100%
sudo mkfs.ext4 -L USD_S3 /dev/sdb1
sudo blkid -s UUID -o value /dev/sdb1
```

Using `sudoedit /etc/fstab`, add the **actual resulting UUID** only once:

```text
UUID=ACTUAL_S3_UUID /srv/usd-s3 ext4 defaults,nofail,x-systemd.device-timeout=15s 0 2
```

Mount and verify without touching the Ubuntu LVM root or PostgreSQL volume:

```bash
sudo mkdir -p /srv/usd-s3
sudo systemctl daemon-reload
sudo mount -a
findmnt /srv/usd-s3
mountpoint -q /srv/usd-s3 || { echo "STOP: S3 VHDX is not mounted"; exit 1; }
sudo mkdir -p /srv/usd-s3/data
sudo chown 10001:10001 /srv/usd-s3/data
sudo chmod 0700 /srv/usd-s3/data
```

The service verifies `/srv/usd-s3` is a mount point before starting, to prevent
objects being written to the Ubuntu OS filesystem when the S3 VHDX is offline.
Never run `docker compose down -v` or `prisma migrate reset` in this process.

## 2. Create private credentials and start RustFS

This Compose stack keeps S3 API/Console on localhost-only ports 19000/19001
and joins the existing `usd-home_usd-internal` network, so Caddy can reach
`usd-s3:9000` if a separately approved HTTPS route is set up.
Do **not** forward the console port to the internet. Credentials stay outside Git.

```bash
sudo docker network inspect usd-home_usd-internal >/dev/null
sudo install -d -o root -g root -m 0700 /etc/usd-s3
sudo bash -c 'umask 077; printf "RUSTFS_ACCESS_KEY=%s\nRUSTFS_SECRET_KEY=%s\n" "$(openssl rand -hex 16)" "$(openssl rand -hex 32)" > /etc/usd-s3/s3.env'
sudo chmod 0600 /etc/usd-s3/s3.env

cd /home/usd/usd-deploy/deploy/home-pc/s3
sudo docker compose config --quiet
sudo docker compose pull
sudo install -o root -g root -m 0644 usd-s3.service /etc/systemd/system/usd-s3.service
sudo systemctl daemon-reload
sudo systemctl enable --now usd-s3.service
sudo systemctl status usd-s3.service --no-pager
curl -fsS http://127.0.0.1:19000/health
```

The systemd unit refuses to start if /srv/usd-s3 is not a mount point.
It owns the container lifecycle (no Docker restart policy that could bypass
the disk-mount preflight). Source image: `rustfs/rustfs:1.0.4` — review/pin
its immutable digest on the host after verifying the official image.

Open the private Console from your PC via SSH local forwarding:
`ssh -L 19001:127.0.0.1:19001 usd@YOUR_TAILSCALE_UBUNTU_IP`
then browse `http://127.0.0.1:19001`. Read the access key and secret on the
server only; never paste them into a chat or commit them to Git.

## 3. Create a private media bucket

Install AWS CLI on Ubuntu (`sudo apt-get install -y awscli`).
The following reads the private server environment without printing the key:

```bash
sudo bash -c '
  set -a
  . /etc/usd-s3/s3.env
  export AWS_ACCESS_KEY_ID="$RUSTFS_ACCESS_KEY"
  export AWS_SECRET_ACCESS_KEY="$RUSTFS_SECRET_KEY"
  export AWS_DEFAULT_REGION=us-east-1
  aws --endpoint-url http://127.0.0.1:19000 s3api create-bucket --bucket usd-media
  aws --endpoint-url http://127.0.0.1:19000 s3api list-buckets
'
```

For browser uploads from USD, configure S3 bucket CORS/permissions (or
the RustFS API-origin setting above), and **test** a signed PUT/GET/HEAD/DELETE
using the actual web application. Do not make private participant photos a
publicly readable bucket.

## 4. Critical: public signed upload URL

Current backend `backend/src/media/media.service.ts` generates S3
presigned URLs for the **browser** using the same `S3_ENDPOINT` the API uses.
Therefore `http://usd-s3:9000` is NOT a usable production `S3_ENDPOINT`:
a public browser cannot resolve the Docker-only hostname.

To enable real uploads, first provide a browser-reachable HTTPS host such
as `https://s3.usd-russia.ru` routed to `usd-s3:9000`, and verify that
the API container can also reach that HTTPS URL. Configure only after
public ingress is independently solved:

```text
S3_ENDPOINT=https://s3.usd-russia.ru
S3_REGION=us-east-1
S3_BUCKET=usd-media
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=ACTUAL_PRIVATE_ACCESS_KEY
S3_SECRET_ACCESS_KEY=ACTUAL_PRIVATE_SECRET_KEY
```

Use a **separate, least-privilege RustFS IAM user/service account** for
`S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, restricted to the
`usd-media` bucket and required object operations. Keep the RustFS root
credentials only in `/etc/usd-s3/s3.env` for host administration, never in
the API application environment. See upstream IAM documentation and test
presigned PUT/GET/HEAD/DELETE under the limited identity.

These are added to the existing PRIVATE
`/home/usd/usd-deploy/deploy/home-pc/.env` — do not replace that file
or edit live app credentials without a supervised release.
On direct Caddy ingress, a reviewed route can be added:

```caddyfile
s3.usd-russia.ru {
    reverse_proxy usd-s3:9000
}
```

Do not change `usd-russia.ru`, and do not publish ports 19000 or 19001
to the WAN. With carrier-grade NAT, inbound 80/443 forwarding normally
cannot work: obtain an actual public IPv4/IPv6 route or an independent
reverse gateway before removing the currently working ingress.
SSL, DNS, reverse-proxy Host preservation, CORS and end-to-end signed
upload/download must be validated before claiming readiness.

## 5. Independent backups and PR #309

The server-local RustFS bucket can be the `rclone` media *source*, but the
backup target MUST be a different failure domain (another computer/site,
or a separately hosted independent storage account). Configure rclone for
the source using `http://127.0.0.1:19000`, then configure a separately
authenticated remote destination. Expected example policy files:

```text
/etc/usd-deployer/media-backup.conf:
usd-media:usd-media
usd-offsite:backups/usd/media

/etc/usd-deployer/db-backup.conf:
usd-offsite:backups/usd/postgres
```

Those examples are not real remotes and must not be used without configuring
and validating both ends. The one-time release installer verifies content
by downloading it back and restores PostgreSQL into a disposable container.
An initially empty source bucket will FAIL the automatic media backup gate
until actual production media are present and independently recoverable.

Never run `docker compose down -v`, `prisma migrate reset`, or format
the existing USD VM disk as part of installing S3.
