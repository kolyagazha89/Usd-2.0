#!/usr/bin/env python3
"""Normalize official model labels into USD's minimal brand/model/category CSV format.

This intentionally removes descriptive marketing strings, prices, wattages and
accessory/repair records. Category codes must match the USD backend schema.
"""
import argparse
import csv
import re
import unicodedata
from pathlib import Path

FIELDS = ["бренд", "модель", "категория"]
TYPES = {"SUBWOOFER", "AUDIO_COMPONENT", "AMPLIFIER", "HEAD_UNIT", "DSP"}
ACCESSORY = re.compile(
    r"wire kit|amplifier wiring|speaker wire|power wire|cable|recone|"
    r"rebuild|repair|\bspare\b|\breplacement\b|"
    r"^адаптер\b|\bмм2\b|^модуль\s|^кабель|^провод|ремкомплект|система оповещения|"
    r"акустический комплект|sound.?bar|Vanity Plate|Kit Only|"
    r"^ПРО Климат|camera|рекон|"
    r"^DRMT\b|^GRP-|^LED-RBG|^MRMT\b|^SSRMT|^VMRMT|"
    r"^VO-CT|^TXO|^WXO|^DSI-3-RMT|^SC[246](?:a)?\b|"
    r"^SP\s+\d+\s+AWG|^TRIO\s+3K\s+PLAYER",
    re.IGNORECASE,
)

def collapse(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip()

def normalize(brand, model, category):
    brand, model, category = map(collapse, (brand, model, category))
    if not brand or len(model) < 2 or category not in TYPES or ACCESSORY.search(model):
        return None
    if brand == "EDGE":
        model = re.split(r"\s+\|\s+", model, maxsplit=1)[0].strip()
    if brand == "DD Audio":
        model = re.split(r":\s+", model, maxsplit=1)[0].strip()
        model = re.sub(r"\s+\d+(?:[.,]\d+)?\s*(?:w|watts)\b.*$", "", model, flags=re.I).strip()
    if brand == "SP Audio":
        model = re.sub(r"\s*\([^)]*PRICE\)\s*$", "", model, flags=re.I).strip()
        model = re.sub(
            r"\s+(?:ENTRY LEVEL|Midrange|Subwoofer|Tweeter|Driver|Horn|Speaker|Loudspeaker|Coaxial|Amplifier)\b.*$",
            "", model, flags=re.I,
        ).strip()
        model = re.sub(r"\s*(?:/|-)\s*\d+(?:\.\d+)?\s*(?:WATT|W|RMS)\b.*$", "", model, flags=re.I).strip()
        model = re.sub(r"\s+\d+(?:\.\d+)?\s*(?:WATT|W|RMS)\b.*$", "", model, flags=re.I).strip()
    if brand == "Sundown Audio":
        model = re.sub(
            r"\s+(?:Subwoofer|Subwoofers|Speakers?|Super Tweeter|Co-?Axial|"
            r"Component Speakers?|Pro Sound|Monoblock Amplifier|Amplifier)\b.*$",
            "", model, flags=re.I,
        ).strip()
        model = re.sub(r"\s+\d+(?:\.\d+)?\s*(?:WATT|W)\b.*$", "", model, flags=re.I).strip()
    if brand == "Pride":
        model = re.sub(r"\s+car audio$", "", model, flags=re.I)
        model = re.sub(r"^component Pride\s+", "", model, flags=re.I)
        model = re.sub(r"\s+(?:Woofer|dome tweeters|speakers?)(?:\s+.*)?$", "", model, flags=re.I).strip()
    if brand == "Урал":
        model = re.sub(r"^(?:Автомобильная мультимедийная система|Радиоприемник с USB проигрывателем)\s+", "", model, flags=re.I)
        model = re.sub(r"\s+Радиоприемник\b.*$", "", model, flags=re.I).strip()
    if len(model) < 2 or len(model) > 120:
        return None
    return brand, model, category

def process(rows):
    out = {}
    conflicts = set()
    for row in rows:
        cleaned = normalize(*row)
        if cleaned is None:
            continue
        brand, model, category = cleaned
        key = (brand.casefold().replace("ё", "е"), model.casefold().replace("ё", "е"))
        if key in conflicts:
            continue
        previous = out.get(key)
        if previous and previous[2] != category:
            out.pop(key, None)
            conflicts.add(key)
        elif not previous:
            out[key] = cleaned
    return sorted(out.values(), key=lambda r: (r[0].casefold(), r[1].casefold()))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    with args.input.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.reader(stream)
        if next(reader) != FIELDS:
            raise SystemExit("unexpected CSV columns")
        rows = process(reader)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(FIELDS)
        writer.writerows(rows)
    print(f"normalized {len(rows)} rows")

if __name__ == "__main__":
    main()
