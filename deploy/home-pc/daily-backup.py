#!/usr/bin/python3 -I
"""Root-owned, backup-only USD scheduler. No deployment or retention deletion."""
import configparser
from datetime import datetime, timezone
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import stat
import subprocess
import sys
from urllib.parse import parse_qsl, unquote, urlsplit

ROOT_UID = 0
STATE = Path('/var/lib/usd-deployer')
POLICY = Path('/etc/usd-deployer')
DEPLOY_ENV = Path('/home/usd/usd-deploy/deploy/home-pc/.env')
ENABLED = Path('/etc/usd-backup-enabled')
LOCK = Path('/run/lock/usd-home-deploy.lock')
HELPERS = {
    'database': Path('/usr/local/libexec/usd-verify-db-offsite-backup'),
    'media': Path('/usr/local/libexec/usd-verify-media-backup'),
    'restore': Path('/usr/local/libexec/usd-rehearse-schema-on-backup'),
}
TERM_GRACE_SECONDS = 15


def install_signal_handlers():
    def stop(signum, _frame):
        # Unwind through command() while its deploy lock is still held. A
        # second stop must not interrupt process-group termination/reaping.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        raise BackupError('Backup interrupted; no successful verification accepted', 128 + signum)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)


class BackupError(Exception):
    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code


def require(condition, message):
    if not condition:
        raise BackupError(message)


def trusted(path, *, private=False, directory=False, owner=True, executable=False):
    # Check ancestor symlinks as well as the final component. Policy/state
    # directories are separately checked for ownership and writable mode bits.
    require(not any(part.is_symlink() for part in (path, *path.parents)), 'Symlink in a protected backup path')
    info = path.stat()
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), 'Invalid backup file type')
    require(not owner or info.st_uid == ROOT_UID, 'Backup policy/helper must be root-owned')
    require(not (stat.S_IMODE(info.st_mode) & (0o077 if private else 0o022)), 'Unsafe backup file permissions')
    require(not executable or info.st_mode & 0o100, 'Backup verifier is not executable')


def safe_environment():
    # Never forward Docker contexts, rclone remote overrides, ambient cloud
    # credentials, shell startup files, proxies or user-controlled PATH entries.
    return {
        'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'HOME': '/root', 'LANG': 'C.UTF-8',
        'DOCKER_HOST': 'unix:///var/run/docker.sock',
        'RCLONE_CONFIG': str(STATE / 'rclone.conf'),
        'RCLONE_CACHE_DIR': str(STATE / 'rclone-cache'),
        'RCLONE_RETRIES': '3', 'RCLONE_LOW_LEVEL_RETRIES': '3',
        'RCLONE_CONTIMEOUT': '30s', 'RCLONE_TIMEOUT': '5m',
    }


def command(args, *, stdout=None, stdin=None, timeout=120, log=None):
    try:
        process = subprocess.Popen([str(arg) for arg in args], env=safe_environment(),
                                   stdin=stdin if stdin is not None else subprocess.DEVNULL,
                                   stdout=stdout if stdout is not None else subprocess.PIPE,
                                   stderr=log if log is not None else subprocess.PIPE,
                                   cwd='/', start_new_session=True)
    except OSError:
        raise BackupError('Backup command unavailable or timed out; sensitive output withheld', 75) from None
    try:
        output, _ = process.communicate(timeout=timeout)
    except BaseException as error:
        # A shell verifier can own rclone/Docker client descendants. Do not
        # unlock while those processes are still copying/restoring data.
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.communicate(timeout=TERM_GRACE_SECONDS)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.communicate()
        if not isinstance(error, subprocess.TimeoutExpired):
            raise
        raise BackupError('Backup command unavailable or timed out; sensitive output withheld', 75) from None
    if process.returncode:
        raise BackupError('Backup verification command failed; sensitive output withheld', 75)
    return output if stdout is None else b''


def remote_path(raw):
    match = re.fullmatch(r'([A-Za-z0-9_][A-Za-z0-9_-]*):([A-Za-z0-9_/-]+)', raw)
    require(match is not None and all(part not in ('', '.', '..') for part in match[2].split('/')),
            'Backup policy requires a named remote and nonempty path without traversal')
    return match[1], match[2]


def endpoint_identity(raw):
    parsed = urlsplit(raw)
    require(parsed.scheme in ('http', 'https') and parsed.hostname and not parsed.username
            and not parsed.password and parsed.path in ('', '/') and not parsed.query and not parsed.fragment,
            'S3 endpoints must be plain HTTP/HTTPS origins without credentials, paths or query parameters')
    return parsed.scheme, parsed.hostname.lower(), parsed.port or (443 if parsed.scheme == 'https' else 80)


