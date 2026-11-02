import csv
import tempfile
import unittest
from pathlib import Path
from scrape import add_audio, classify, drom, write

class CatalogTests(unittest.TestCase):
    def test_audio_section_is_primary(self):
        self.assertEqual(classify("", "/subwoofers/apocalypse-db-sa415"), "SUBWOOFER")
        self.assertEqual(classify("", "/amplifiers/deaf-bonce-atom"), "AMPLIFIER")
        self.assertEqual(classify("Type: Midrange", "/speakers/machete-mm-50l"), "AUDIO_COMPONENT")
        self.assertEqual(classify("Type: Horn Tweeter", "/speakers/ap-t25"), "AUDIO_COMPONENT")
        self.assertEqual(classify("Type: Midbass", "/speakers/model"), "AUDIO_COMPONENT")
        self.assertEqual(classify("Type: Coaxial", "/speakers/model"), "AUDIO_COMPONENT")
        self.assertEqual(classify("Car Audio Receiver"), "HEAD_UNIT")
        self.assertIsNone(classify("", "/speakers/unknown-model"))
        self.assertIsNone(classify("gift card, amplifier", "/products/gift-card"))

    def test_series_are_brands_and_unknowns_reviewed(self):
        rows, review = set(), set()
        add_audio(rows, review, "Deaf Bonce", "Apocalypse DB-SA415 D1/D2", "SUBWOOFER")
        add_audio(rows, review, "Deaf Bonce", "Apocalypse DB-SA415 D1/D2", "SUBWOOFER")
        add_audio(rows, review, "Deaf Bonce", "Machete MM-50L", "AUDIO_COMPONENT")
        add_audio(rows, review, "Aura", "Storm 679", None)
        self.assertIn(("Apocalypse", "DB-SA415 D1/D2", "SUBWOOFER"), rows)
        self.assertIn(("Machete", "MM-50L", "AUDIO_COMPONENT"), rows)
        self.assertIn(("Aura", "Storm 679"), review)
        self.assertEqual(len(rows), 2)

    def test_csv_has_only_expected_three_columns(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "audio.csv"
            write(p, ["бренд", "модель", "категория"], [
                ("Avatar", "STU-1246 D1/D2", "SUBWOOFER"),
                ("Avatar", "STU-1246 D1/D2", "SUBWOOFER"),
            ])
            with p.open("r", encoding="utf-8-sig", newline="") as stream:
                rows = list(csv.reader(stream))
            self.assertEqual(rows[0], ["бренд", "модель", "категория"])
            self.assertEqual(rows[1], ["Avatar", "STU-1246 D1/D2", "SUBWOOFER"])
            self.assertEqual(len(rows), 2)

    def test_drom_catalog_links_only(self):
        class FakeReply:
            def __init__(self, html): self.text = html
        class FakeFetcher:
            def get(self, url):
                if url == "https://www.drom.ru/catalog/":
                    return FakeReply('<a href="/catalog/toyota/">Toyota</a>')
                if url == "https://www.drom.ru/catalog/toyota/":
                    return FakeReply('<a href="/catalog/toyota/camry/">Camry</a><a href="/catalog/toyota/camry/2025">2025</a>')
                return None
        rows, brands = drom(FakeFetcher())
        self.assertIn(("Toyota", "Camry"), rows)
        self.assertNotIn(("Toyota", "2025"), rows)
        self.assertEqual(brands, 1)

if __name__ == "__main__":
    unittest.main()
