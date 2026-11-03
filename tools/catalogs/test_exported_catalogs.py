"""Static catalog QA for pre-import reference CSVs.
These tests do not touch production databases or external sites.
"""
import csv
import json
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
        self.assertGreaterEqual(len(self.audio), 3350)
        self.assertGreaterEqual(len({r[0] for r in self.audio}), 30)
        self.assertTrue({r[2] for r in self.audio}.issubset(AUDIO_TYPES))
        self.assertIn(["Apocalypse", "AAB-1200.2D", "AMPLIFIER"], self.audio)
        self.assertIn(["Hertz", "CP 1.2K", "AMPLIFIER"], self.audio)
        self.assertIn(["Dynamic State", "CUSTOM CA-100.6", "AMPLIFIER"], self.audio)
        self.assertIn(["Kicx", "ST-12M", "SUBWOOFER"], self.audio)
        self.assertIn(["Dynamic State", "FORCE P5W21 (2+2 Ohms)", "SUBWOOFER"], self.audio)
        self.assertIn(["Dynamic State", "CUSTOM CM-20.1v2", "AUDIO_COMPONENT"], self.audio)
        self.assertIn(["Headshot", "Q315 (2+2)", "SUBWOOFER"], self.audio)
        self.assertIn(["Loud Level", "LL 1000D", "AMPLIFIER"], self.audio)
        self.assertIn(["Kicx", "ST D8 (version 1.1)", "DSP"], self.audio)

    def test_kicx_crossover_parts_do_not_appear_as_models(self):
        self.assertNotIn(["Kicx", "Кроссовер CR-96", "AUDIO_COMPONENT"], self.audio)
        self.assertNotIn(["Sound Civilization", "X6", "AUDIO_COMPONENT"], self.audio)
        self.assertNotIn(["Kicx", "E12", "SUBWOOFER"], self.audio)
        self.assertNotIn(["Kicx", "E15", "SUBWOOFER"], self.audio)

    def test_no_blank_values_or_year_only_car_models(self):
        for make, model in self.cars:
            self.assertTrue(make.strip() and model.strip())
            self.assertFalse(len(model) == 4 and model.isdigit() and 1880 <= int(model) <= 2100, (make, model))
        for brand, model, category in self.audio:
            self.assertTrue(brand.strip() and model.strip() and category.strip())
            self.assertNotIn(" - официальный", model)
            self.assertNotIn(", штука", model)
            self.assertNotIn(", пара", model)

    def test_no_duplicate_brand_and_model_keys(self):
        normalize = lambda v: " ".join(v.casefold().replace("ё", "е").split())
        for rows in (self.cars, self.audio):
            keys = [(normalize(r[0]), normalize(r[1])) for r in rows]
            self.assertEqual(len(keys), len(set(keys)))

    def test_coverage_manifest_agrees_with_actual_exports(self):
        report = json.loads((DATA / "coverage.json").read_text(encoding="utf-8"))
        self.assertEqual(report["cars"]["rows"], len(self.cars))
        self.assertEqual(report["cars"]["brands"], len({row[0] for row in self.cars}))
        self.assertEqual(report["audio"]["rows"], len(self.audio))
        self.assertEqual(report["audio"]["brands"], len({row[0] for row in self.audio}))
        for category, count in report["audio"]["categories"].items():
            self.assertEqual(count, sum(row[2] == category for row in self.audio))
        for brand, count in report["audio"]["counts_by_brand"].items():
            self.assertEqual(count, sum(row[0] == brand for row in self.audio))
        self.assertFalse(report["production_import"])

    def test_no_csv_formula_injection_at_the_start_of_fields(self):
        for rows in (self.cars, self.audio):
            for row in rows:
                for field in row:
                    self.assertFalse(field.startswith(("=", "+", "@", "\t", "\r")), row)

    def test_source_fragments_have_the_same_audio_header(self):
        files = sorted((DATA / "fragments").glob("*.csv"))
        self.assertGreaterEqual(len(files), 16)
        for path in files:
            with self.subTest(path=path.name):
                rows = load(path, ["бренд", "модель", "категория"])
                self.assertTrue(rows)

if __name__ == "__main__":
    unittest.main()
