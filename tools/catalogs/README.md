# USD reference catalogs — import staging (2026-11-03)

Data files are gathered separately from the deployed competition website. No production database has been altered.

## Ready-to-review CSV exports

| Export | Columns (UTF-8 CSV) | Records | Coverage |
| --- | --- | ---: | --- |
| [Vehicles](data/usd_cars.csv) | `марка,модель` | 4,347 | 308 makes from Drom's official public catalog |
| [Audio](data/usd_audio.csv) | `бренд,модель,категория` | 3,275 | 28 brands and product-series labels, sourced from manufacturer catalog pages and indexed manufacturer product cards |

The files intentionally contain no product price, wattage, size, impedance, URLs, generational data, or vehicle trim details.

## Audio category codes

- `SUBWOOFER` — subwoofer products
- `AUDIO_COMPONENT` — front/rear acoustics, midrange, midbass, coaxial, tweeters/horns
- `AMPLIFIER` — amplifiers and monoblocks
- `HEAD_UNIT` — receivers, head units
- `DSP` — signal processors

These are reference product **types**, not the FRONT/REAR/SUB vehicle installation positions.

## Provenance and quality

Source fragments are in [data/fragments](data/fragments), grouped by manufacturer website. For Deaf Bonce, original brand/series labels (Machete, Apocalypse, Avatar, Hannibal, Black Hydra) are separate brand choices. See [coverage.json](data/coverage.json) for per-brand counts and incomplete sources.

The vehicle list was collected by make and model only from Drom's public catalog and model listings; generation/year pages are excluded. Two-column vehicle records and three-column audio records are deduplicated case-insensitively. Product cards with descriptive names have been reduced to model identifiers; marketing wattages, component kits, repair modules and accessory names have been excluded where identifiable. Manufacturer accessories and kits were filtered where identified; a final manual inspection is still advisable before enabling strict-only choice validation for participants.

**Known gaps:** Kicx and Dynamic State direct host downloads timed out, so their product names were collected from indexed official product titles; this method cannot certify exhaustive coverage. Hertz products were fetched through a public page-reading plugin; SounDigital links used a free text extraction gateway. For exhaustive Kicx / Dynamic State coverage, direct official product feeds or an approved export are still needed; current and historical coverage varies by manufacturer. The dataset is useful as a strong seed and should not be described as literally complete.

## Testing and refresh

`python -m unittest discover -s tools/catalogs -p 'test_*.py' -v` validates exports and collector logic without touching the database. [catalog-data-validation.yml](../../.github/workflows/catalog-data-validation.yml) runs that check on PR changes.

`python tools/catalogs/scrape.py --output catalog-output --delay 0.6` runs a free Python collection with public source pages and robots.txt checks where supported. The much slower multi-site [catalog-collector.yml](../../.github/workflows/catalog-collector.yml) workflow is **manual only** to avoid repeatedly scraping third-party sites on every commit.

These CSV exports are not an automatically approved DB migration. Review source permissions, remaining category conflicts and incomplete makes/brands before importing or changing live account forms.