def external_s3(config, name, seen=()):
    require(name not in seen and len(seen) < 4 and config.has_section(name), 'Invalid off-host rclone remote chain')
    section = config[name]
    if section.get('type') == 'crypt':
        require(set(section) <= {'type', 'remote', 'password', 'password2', 'filename_encryption',
                                 'directory_name_encryption', 'suffix'}, 'Unsupported encrypted remote options')
        base, _ = remote_path(section.get('remote', ''))
        require(section.get('password'), 'Encrypted backup remote credentials are missing')
        return external_s3(config, base, (*seen, name))
    # S3 includes AWS and the configured Backblaze S3-compatible destination.
    # A local/SMB/alias/serve remote must never substitute the same PC's HDD.
    require(section.get('type') == 's3', 'Off-host destinations must be S3 or crypt over S3; local/alias destinations are forbidden')
    validate_s3_options(section)
    require(section.get('env_auth', 'false').lower() == 'false'
            and section.get('access_key_id') and section.get('secret_access_key'),
            'Off-host S3 requires explicit private credentials')
    endpoint = section.get('endpoint', '')
    if not endpoint:
        require(section.get('provider') == 'AWS', 'Off-host S3 endpoint is missing')
        endpoint = 'https://s3.amazonaws.com'
    parsed = urlsplit(endpoint)
    endpoint_identity(endpoint)
    require(parsed.scheme == 'https' and parsed.hostname and not parsed.username
            and not parsed.password and not parsed.query and not parsed.fragment,
            'Off-host S3 endpoint must use HTTPS without embedded credentials')
    host = parsed.hostname.lower()
    require(host != 'localhost' and not host.endswith(('.localhost', '.local', '.internal')),
            'Off-host destination cannot be a local host')
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        require('.' in host, 'Off-host destination must have a public hostname')
        try:
            addresses = socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
        except OSError:
            raise BackupError('Off-host endpoint DNS unavailable; retry later', 75) from None
        require(addresses and all(ipaddress.ip_address(entry[4][0]).is_global for entry in addresses),
                'Off-host hostname resolves to a private/local address')
    else:
        require(address.is_global, 'Off-host destination cannot be a private/local address')
    return endpoint.rstrip('/')


def validate_s3_options(section):
    # Narrow policy surface: no custom headers, credential commands, role
    # assumption, alternate backends or TLS bypasses hidden in rclone config.
    require(set(section) <= {'type', 'provider', 'env_auth', 'access_key_id', 'secret_access_key',
                             'endpoint', 'region', 'location_constraint', 'acl', 'force_path_style',
                             'server_side_encryption', 'sse_kms_key_id', 'storage_class'},
            'Unsupported S3 remote options; use the documented private policy')
    require(section.get('env_auth', 'false').lower() == 'false'
            and section.get('access_key_id') and section.get('secret_access_key'),
            'S3 remote requires explicit private credentials')
    require(section.get('acl', '') in ('', 'private'), 'Public/shared S3 object ACLs are forbidden')


def settings():
    trusted(STATE, private=True, directory=True)
    trusted(POLICY, directory=True)
    files = [POLICY / name for name in ('daily-backup.json', 'db-backup.conf', 'media-backup.conf')]
    files.append(STATE / 'rclone.conf')
    for path in files:
        trusted(path, private=True)
    for helper in HELPERS.values():
        trusted(helper, executable=True)
        trusted(helper.parent, directory=True)
    review = json.loads(files[0].read_bytes())
    require(set(review) == {'version', 'independent_of_hyperv_host', 'retention', 'api_media_endpoint',
                            'api_media_bucket', 'media_source_endpoint', 'source_maps_to_api'}, 'Invalid daily backup review policy')
    require(review['version'] == 1 and review['independent_of_hyperv_host'] is True
            and review['source_maps_to_api'] is True and review['retention'] == 'keep-all',
            'Reviewed physical off-host independence, media mapping and keep-all retention are required')
    db_lines, media_lines = files[1].read_text().splitlines(), files[2].read_text().splitlines()
    require(len(db_lines) == 1 and len(media_lines) == 2, 'Malformed backup remote policies')
    db_remote, _ = remote_path(db_lines[0])
    source_remote, bucket = remote_path(media_lines[0])
    media_remote, _ = remote_path(media_lines[1])
    require(source_remote not in (db_remote, media_remote), 'Source and off-host backup remotes must be distinct')
    config = configparser.RawConfigParser(interpolation=None, strict=True)
    config.read_string(files[3].read_text())
    require(not config.defaults(), 'Rclone default/inherited options are forbidden')
    require(config.has_section(source_remote) and config[source_remote].get('type') == 's3', 'Media source must be a reviewed S3 bucket')
    validate_s3_options(config[source_remote])
    require(bucket == review['api_media_bucket'] and '/' not in bucket
            and endpoint_identity(config[source_remote].get('endpoint', '')) == endpoint_identity(review['media_source_endpoint']),
            'Media source does not match the reviewed full API bucket mapping')
    endpoint_identity(review['api_media_endpoint'])
    for destination in (db_remote, media_remote):
        endpoint = external_s3(config, destination)
        require(endpoint_identity(endpoint) != endpoint_identity(review['media_source_endpoint']),
                'Backup source and destination endpoints are identical')
    # Compare credentials in memory only; never include them in receipts/logs.
    review['_source_access_key_id'] = config[source_remote]['access_key_id']
    review['_source_secret_access_key'] = config[source_remote]['secret_access_key']
    return review, db_lines[0], media_lines, {
        str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files
    }


