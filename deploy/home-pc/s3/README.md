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
if [ ! -s /etc/usd-s3/s3.env ]; then
  sudo bash -c 'umask 077; printf "RUSTFS_ACCESS_KEY=%s\nRUSTFS_SECRET_KEY=%s\n" "$(openssl rand -hex 16)" "$(openssl rand -hex 32)" > /etc/usd-s3/s3.env'
fi
sudo chmod 0600 /etc/usd-s3/s3.env

cd /home/usd/usd-deploy/deploy/home-pc/s3
sudo install -o root -g root -m 0644 compose.yaml /etc/usd-s3/compose.yaml
sudo install -o root -g root -m 0644 usd-s3.service /etc/systemd/system/usd-s3.service
sudo docker compose -f /etc/usd-s3/compose.yaml config --quiet
sudo docker compose -f /etc/usd-s3/compose.yaml pull
sudo systemctl daemon-reload
sudo systemctl enable --now usd-s3.service
sudo systemctl status usd-s3.service --no-pager
curl -fsS http://127.0.0.1:19000/health
```

The systemd unit refuses to start if /srv/usd-s3 is not a mount point.
It owns the container lifecycle (no Docker restart policy that could bypass
the disk-mount preflight). Config is root-owned in /etc/usd-s3.
Source image: `rustfs/rustfs:1.0.4` — review/pin
its immutable digest on the host after verifying the official image.

Open the private Console from your PC via SSH local forwarding:
`ssh -L 19001:127.0.0.1:19001 usd@YOUR_TAILSCALE_UBUNTU_IP`
then browse `http://127.0.0.1:19001`. Read the access key and secret on the
server only; never paste them into a chat or commit them to Git.

## 3. Create a private media bucket

Ubuntu 24.04 (Noble) can report `awscli` without an APT installation candidate
even with Universe enabled. Install the official AWS CLI v2 using its verified
installer instead of modifying unrelated Ubuntu repositories:

```bash
sudo apt-get update
sudo apt-get install -y unzip
install_dir="$(mktemp -d)"
curl -fsSLo "$install_dir/aws-install.sh" https://awscli.amazonaws.com/v2/install.sh
sudo bash "$install_dir/aws-install.sh" --system
rm -rf "$install_dir"
/usr/local/bin/aws --version
```

This installer is published by AWS and installs to `/usr/local/bin/aws`.

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

## 3a. Verified local storage, use restricted API credentials

The existing frontend uses **authenticated** `PUT /media/upload` on the USD API
for images and DOCX. The Nest API then sends a signed PUT to S3 *inside Docker*.
For public participant/car photos and published site files, the frontend also
uses the API's `/media/public-file/:targetType/:targetId` proxy. Thus the
current upload path does **not** require a public S3 hostname, TLS on port
9000, or S3 browser CORS.

After `usd-media` passes an AWS CLI PUT/GET/DELETE round-trip, first verify
the running API container can reach RustFS on its existing shared network:

```bash
API_ID="$(sudo docker ps -q --filter 'label=com.docker.compose.project=usd-home' --filter 'label=com.docker.compose.service=api')"
test -n "$API_ID"
sudo docker exec "$API_ID" node -e 'fetch("http://usd-s3:9000/health/ready").then(r=>{console.log("S3 reachable from API:",r.status);if(!r.ok)process.exit(1)}).catch(e=>{console.error(e.message);process.exit(1)})'
```

**Do not put the root RustFS credentials in USD's API environment.**
Use the private RustFS Console via SSH port forwarding to create an IAM
user/service account with only the required permissions on `usd-media`.
Example policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::usd-media"]},
    {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::usd-media/*"]}
  ]
}
```

Verify that account's Put/Get/Head/Delete with a separate test key. Never
post credentials or database environments in tickets, logs or chat.

## 4. Connect the internal storage to USD API

After validating the IAM account, the intended production configuration
in the **existing** root-protected application `deploy/home-pc/.env` is:

```text
S3_ENDPOINT=http://usd-s3:9000
S3_REGION=us-east-1
S3_BUCKET=usd-media
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=RESTRICTED_IAM_ACCESS_KEY
S3_SECRET_ACCESS_KEY=RESTRICTED_IAM_SECRET_KEY
```

This is a Docker-internal hostname: API requests can reach it, but browsers
cannot and must not connect directly. The revised PR #309 frontend uses
`GET /media/private-file/:targetType/:targetId` with its existing bearer
authentication to load private photos and admin previews as local browser
blobs. Public photos and published documents continue through
`GET /media/public-file/:targetType/:targetId`; uploads run through the
existing authenticated `PUT /media/upload` API route. Legacy direct-presign
routes (`/media/view` and `/media/public`) remain for compatibility,
but first-party frontend does not rely on them and direct internal S3 links
are not browser URLs. Validate private media RBAC, admin preview and site asset
flows end-to-end after the supervised release; passing a local bucket CLI
test alone does not prove these features work.

Do not overwrite the `.env`, modify the running Compose overlay, restart USD
API, change DNS, or touch the primary `usd-russia.ru` domain until the revised
media routes are tested and the existing production release gates pass.
The S3 systemd service is separate and may run without changes to USD API.

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
