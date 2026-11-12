#!/usr/bin/env python3
"""Fail-closed venue LAN config validation. Never prints actual credentials."""
import ipaddress
import os
import pathlib
import re
import sys
from urllib.parse import urlsplit, parse_qsl, unquote

REQUIRED = (
    "VENUE_BIND_IP", "VENUE_IMAGE_TAG", "VENUE_STAGE_ID", "VENUE_SIGNING_KEY_FINGERPRINT", "VENUE_DB_NAME", "VENUE_DB_USER",
    "VENUE_DB_PASSWORD", "VENUE_DB_ROOT_USER", "VENUE_DB_ROOT_PASSWORD", "VENUE_DATABASE_URL", "VENUE_JWT_SECRET",
    "VENUE_S3_ROOT_ACCESS", "VENUE_S3_ROOT_SECRET",
    "VENUE_S3_APP_ACCESS", "VENUE_S3_APP_SECRET",
)
PRIVATE_WIFI_NETS = tuple(map(ipaddress.ip_network, (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
)))

def load_env(path: pathlib.Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        row = line.strip()
        if not row or row.startswith("#"):
            continue
        if "=" not in row:
            raise ValueError("Неверная строка конфигурации .env")
        key, value = row.split("=", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key in values:
            raise ValueError("Неверное или повторяющееся имя настройки")
        values[key] = value.strip().strip("'\"")
    return values

def validate(env: dict[str, str]) -> None:
    for key in REQUIRED:
        value = env.get(key, "")
        if not value or any(word in value for word in ("REPLACE_", "ACTUAL_", "YOUR_")):
            raise ValueError("Отсутствует реальное значение: " + key)
    try:
        ip = ipaddress.ip_address(env["VENUE_BIND_IP"])
    except ValueError as exc:
        raise ValueError("VENUE_BIND_IP должен быть приватным IPv4 адресом ноутбука") from exc
    if ip.version != 4 or not any(ip in net for net in PRIVATE_WIFI_NETS):
        raise ValueError("Публикация разрешена только на частном IPv4 интерфейсе роутера")
    if not re.fullmatch(r"[0-9a-f]{40}", env["VENUE_IMAGE_TAG"]):
        raise ValueError("Разрешены только образы, закреплённые полным SHA коммита")
    if not re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
        env["VENUE_STAGE_ID"], re.IGNORECASE,
    ):
        raise ValueError("VENUE_STAGE_ID должен быть UUID единственного этапа")
    if not re.fullmatch(r"[a-f0-9]{64}", env["VENUE_SIGNING_KEY_FINGERPRINT"]):
        raise ValueError("Нужен SHA-256 SPKI публичного ключа из доверенного канала")
    if len(env["VENUE_JWT_SECRET"].encode("utf-8")) < 32:
        raise ValueError("VENUE_JWT_SECRET слишком короткий")
    if env["VENUE_DB_ROOT_USER"] != "usd_venue_root":
        raise ValueError("Отдельная сервисная роль API не должна быть superuser PostgreSQL")
    if len(env["VENUE_DB_ROOT_PASSWORD"]) < 30 or env["VENUE_DB_ROOT_PASSWORD"] == env["VENUE_DB_PASSWORD"]:
        raise ValueError("Требуется отдельный сильный пароль PostgreSQL superuser")
    if len(env["VENUE_DB_PASSWORD"]) < 20:
        raise ValueError("Пароль локальной БД слишком короткий")
    if env["VENUE_S3_ROOT_ACCESS"] == env["VENUE_S3_APP_ACCESS"] or env["VENUE_S3_ROOT_SECRET"] == env["VENUE_S3_APP_SECRET"]:
        raise ValueError("Не используйте root RustFS в API — создайте ограниченный сервисный ключ")
    try:
        db = urlsplit(env["VENUE_DATABASE_URL"])
    except ValueError as exc:
        raise ValueError("Неверная ссылка локальной базы данных") from exc
    # Never reuse production database names or default PostgreSQL identities:
    # this compose stack must own a separate venue-only database.
    if not re.fullmatch(r"usd_venue(?:_[a-z0-9]{1,20})?", env["VENUE_DB_NAME"]):
        raise ValueError("Локальная база должна иметь имя usd_venue")
    if not re.fullmatch(r"usd_venue(?:_[a-z0-9]{1,20})?", env["VENUE_DB_USER"]):
        raise ValueError("Локальный пользователь должен иметь имя usd_venue")
    try:
        allowed_connection = (
            db.scheme in ("postgres", "postgresql")
            and db.hostname == "db" and db.port in (5432, None)
            and db.path == "/" + env["VENUE_DB_NAME"]
            and db.username == env["VENUE_DB_USER"]
            and unquote(db.password or "") == env["VENUE_DB_PASSWORD"]
            and not db.fragment
            # Prisma accepts schema=public; prevent host/hostaddr/service and
            # other query parameters from overriding the private DB endpoint.
            and parse_qsl(db.query, keep_blank_values=True, strict_parsing=True) in
            ([], [("schema", "public")])
        )
    except ValueError as exc:
        raise ValueError("Неверная ссылка локальной базы данных") from exc
    if not allowed_connection:
        raise ValueError("URL базы должен точно соответствовать локальному db, имени и паролю площадки")
    # Never allow a production database or public S3 host from a copied .env.
    for key in env:
        if key in ("S3_ENDPOINT", "API_PUBLIC_URL", "PUBLIC_API_URL", "FRONTEND_URL", "CORS_ORIGINS", "CSRF_TRUSTED_ORIGINS"):
            raise ValueError("Удалите внешнюю настройку: " + key)

def validate_compose_network_exposure(compose: str) -> None:
    """Every exposed port must match an explicitly reviewed LAN-only mapping."""
    match = re.search(r"(?m)^services:\s*$", compose)
    if not match:
        raise ValueError("Отсутствует блок services")
    section = re.split(r"(?m)^(?:volumes|networks):\s*$", compose[match.end():], maxsplit=1)[0]
    parts = re.split(r"(?m)^  ([a-z][a-z0-9_-]*):\s*\n", section)
    services = {parts[i]: parts[i + 1] for i in range(1, len(parts), 2)}
    if set(services) != {"db", "rustfs", "api", "frontend", "gateway"}:
        raise ValueError("Непроверенный сервис в локальном Compose")
    if re.search(r"(?m)^\s*network_mode\s*:", compose):
        raise ValueError("Режим network_mode недопустим")
    if not re.search(r"(?m)^name: usd-venue\s*$", compose):
        raise ValueError("Запуск разрешён только для отдельного проекта usd-venue")
    # Production data must never be mounted into a temporary venue database.
    volumes_section = re.split(r"(?m)^volumes:\s*$", compose)
    if len(volumes_section) != 2 or re.search(r"(?m)^\s*external\s*:", volumes_section[1]):
        raise ValueError("Нельзя подключать внешние Docker volumes площадки")
    db_storage = services["db"]
    if len(re.findall(r"(?m)^\s*-\s*venue_db:/var/lib/postgresql\s*$", db_storage)) != 1 or len(re.findall(r"/var/lib/postgresql", db_storage)) != 1:
        raise ValueError("БД площадки обязана использовать отдельный named volume")
    media_storage = services["rustfs"]
    if not re.search(r"(?m)^    volumes: \[venue_media:/data\]\s*$", media_storage):
        raise ValueError("RustFS обязан использовать отдельный локальный volume")
    if media_storage.count("volumes:") != 1:
        raise ValueError("Неожиданное дополнительное хранилище RustFS")
    allowed = {
        "db": set(), "api": set(), "frontend": set(),
        "rustfs": {"127.0.0.1:19000:9000/tcp", "127.0.0.1:19001:9001/tcp"},
        "gateway": {"${VENUE_BIND_IP}:443:443/tcp"},
    }
    for name, body in services.items():
        port_blocks = list(re.finditer(r"(?m)^    ports:\s*$", body))
        if len(port_blocks) != (1 if allowed[name] else 0):
            raise ValueError("Недопустимая публикация портов: " + name)
        if not port_blocks:
            continue
        following = body[port_blocks[0].end():]
        mappings = []
        for line in following.splitlines():
            if line and not line.startswith(" "):
                break
            if line.startswith("    ") and not line.startswith("      "):
                break
            row = line.strip()
            if not row or row.startswith("#"):
                continue
            found = re.fullmatch(r'-\s*["\x27]([^"\x27]+)["\x27]', row)
            if not found:
                raise ValueError("Неизвестный формат портов: " + name)
            mappings.append(found.group(1))
        if len(mappings) != len(allowed[name]) or set(mappings) != allowed[name]:
            raise ValueError("Опасный внешний порт: " + name)


def main() -> int:
    root = pathlib.Path(__file__).resolve().parent
    config = root / ".env"
    if not config.is_file():
        print("VENUE CHECK BLOCKED: сначала создайте deploy/venue-lan/.env", file=sys.stderr)
        return 1
    try:
        validate(load_env(config))
        compose = (root / "compose.yaml").read_text(encoding="utf-8")
        validate_compose_network_exposure(compose)
        if 'USD_VENUE_LAN_MODE: "true"' not in compose or "VENUE_STAGE_ID: ${VENUE_STAGE_ID" not in compose:
            raise ValueError("Локальное табло не ограничено площадкой и этапом")
        if "POSTGRES_USER: ${VENUE_DB_ROOT_USER" not in compose or "POSTGRES_PASSWORD: ${VENUE_DB_ROOT_PASSWORD" not in compose:
            raise ValueError("PostgreSQL superuser не отделён от API")
        if "VENUE_DB_ROOT_PASSWORD:" in compose.split("  api:")[1].split("  frontend:")[0]:
            raise ValueError("ROOT пароль PostgreSQL попал в API")
        bootstrap = (root / "config" / "venue-config.js").read_text(encoding="utf-8")
        if "__USD_VENUE_MODE__ = true" not in bootstrap or "'/venue-api'" not in bootstrap:
            raise ValueError("Локальный frontend не настроен на свой API")
    except (OSError, ValueError) as exc:
        print("VENUE CHECK BLOCKED: " + str(exc), file=sys.stderr)
        return 1
    print("VENUE CHECK OK: только LAN IP, образы зафиксированы, отдельная БД и локальный API")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
