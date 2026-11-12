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

def main() -> int:
    root = pathlib.Path(__file__).resolve().parent
    config = root / ".env"
    if not config.is_file():
        print("VENUE CHECK BLOCKED: сначала создайте deploy/venue-lan/.env", file=sys.stderr)
        return 1
    try:
        validate(load_env(config))
        compose = (root / "compose.yaml").read_text(encoding="utf-8")
        # Exact port mapping only. A local-only '127.0.0.1:19000:9000'
        # is intentionally allowed for laptop-side RustFS provisioning.
        bad_port = re.search(
            r"""(?m)^\s*-\s*["']?(?:0\.0\.0\.0:)?(?:443:443|5432:5432|9000:9000)(?:/tcp|/udp)?["']?\s*$""",
            compose,
        )
        if bad_port:
            raise ValueError("Сервис БД/медиа или WAN-порт открыт небезопасно")
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
