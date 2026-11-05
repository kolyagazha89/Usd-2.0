# Head-unit source review — 2026-11-04

This is a **reference list** of verified real car radio/head-unit model identifiers only, for USD's `HEAD_UNIT` category. It is not a claim of exhaustive historical coverage. Sources live here **outside** the three-column import CSV.

| Catalog brand | Source | Evidence and scope |
| --- | --- | --- |
| Deaf Bonce | https://deafbonce.com/apps/receivers/ and https://alphardaudio.ru/products/receivers/all/all/all/ | DB-100/300DSP/500DSP firmware and manufacturer/distributor receivers; Gemini models are receiver series assigned to Deaf Bonce |
| Hannibal | https://alphardaudio.ru/products/receivers/brand-deafbonce/rca_output_count-4/ | HBM-101/102/103 BT listed as head units |
| Pioneer | https://pioneer-car.eu/caraudio and https://pioneer-car.eu/displayaudio | EU manufacturer car/audio and display receivers |
| Kenwood | https://www.kenwood.com/usa/car/caraudio/receivers/ and https://www.kenwood.com/soc/ | KDC/KMM/DPX and identified DMX multimedia receiver model labels; exclude marine and accessories |
| JVC | https://www.us.jvc.com/car/ and https://www.us.jvc.com/car/indashreceivers/ | Multimedia and in-dash car receivers; marine models excluded |
| Alpine | https://www.alpine-usa.com/product/ute-73bt and https://www.alpine-usa.com/product/ilxf509-alpine-halo9-hi-res-multimedia-receiver and https://staging.alpine-usa.com/products/receivers | Official receiver pages including archived model families; staging listing may be incomplete |
| Sony | https://electronics.sony.com/audio/car-marine-audio/c/receiver-players and https://www.sony.com/electronics/support/car-marine-entertainment-in-car-receivers | Car receivers; explicitly exclude marine-only units |
| Clarion | https://archive.clarion.com/ca/fr/user-support/software/audio/index.html | Manufacturer's historical car receiver software archive |
| Phantom | https://phantom-dvm.ru/category/phantom-dvm_s0/all/ and https://www.phantom-dvm.ru/pricelist/ | Archived DVM branded vehicle head units, not generic Kicx accessories |
| Blaupunkt | https://www.blaupunkt.com/de-de/product-category/automotive/incar-entertainment-automotive?product-category=autoradio-de | Official catalog category explicitly tagged car radio, excludes loudspeakers and adapters |
| Nakamichi | https://nakamichicaraudio.com/collections/all and https://nakamichicaraudio.com/products/nakamichi-nam1700 | Official maker receiver listings; exclude DSP, amplifiers and accessories |
| Prology | https://www.prology.ru/news/avtomagnitoli-prology-poluchili-3-letnyuyu-servisnuyu-podderzhku-1900 and https://www.prology.ru/htmlmap | Current 2026 support models plus older product index |
| ACV | https://acv-auto.com/swap-fund/ | Official warranty replacement list specifically identifies car receivers |
| Teyes | https://teyes.com.ru/sravnitelnaya-tablitsa/ and https://teyes.com.ru/brand/ | Named receiver series; current and historical labels, no vehicle fitment/memory/color variants |

## Rules
- Coverage audit considered **all brands already in** `usd_audio.csv`. Existing `Aura`, `Урал` and `DL Audio` head units remain untouched.
- Brands without a supported receiver in a manufacturer catalog are **not** given fabricated `HEAD_UNIT` records: e.g. SPL-only subwoofer, loudspeaker and amplifier brands such as Pride, Fi Car Audio, Sundown Audio, Taramps. Add them if a documented actual receiver is found later.
- Data rows have only `бренд,модель,категория`. No dimensions, power, prices, links, or installation hardware in CSV.
- No automatic production database import. Use admin preview and explicit approval; preserve existing IDs and participant history. Models are a curated, incomplete seed, not a promise of every discontinued SKU.

## Additional manufacturer historical receiver models — 4 November 2026

| Brand | Manufacturer primary-source evidence | New model identifiers in import fragment | Notes |
| --- | --- | ---: | --- |
| Kenwood | https://www.kenwood.com/cs/ce/index.php?lang=english&model=KMM and https://www.kenwood.com/cs/ce/mm/firmware/ | 123 | Full displayed **KMM** support directory plus selected non-marine models from official car-electronics catalog; includes older discontinued units. Does not include unrelated KMR marine receivers. |
| Pioneer | https://pioneer-car.eu/media/2c/44/90/1692606303/deh-mvh-fh_press_release_pee-final.pdf | 20 | Explicit 25-model manufacturer 2019 receiver press release, five previously listed; separate DEH, FH and MVH subfamilies. |
| Alpine | https://www.alpine-usa.com/company/press/2008/alpine-electronics-ups-the-ante-for-in-car-connectivity-and-great-sound-with-new-2008-head-units | 5 | Manufacturer 2008 release identifies CDA-9884/9886/9887 and CDE-9872/9874; exclude KCE/PXA adapters and processors from `HEAD_UNIT`. |
| Sony | https://www.sony.com/electronics/support/articles/MC000028 and https://www.sony.com/electronics/support/mobile-cd-players-digital-media-players-dsx-series | 12 | Official car-audio compatibility/support lists; marine DSX-M devices deliberately excluded. |

All model labels remain country/era specific; manufacturer support pages are **not** proof that every model was available in Russia. They are only a factual reference for historic configurations. No technical specifications, price, URL, or stock data enter the CSV. Data is import-staging, not auto-approved for production.

### Data quality fixes in this revision

Removed five false-positive Ural cable/connector products (`СИМФОНИЯ КНС Jack/RCA/XLR`) from `AUDIO_COMPONENT`; their source fragments are retained for audit but shared normalization explicitly excludes these rows on future rebuilds. Existing production catalog rows are **not deleted** by this change. `HEAD_UNIT` grows to 500 reference rows, total equipment references to 3,809. `frontend/public/catalogs/usd_audio.csv` and the admin import count now match the reviewed source and the frontend regression test fails if they drift.
