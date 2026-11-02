import unittest
from normalize_model_names import normalize, process

class ModelNameNormalizationTests(unittest.TestCase):
    def test_edge_model_identifier_without_marketing_description(self):
        self.assertEqual(
            normalize("EDGE", "EDB12D2-E3 | EDGE DB Series 1200 watts Subwoofer", "SUBWOOFER"),
            ("EDGE", "EDB12D2-E3", "SUBWOOFER"),
        )

    def test_sp_audio_model_without_power_size_or_impedance(self):
        self.assertEqual(
            normalize("SP Audio", 'SP 10CM Midrange 10" 200W RMS (Pair)', "AUDIO_COMPONENT"),
            ("SP Audio", "SP 10CM", "AUDIO_COMPONENT"),
        )

    def test_sundown_model_retains_variant_but_no_product_description(self):
        self.assertEqual(
            normalize("Sundown Audio", 'E-Series V.4 12" Subwoofer', "SUBWOOFER"),
            ("Sundown Audio", 'E-Series V.4 12"', "SUBWOOFER"),
        )

    def test_decline_accessories_and_recone_parts(self):
        self.assertIsNone(normalize("Pride", "Модуль Solo.300 8", "AUDIO_COMPONENT"))
        self.assertIsNone(normalize("SP Audio", "SP 0 AWG CCA Amplifier Wiring Kit", "AMPLIFIER"))
        self.assertIsNone(normalize("DD Audio", "DRMT-3: D Series Remote", "DSP"))

    def test_duplicate_model_keys_retain_one_entry(self):
        rows = process([
            ("Pride", "Apollo", "AMPLIFIER"),
            ("PRIDE", "apollo", "AMPLIFIER"),
        ])
        self.assertEqual(len(rows), 1)

    def test_conflicting_product_types_are_held_out_of_import(self):
        self.assertEqual(
            process([("Example", "TEST 12", "SUBWOOFER"), ("Example", "TEST 12", "AMPLIFIER")]),
            [],
        )

if __name__ == "__main__":
    unittest.main()
