"""Static catalog QA for pre-import reference CSVs.
These tests do not touch production databases or external sites.
"""
import csv
import unittest
from pathlib import Path

DATA = Path(__file__).parent / "data"
AUDIO_TYPES = {"SUBWOOFER", "AUDIO_COMPONENT", "AMPLIFIER", "HEAD_UNIT", "DSP"}

def load(path, expected):
    with path.open(encoding="utf-8-sig", newline="") as f:
        csv_rows = csv.reader(f)
        assert next(csv_rows) == expected, f"{path}: incorrect headers"
        rows = list(csv_rows)
        assert all(len(row) == len(expected) for row in rows), f"{path}: incorrect number of columns"
        return rows

class ExportedCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cars = load(DATA / "usd_cars.csv", ["марка", "модель"])
        cls.audio = load(DATA / "usd_audio.csv", ["бренд", "модель", "категория"])

    def test_cars_are_real_bulk_catalog_not_placeholder(self):
        self.assertGreater(len(self.cars), 4200)
        self.assertGreater(len({r[0] for r in self.cars}), 300)
        self.assertIn(["Toyota", "Camry"], self.cars)
        self.assertNotIn(["каталог спецтехники", "Автомобили"], self.cars)

    def test_audio_has_full_import_categories_and_many_models(self):
        self.assertGreater(len(self.audio), 2600)
        self.assertGreater(len({r[0] for r in self.audio}), 16)
        self.assertTrue({r[2] for r in self.audio}.issubset(AUDIO_TYPES))
        self.assertIn(["Apocalypse", "AAB-1200.2D", "AMPLIFIER"], self.audio)

    def test_no_blank_values_or_year_only_car_models(self):
        for make, model in self.cars:
            self.assertTrue(make.strip() and model.strip())
            self.assertFalse(len(model) == 4 and model.isdigit() and 1880 <= int(model) <= 2100, (make, model))
        for brand, model, category in self.audio:
            self.assertTrue(brand.strip() and model.strip() and category.strip())

    def test_no_duplicate_brand_and_model_keys(self):
        normalize = lambda v: " ".join(v.casefold().replace("ё", "е").split())
        for rows in (self.cars, self.audio):
            keys = [(normalize(r[0]), normalize(r[1])) for r in rows]
            self.assertEqual(len(keys), len(set(keys)))

    def test_source_fragments_have_the_same_audio_header(self):
        files = sorted((DATA / "fragments").glob("*.csv"))
        self.assertGreaterEqual(len(files), 16)
        for path in files:
            with self.subTest(path=path.name):
                rows = load(path, ["бренд", "модель", "категория"])
                self.assertTrue(rows)

if __name__ == "__main__":
    unittest.main()
