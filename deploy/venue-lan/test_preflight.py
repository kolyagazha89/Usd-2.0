#!/usr/bin/env python3
import ipaddress
import unittest
from preflight import validate

def fixture():
    return {
        "VENUE_BIND_IP": "192.168.50.10",
        "VENUE_IMAGE_TAG": "a" * 40,
        "VENUE_STAGE_ID": "c510f672-79f7-44eb-8173-2a8ff94b1c0e",
        "VENUE_SIGNING_KEY_FINGERPRINT": "b"*64,
        "VENUE_DB_NAME": "usd_venue",
        "VENUE_DB_USER": "usd_venue",
        "VENUE_DB_PASSWORD": "a secure private password",
        "VENUE_DATABASE_URL": "postgresql://usd_venue:a%20secure%20private%20password@db:5432/usd_venue?schema=public",
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
    def test_signing_public_key_fingerprint_required(self):
        for fingerprint in ("", "REPLACE_SHA", "a"*8, "x"*64):
            env=fixture()
            env["VENUE_SIGNING_KEY_FINGERPRINT"]=fingerprint
            with self.assertRaises(ValueError):
                validate(env)

    def test_stage_pin_required(self):
        for stage in ("", "REPLACE_WITH_STAGE_UUID", "not-a-uuid",
                      "00000000-0000-0000-0000-000000000000"):
            env=fixture()
            env["VENUE_STAGE_ID"]=stage
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
    def test_local_database_url_must_match_separate_venue_database_and_password(self):
        for dsn in (
            "postgresql://usd_venue:wrong@db:5432/usd_venue?schema=public",
            "postgresql://usd_venue:a%20secure%20private%20password@db:5432/usd_prod?schema=public",
            "postgresql://usd_venue:a%20secure%20private%20password@db:5432/postgres?schema=public",
            "postgresql://usd_venue:a%20secure%20private%20password@db:5432/usd_venue?schema=private",
            "postgresql://usd_venue:a%20secure%20private%20password@db:5432/usd_venue?schema=public&host=production.example",
            "postgresql://usd_venue:a%20secure%20private%20password@db:5432/usd_venue?hostaddr=10.0.0.1",
            "postgresql://usd_venue:a%20secure%20private%20password@db:5432/usd_venue?schema=public&schema=other",
            "postgresql://usd_venue:a%20secure%20private%20password@db:5432/usd_venue#fragment",
            "postgresql://usd_venue:a%20secure%20private%20password@db:5432/usd_venue?service=production",
        ):
            with self.subTest(dsn=dsn.split('@')[-1]):
                env = fixture()
                env["VENUE_DATABASE_URL"] = dsn
                with self.assertRaises(ValueError):
                    validate(env)

    def test_venue_database_name_is_simple_nonproduction_identifier(self):
        for name in ("usd", "postgres", "template1", "usd;DROP DATABASE usd", "", "prod_usd"):
            with self.subTest(name=name):
                env=fixture()
                env["VENUE_DB_NAME"]=name
                with self.assertRaises(ValueError):
                    validate(env)

    def test_no_production_service_secrets(self):
        env = fixture()
        env["API_PUBLIC_URL"] = "https://api.usd-russia.ru"
        with self.assertRaises(ValueError):
            validate(env)

if __name__ == "__main__":
    unittest.main()
