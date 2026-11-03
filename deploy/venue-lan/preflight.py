#!/usr/bin/env python3
"""Fail-closed venue LAN config validation. Never prints actual credentials."""
import ipaddress
import os
import pathlib
import re
import sys
from urllib.parse import urlsplit

REQUIRED = (
    "VENUE_BIND_IP", "VENUE_IMAGE_TAG", "VENUE_DB_NAME", "VENUE_DB_USER",
    "VENUE_DB_PASSWORD", "VENUE_DATABASE_URL", "VENUE_JWT_SECRET",
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
    if len(env["VENUE_JWT_SECRET"].encode("utf-8")) < 32:
        raise ValueError("VENUE_JWT_SECRET слишком короткий")
    if len(env["VENUE_DB_PASSWORD"]) < 20:
        raise ValueError("Пароль локальной БД слишком короткий")
    if env["VENUE_S3_ROOT_ACCESS"] == env["VENUE_S3_APP_ACCESS"] or env["VENUE_S3_ROOT_SECRET"] == env["VENUE_S3_APP_SECRET"]:
        raise ValueError("Не используйте root RustFS в API — создайте ограниченный сервисный ключ")
    try:
        db = urlsplit(env["VENUE_DATABASE_URL"])
    except ValueError as exc:
        raise ValueError("Неверная ссылка локальной базы данных") from exc
    if db.scheme not in ("postgres", "postgresql") or db.hostname != "db" or db.port not in (5432, None) or not db.path.strip("/"):
        raise ValueError("БД должна быть только локальным сервисом db:5432")
    if db.username != env["VENUE_DB_USER"]:
        raise ValueError("Имя пользователя в URL базы не совпадает с VENUE_DB_USER")
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
        if "0.0.0.0:443" in compose or "5432:5432" in compose or "9000:9000" in compose:
            raise ValueError("Сервис БД/медиа или WAN-порт открыт небезопасно")
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