def deployment_values():
    # Existing deployment .env may belong to usd. It is never sourced, executed,
    # changed or passed to a backup container; actual container values must match.
    trusted(DEPLOY_ENV, private=True, owner=False)
    required = {'APP_DOMAIN', 'API_DOMAIN', 'USD_IMAGE_TAG', 'POSTGRES_USER',
                'POSTGRES_DB', 'POSTGRES_PASSWORD', 'DATABASE_URL'}
    values = {}
    for raw in DEPLOY_ENV.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#'): continue
        key, sep, value = line.partition('=')
        key = key.strip()
        if key not in required: continue
        require(sep and key not in values, 'Duplicate or malformed deployment setting')
        value = value.strip()
        if value.startswith(('"', "'")):
            require(len(value) >= 2 and value[-1] == value[0], 'Malformed quoted deployment setting')
            value = value[1:-1]
        else:
            value = re.sub(r'\s+#.*$', '', value).strip()
        require(value and '$' not in value, 'Empty or interpolated deployment setting')
        values[key] = value
    require(values.keys() == required and re.fullmatch('[a-f0-9]{40}', values['USD_IMAGE_TAG']), 'Missing or invalid deployment settings')
    require(all(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', values[key])
                for key in ('POSTGRES_USER', 'POSTGRES_DB')),
            'PostgreSQL user/database must be plain identifiers, never libpq connection strings')
    require(values['APP_DOMAIN'] == 'app.usd-russia.ru' and values['API_DOMAIN'] == 'api.usd-russia.ru', 'Unexpected deployment target')
    url = urlsplit(values['DATABASE_URL'])
    require(url.scheme in ('postgres', 'postgresql') and url.hostname == 'db' and url.port == 5432
            and unquote(url.username or '') == values['POSTGRES_USER']
            and unquote(url.password or '') == values['POSTGRES_PASSWORD']
            and unquote(url.path.removeprefix('/')) == values['POSTGRES_DB'] and not url.fragment
            and parse_qsl(url.query, keep_blank_values=True) in ([], [('schema', 'public')]),
            'API database does not match the local PostgreSQL backup target')
    return values


def container_environment(container):
    values = {}
    for entry in container['Config']['Env']:
        key, sep, value = entry.partition('=')
        require(sep and key not in values, 'Invalid or duplicated running container environment')
        values[key] = value
    return values


