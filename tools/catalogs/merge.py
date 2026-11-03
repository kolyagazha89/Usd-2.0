#!/usr/bin/env python3
"""Merge independent USD crawl artifacts into exactly two import-ready CSV files."""
import csv
import json
import argparse
from collections import defaultdict
from pathlib import Path
from unicodedata import normalize
from normalize_model_names import ACCESSORY

AUDIO_CATEGORIES = {"SUBWOOFER", "AUDIO_COMPONENT", "AMPLIFIER", "HEAD_UNIT", "DSP"}

def unique_key(value):
    return " ".join(normalize("NFKC", value).replace("ё", "е").casefold().split())

def read_csv(path, columns):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != columns:
            raise ValueError(f"Unexpected columns in {path}: {reader.fieldnames!r}")
        yield from reader

def merge(input_root, output):
    output.mkdir(parents=True, exist_ok=True)
    car_rows = {}
    audio_rows = {}
    conflicts = []
    reports = []
    unclassified = []
    for file in sorted(input_root.rglob("coverage.json")):
        reports.append({"fragment": str(file.relative_to(input_root)), "results": json.loads(file.read_text(encoding="utf-8"))})
    for file in sorted(input_root.rglob("cars.csv")):
        for item in read_csv(file, ["марка", "модель"]):
            brand, model = item["марка"].strip(), item["модель"].strip()
            if brand and model and 2 <= len(model) <= 100:
                car_rows[(unique_key(brand), unique_key(model))] = (brand, model)
    for file in sorted(input_root.rglob("audio.csv")):
        for item in read_csv(file, ["бренд", "модель", "категория"]):
            brand, model, category = (item[col].strip() for col in ("бренд", "модель", "категория"))
            if not (brand and model and 2 <= len(model) <= 120 and category in AUDIO_CATEGORIES):
                conflicts.append({"reason": "invalid", "source": str(file), "row": item})
                continue
            if ACCESSORY.search(model):
                conflicts.append({"reason": "non_equipment_accessory", "source": str(file), "row": item})
                continue
            key = unique_key(brand), unique_key(model)
            existing = audio_rows.get(key)
            if existing and existing[2] != category:
                conflicts.append({"reason": "category_conflict", "old": existing, "new": (brand, model, category)})
                audio_rows.pop(key, None)
                continue
            audio_rows[key] = (brand, model, category)
    for file in sorted(input_root.rglob("audio_unclassified.json")):
        unclassified.extend(json.loads(file.read_text(encoding="utf-8")))
    for filename, fields, rows in [
        ("usd_cars.csv", ["марка", "модель"], car_rows.values()),
        ("usd_audio.csv", ["бренд", "модель", "категория"], audio_rows.values()),
    ]:
        with (output / filename).open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(fields)
            writer.writerows(sorted(rows, key=lambda row: tuple(unique_key(v) for v in row)))
    report = {
        "cars": {"brands": len({x[0] for x in car_rows}), "models": len(car_rows)},
        "audio": {
            "brands": len({x[0] for x in audio_rows.values()}),
            "models": len(audio_rows),
            "categories": {k: sum(row[2] == k for row in audio_rows.values()) for k in sorted(AUDIO_CATEGORIES)},
            "unclassified": len(unclassified),
            "conflicts": len(conflicts),
        },
        "fragments": reports,
        "verified_complete": False,
        "note": "Coverage is not guaranteed; check source restrictions and fragment errors. Do not bulk-import without review.",
    }
    (output / "coverage.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "needs_review.json").write_text(json.dumps({"unclassified": unclassified, "conflicts": conflicts}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"cars": report["cars"], "audio": report["audio"]}, ensure_ascii=False), flush=True)
    if not car_rows or not audio_rows:
        raise SystemExit("At least one catalog has no collected rows; check coverage reports")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    merge(Path(args.input), Path(args.output))

if __name__ == "__main__":
    main()
