#!/usr/bin/env python3
"""Run the release helper's exact environment parser against private fixtures."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import quote

SCRIPT = Path(__file__).with_name('release-approved.sh').read_text()
PARSER = SCRIPT.split("python3 - .env <<'PY'\n", 1)[1].split('\nPY\n', 1)[0]


class ReleaseEnvironmentTests(unittest.TestCase):
    def validate(self, *, database='usd', username='usd'):
        with tempfile.TemporaryDirectory() as directory:
            environment = Path(directory) / '.env'
            environment.write_text(
                'APP_DOMAIN=app.usd-russia.ru\nAPI_DOMAIN=api.usd-russia.ru\n'
                f'POSTGRES_DB={database}\nPOSTGRES_USER={username}\n'
                'POSTGRES_PASSWORD=private-fixture-password\n'
                f'DATABASE_URL=postgresql://{quote(username, safe="")}:private-fixture-password@db:5432/{quote(database, safe="")}?schema=public\n')
            environment.chmod(0o600)
            result = subprocess.run([sys.executable, '-', str(environment)], input=PARSER,
                                    capture_output=True, text=True)
            self.assertNotIn('private-fixture-password', result.stdout + result.stderr)
            return result

    def test_plain_postgresql_identifiers_are_accepted(self):
        for value in ('usd', 'USD_2026', '_archive', 'a' * 63):
            with self.subTest(value=value):
                self.assertEqual(self.validate(database=value, username=value).returncode, 0)

    def test_libpq_connection_strings_cannot_override_the_dump_database(self):
        # pg_dump -d treats these as connection strings, even though the
        # percent-encoded URL path points the API at a local database name.
        for value in ('host=remote-db dbname=usd', 'postgresql://remote-db/usd',
                      'postgres://remote-db/usd'):
            with self.subTest(value=value):
                result = self.validate(database=value)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('plain PostgreSQL identifiers', result.stderr)

    def test_invalid_or_overlong_identifiers_are_rejected(self):
        for value in ('a' * 64, 'usd-db', '123usd', 'usd database'):
            for field in ('database', 'username'):
                with self.subTest(value=value, field=field):
                    self.assertNotEqual(self.validate(**{field: value}).returncode, 0)


if __name__ == '__main__':
    unittest.main()