def live_source(review):
    values = deployment_values()
    state = {'environment_sha256': hashlib.sha256(DEPLOY_ENV.read_bytes()).hexdigest()}
    containers = {}
    for service in ('api', 'frontend', 'db'):
        ids = command(['docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=usd-home',
                       '--filter', 'label=com.docker.compose.service=' + service]).decode().split()
        require(len(ids) == 1, 'Expected exactly one running USD container per service')
        entries = json.loads(command(['docker', 'inspect', ids[0]]))
        require(len(entries) == 1, 'Invalid running container inspection')
        container = entries[0]
        containers[service] = container
        labels, running = container['Config']['Labels'], container['State']
        require(running['Running'] and labels.get('com.docker.compose.project') == 'usd-home'
                and labels.get('com.docker.compose.service') == service, 'Unexpected running USD container')
        reference = 'postgres:18-alpine' if service == 'db' else f'ghcr.io/kolyagazha89/usd-2.0-{service}:' + values['USD_IMAGE_TAG']
        require(container['Config']['Image'] == reference, 'Current image does not match deployment SHA/PG18')
        images = json.loads(command(['docker', 'image', 'inspect', reference]))
        require(len(images) == 1 and images[0]['Id'] == container['Image'], 'Current image tag no longer matches running image content')
        if service != 'db':
            require(images[0]['Config'].get('Labels', {}).get('org.opencontainers.image.revision') == values['USD_IMAGE_TAG'], 'Current image revision label does not match deployed SHA')
        env = container_environment(container)
        if service == 'api':
            require(env.get('DATABASE_URL') == values['DATABASE_URL'] and env.get('NODE_ENV') == 'production', 'Running API uses a different database/environment')
            require(env.get('S3_ENDPOINT', '').rstrip('/') == review['api_media_endpoint'].rstrip('/')
                    and env.get('S3_BUCKET') == review['api_media_bucket']
                    and env.get('S3_ACCESS_KEY_ID') == review['_source_access_key_id']
                    and env.get('S3_SECRET_ACCESS_KEY') == review['_source_secret_access_key'],
                    'Running API media storage/credentials differ from reviewed backup mapping')
        if service == 'db':
            require(running.get('Health', {}).get('Status') == 'healthy', 'Local PostgreSQL is unhealthy')
            require(all(env.get(key) == values[key] for key in ('POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD')), 'Running PostgreSQL differs from deployment credentials')
            require(all(not key.startswith('PG') or key in ('PGDATA', 'PG_MAJOR', 'PG_VERSION', 'PG_SHA256')
                        for key in env), 'Running PostgreSQL has forbidden client connection overrides')
            version = command(['docker', 'exec', ids[0], 'sh', '-ec',
                               'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SHOW server_version_num"']).strip()
            require(version.isdigit() and 180000 <= int(version) < 190000, 'Source database must actually run PostgreSQL 18')
        state[service] = {'id': ids[0], 'image': container['Image'], 'started_at': running['StartedAt']}
    # Matching .env strings alone cannot prove Docker DNS routes the API to the
    # db container we are about to dump. Check the actual connection from its
    # immutable running image, then match the server IP to their shared network.
    api_networks = containers['api']['NetworkSettings']['Networks']
    db_networks = containers['db']['NetworkSettings']['Networks']
    addresses = {value['IPAddress'] for name, value in db_networks.items()
                 if name in api_networks and value.get('IPAddress')}
    require(addresses, 'API and PostgreSQL do not share a known Docker network')
    observed = json.loads(command(['docker', 'exec', state['api']['id'], 'node', '-e',
        'const {Client}=require("pg");const c=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:5000});'
        '(async()=>{try{await c.connect();const r=await c.query("SELECT inet_server_addr()::text AS server,current_database() AS name,current_user AS username,current_setting(\'server_version_num\')::int AS version");'
        'process.stdout.write(JSON.stringify(r.rows[0]));}finally{await c.end().catch(()=>{});}})().catch(()=>{process.exitCode=1;});']))
    require(observed.get('server') in addresses and observed.get('name') == values['POSTGRES_DB']
            and observed.get('username') == values['POSTGRES_USER']
            and isinstance(observed.get('version'), int) and 180000 <= observed['version'] < 190000,
            'Running API does not actually connect to the local PostgreSQL 18 backup source')
    state['database_addresses'] = sorted(addresses)
    state['revision'] = values['USD_IMAGE_TAG']
    return state


def media_inventory(source):
    rows = json.loads(command(['rclone', 'lsjson', '--recursive', '--files-only', '--hash', source], timeout=1800))
    require(isinstance(rows, list) and rows, 'Media source is empty or invalid')
    result = {}
    for row in rows:
        name = row['Path']
        require(isinstance(name, str) and name and not name.startswith('/')
                and not any(part in ('', '.', '..') for part in name.split('/'))
                and name not in result and isinstance(row['Size'], int) and row['Size'] >= 0,
                'Invalid or duplicated media inventory entry')
        result[name] = {key: row.get(key) for key in ('Size', 'ModTime', 'Hashes')}
    return result


def write_json(path, value):
    with path.open('x', encoding='utf-8') as target:
        target.write(json.dumps(value, sort_keys=True, indent=2) + '\n')
        target.flush()
        os.fsync(target.fileno())


