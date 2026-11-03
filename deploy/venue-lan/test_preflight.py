#!/usr/bin/env python3
import ipaddress
import unittest
from preflight import validate

def fixture():
    return {
        "VENUE_BIND_IP": "192.168.50.10",
        "VENUE_IMAGE_TAG": "a" * 40,
        "VENUE_DB_NAME": "usd_venue",
        "VENUE_DB_USER": "usd_venue",
        "VENUE_DB_PASSWORD": "a secure private password",
        "VENUE_DATABASE_URL": "postgresql://usd_venue:encoded@db:5432/usd_venue?schema=public",
        "VENUE_JWT_SECRET": "j" * 64,
        "VENUE_S3_ROOT_ACCESS": "root-venue",
        "VENUE_S3_ROOT_SECRET": "root-only-secret",
        "VENUE_S3_APP_ACCESS": "media-account",
        "VENUE_S3_APP_SECRET": "media-only-secret",
    }

class VenuePreflightTests(unittest.TestCase):
    def test_valid_private_lan(self):
        for address in ("192.168.50.10", "10.42.0.2", "172.19.1.4"):
            with self.subTest(address=address):
                env = fixture()
                env["VENUE_BIND_IP"] = address
                validate(env)
    def test_public_and_loopback_rejected(self):
        for address in ("0.0.0.0", "127.0.0.1", "8.8.8.8", "100.112.2.3", "::1", "192.0.2.1"):
            with self.subTest(address=address):
                env = fixture()
                env["VENUE_BIND_IP"] = address
                with self.assertRaises(ValueError):
                    validate(env)
    def test_unpinned_image_rejected(self):
        for label in ("main", "latest", "a" * 8, "REPLACE_SHA"):
            env = fixture()
            env["VENUE_IMAGE_TAG"] = label
            with self.assertRaises(ValueError):
                validate(env)
    def test_production_db_and_media_root_key_rejected(self):
        env = fixture()
        env["VENUE_DATABASE_URL"] = "postgresql://usd_venue:password@db.production.example:5432/usd_venue"
        with self.assertRaises(ValueError):
            validate(env)
        env = fixture()
        env["VENUE_S3_APP_ACCESS"] = env["VENUE_S3_ROOT_ACCESS"]
        with self.assertRaises(ValueError):
            validate(env)
    def test_no_production_service_secrets(self):
        env = fixture()
        env["API_PUBLIC_URL"] = "https://api.usd-russia.ru"
        with self.assertRaises(ValueError):
            validate(env)

if __name__ == "__main__":
    unittest.main()