def main(*, check_source=False):
    require(os.geteuid() == ROOT_UID, 'Daily backups require root')
    os.umask(0o077)
    if not check_source and not ENABLED.exists() and not ENABLED.is_symlink():
        print('USD daily backup disabled; no services or data accessed')
        return 0
    if not check_source:
        trusted(ENABLED, private=True)
        require(ENABLED.read_bytes() == b'verified-off-host-backup-v1\n', 'Daily backup enablement has not been reviewed')
    fd = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        info = os.fstat(lock.fileno())
        require(info.st_uid == ROOT_UID and stat.S_ISREG(info.st_mode) and not info.st_mode & 0o022, 'Untrusted deploy lock')
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise BackupError('USD deployment/backup lock busy; retry later', 75) from None
        review, database_prefix, media_paths, policy_hashes = settings()
        before = live_source(review)
        if check_source:
            print('PASS: private backup policy and actual local PostgreSQL 18/current image/media mapping checked; no backup or enablement performed')
            return 0
        root = STATE / 'backups'
        root.mkdir(mode=0o700, exist_ok=True)
        trusted(root, private=True, directory=True)
        snapshot_id = 'daily-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(12)
        snapshot = root / snapshot_id
        snapshot.mkdir(mode=0o700)
        archive = snapshot / 'database.partial'
        database_remote = database_prefix + '/' + snapshot_id + '.dump'
        media_remote = media_paths[1] + '/' + snapshot_id
        inventory = media_inventory(media_paths[0])
        with (snapshot / 'verification.log').open('xb') as log:
            with archive.open('xb') as target:
                command(['docker', 'exec', before['db']['id'], 'sh', '-ec',
                         'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -h 127.0.0.1 -p 5432 -Fc --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
                        stdout=target, log=log, timeout=7200)
                target.flush()
                os.fsync(target.fileno())
            require(archive.stat().st_size > 0, 'PostgreSQL dump is empty')
            with archive.open('rb') as source:
                command(['docker', 'exec', '-i', before['db']['id'], 'pg_restore', '--list'], stdin=source, stdout=log, log=log)
            final = archive.with_name('database.dump')
            archive.rename(final)
            command([HELPERS['database'], final, database_remote], stdout=log, log=log, timeout=14400)
            # The immutable running image ID is used, never a mutable tag. The
            # existing helper migrates only the isolated PG18 restore, not live DB.
            command([HELPERS['restore'], final, before['api']['image']], stdout=log, log=log, timeout=14400)
            command([HELPERS['media'], media_paths[0], media_remote], stdout=log, log=log, timeout=14400)
        require(media_inventory(media_paths[0]) == inventory, 'Media changed during backup; no verified pair published; retry later')
        require(live_source(review) == before and settings()[3] == policy_hashes, 'Running source or private backup policy changed during verification')
        with final.open('rb') as archive_stream:
            archive_hash = hashlib.file_digest(archive_stream, 'sha256').hexdigest()
        receipt = {
            'version': 1, 'snapshot_id': snapshot_id, 'completed_at': datetime.now(timezone.utc).isoformat(),
            'revision': before['revision'], 'image_id': before['api']['image'], 'postgres_major': 18,
            'database_sha256': archive_hash,
            'database_remote': database_remote, 'media_remote': media_remote, 'media_objects': len(inventory),
            'media_inventory_sha256': hashlib.sha256(json.dumps(inventory, sort_keys=True).encode()).hexdigest(),
            'consistency': 'stable source inventory during dump and media verification; not an atomic cross-service snapshot',
            'retention': 'keep-all',
        }
        manifest = snapshot / 'manifest.json'
        write_json(manifest, receipt)
        remote_manifest = database_prefix + '/' + snapshot_id + '.json'
        command(['rclone', 'copyto', '--immutable', manifest, remote_manifest], timeout=300)
        require(command(['rclone', 'cat', remote_manifest], timeout=300) == manifest.read_bytes(), 'Off-host backup manifest download differs')
        last = STATE / 'daily-backup-last-success.json'
        if last.exists() or last.is_symlink(): trusted(last, private=True)
        temporary = STATE / ('.last-success-' + secrets.token_hex(12))
        write_json(temporary, receipt)
        temporary.replace(last)
        print('PASS: daily PostgreSQL 18/off-host download/full restore and media verification completed; no live services changed; retention keep-all')
        return 0


if __name__ == '__main__':
    install_signal_handlers()
    try:
        require(sys.argv[1:] in ([], ['--check-source']), 'Usage: usd-daily-backup [--check-source]')
        sys.exit(main(check_source=sys.argv[1:] == ['--check-source']))
    except BackupError as error:
        print('USD daily backup stopped: ' + str(error), file=sys.stderr)
        sys.exit(error.code)
    except (OSError, ValueError, KeyError, TypeError, configparser.Error):
        print('USD daily backup stopped: unsafe/unavailable configuration or source; private details withheld', file=sys.stderr)
        sys.exit(1)
