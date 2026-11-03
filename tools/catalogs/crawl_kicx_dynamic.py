#!/usr/bin/env python3
"""Collect make/model/category only from two *official* SPL catalogs.

Designed for a one-time free GitHub-hosted runner: no Firecrawl credits.
Every request respects robots.txt and rate limits. It never queries USD's DB.

Example:
    python tools/catalogs/crawl_kicx_dynamic.py --out catalog-site-output
"""
import argparse
import csv
import json
import random
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree as ET

import requests
from bs4 import BeautifulSoup

USER_AGENT = "USD-CatalogBot/1.0 (+https://github.com/kolyagazha89/Usd-2.0)"
UA_HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "ru,en;q=0.8"}
CATEGORIES = ("SUBWOOFER", "AMPLIFIER", "AUDIO_COMPONENT")
BASES = {
    "kicx": "https://kicx.ru",
    "dynamic_state": "https://www.dynamicstate.ru",
}
IGNORE = re.compile(
    r"recone|repair|rebuild|ремкомплект|рем[.\s]*комплект|провод|cable|"
    r"корпус(?:а|ов)?\s+для|grille|grill|установочный|набор\s+для|"
    r"акустические\s+сетки|кроссовер|клеммы|^отзыв|^комментарий|"
    r"^аксессуар|^сетка\b|^проставочн|^сабвуферы\b|^усилители\b",
    re.I,
)
KICX_BRANDS = {
    "headshot": "Headshot", "head shot": "Headshot", "loud level": "Loud Level",
    "sound civilization": "Sound Civilization", "terza": "Terza",
    "kicx": "Kicx",
}
DYNAMIC_GROUPS = (
    "sabvufery", "usiliteli", "akustika",
)
KICX_GROUPS = (
    "sabvufery", "usiliteli", "akustika",
)


def tidy(text):
    return re.sub(r"\s+", " ", text or "").strip()


class OfficialCatalog:
    def __init__(self, site, delay):
        self.site = site
        self.base = BASES[site]
        self.domain = urlparse(self.base).netloc.lstrip("www.")
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update(UA_HEADERS)
        self.errors = []
        self.requests = 0
        self.blocked = False
        self.last = 0.0
        self.robots = self._get_robots()

    def _get_robots(self):
        try:
            url = self.base + "/robots.txt"
            r = self.session.get(url, timeout=18)
            if r.status_code != 200:
                self.errors.append(f"robots {r.status_code}: {url}")
                self.blocked = True
                return None
            rp = RobotFileParser()
            rp.parse(r.text.splitlines())
            return rp
        except requests.RequestException as exc:
            self.errors.append("robots unavailable: " + str(exc)[:150])
            self.blocked = True
            return None

    def get(self, url):
        p = urlparse(url)
        if p.netloc.lstrip("www.") != self.domain or p.scheme != "https":
            return None
        if self.blocked or not self.robots or not self.robots.can_fetch(USER_AGENT, url):
            self.errors.append("robots denied: " + url)
            return None
        elapsed = time.monotonic() - self.last
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        try:
            self.last = time.monotonic()
            response = self.session.get(url, timeout=22)
            self.requests += 1
        except requests.RequestException as exc:
            self.errors.append(f"fetch {url}: {str(exc)[:140]}")
            return None
        if response.status_code in (401, 403, 429):
            self.blocked = True
            self.errors.append(f"source blocked {response.status_code}: {url}")
            return None
        if response.status_code != 200:
            self.errors.append(f"HTTP {response.status_code}: {url}")
            return None
        return response

    def sitemap(self, max_documents=60):
        queue = []
        robots_text = self.robots.__dict__ if self.robots else {}
        # The official sitemap is a standard well-known URL. Probe two only.
        queue.extend((self.base + "/sitemap.xml", self.base + "/sitemap_index.xml"))
        discovered = set()
        visited = set()
        while queue and len(visited) < max_documents and not self.blocked:
            url = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)
            response = self.get(url)
            if not response:
                continue
            try:
                root = ET.fromstring(response.content)
            except ET.ParseError:
                self.errors.append("invalid sitemap XML: " + url)
                continue
            nested = root.tag.lower().endswith("sitemapindex")
            for el in root.iter():
                if not el.tag.lower().endswith("loc") or not el.text:
                    continue
                candidate = el.text.strip().split("?")[0]
                parsed = urlparse(candidate)
                if parsed.netloc.lstrip("www.") != self.domain:
                    continue
                if nested or parsed.path.endswith(".xml"):
                    if candidate not in visited and len(queue) < 250:
                        queue.append(candidate)
                else:
                    discovered.add(candidate)
        return discovered

    def classified_url(self, url):
        path = urlparse(url).path.strip("/")
        bits = path.split("/")
        if self.site == "dynamic_state":
            if len(bits) != 4 or bits[0] != "catalog":
                return None
            if bits[1] == "sabvufery" and bits[2] in {"custom", "skif", "sarmat", "viking", "pro", "force"}:
                return "SUBWOOFER"
            if bits[1] == "usiliteli" and bits[2] in {"mono-kanalnye", "2-kh-kanalnye", "3-kh-kanalnye", "4-kh-kanalnye", "6-ti-kanalnye", "usiliteli-24v"}:
                return "AMPLIFIER"
            if bits[1] == "akustika" and bits[2] in {"vch-akustika-tvitery", "sch-akustika-midvufery"}:
                return "AUDIO_COMPONENT"
        if self.site == "kicx":
            if len(bits) < 4 or bits[0] != "katalog":
                return None
            if bits[1] == "sabvufery" and bits[2] in {"otkrytogo_tipa", "sabvufery_v_korpuse_aktivnye"} and len(bits) == 4:
                return "SUBWOOFER"
            if bits[1] == "usiliteli" and bits[2] in {
                "monobloki", "2h_kanalnye_usiliteli", "4h_kanalnye_usiliteli",
                "mnogokanalnye", "protsessory",
            } and len(bits) == 4:
                return "AMPLIFIER"
            if bits[1] == "akustika" and len(bits) in (4, 5, 6):
                if bits[2] in {"estradnaya_akustika", "avtomobilnaya_akustika"}:
                    if bits[-2] not in ("otzyvy", "otzyv"):
                        return "AUDIO_COMPONENT"
        return None

    def listing_urls(self, max_listing_pages=70):
        seeds = (
            ["catalog/sabvufery", "catalog/usiliteli",
             "catalog/akustika/vch-akustika-tvitery",
             "catalog/akustika/sch-akustika-midvufery"]
            if self.site == "dynamic_state" else
            ["katalog/sabvufery", "katalog/usiliteli", "katalog/akustika/estradnaya_akustika",
             "katalog/akustika/avtomobilnaya_akustika"]
        )
        queue = [self.base + "/" + s + "/" for s in seeds]
        seen = set()
        products = set()
        while queue and len(seen) < max_listing_pages and not self.blocked:
            url = queue.pop(0)
            if url in seen:
                continue
            seen.add(url)
            response = self.get(url)
            if not response:
                continue
            html = BeautifulSoup(response.content, "html.parser")
            for anchor in html.select("a[href]"):
                candidate = urljoin(url, anchor["href"]).split("?")[0]
                parsed = urlparse(candidate)
                if parsed.netloc.lstrip("www.") != self.domain:
                    continue
                if self.classified_url(candidate):
                    products.add(candidate)
                    continue
                if parsed.path.startswith(("/catalog/", "/katalog/")) and re.search(
                    r"(?:/sabvufery/|/usiliteli/|/akustika/)", parsed.path
                ):
                    # Follow only likely category branches, never comments or review pages.
                    if parsed.path.count("/") <= 6 and candidate not in seen and len(queue) < 180:
                        queue.append(candidate)
        return products

    def parse_product(self, url, category):
        response = self.get(url)
        if not response:
            return None
        html = BeautifulSoup(response.content, "html.parser")
        h = html.select_one("h1")
        title = tidy(h.get_text(" ", strip=True) if h else "")
        if not title:
            tag = html.find("meta", attrs={"property": "og:title"})
            title = tidy(tag.get("content", "")) if tag else ""
        title = re.sub(r"\s+[|—–-]\s+(?:официальн.+|Dynamic State.+|Kicx.+)$", "", title, flags=re.I)
        if self.site == "dynamic_state":
            title = re.sub(r"^Dynamic State\s+", "", title, flags=re.I)
            title = re.sub(r"^(?:Твитер|Мидвуфер|Усилитель|Сабвуфер)(?:\s+серии)?\s+", "", title, flags=re.I)
            title = re.sub(r",\s*(?:пара|шт\.?|штука|пара/комплект|штука/комплект)$", "", title, flags=re.I)
            brand = "Dynamic State"
        else:
            brand = "Kicx"
            for prefix, normalized in sorted(KICX_BRANDS.items(), key=lambda entry: -len(entry[0])):
                if title.lower().startswith(prefix + " "):
                    brand = normalized
                    title = title[len(prefix):].strip()
                    break
            title = re.sub(r"^\d+[-xх]\s*полосная\s+(?:коаксиальная|компонентная)\s+аудиосистема\s+(?:KICX\s+)?", "", title, flags=re.I)
        title = tidy(title)
        if not title or not re.search(r"\d", title) or IGNORE.search(title) or len(title) > 100:
            return None
        return brand, title, category

    def run(self, max_products):
        if self.blocked:
            return [], {"blocked": True, "requests": self.requests, "errors": self.errors}
        candidates = self.sitemap()
        candidates.update(self.listing_urls())
        selected = [(u, self.classified_url(u)) for u in sorted(candidates)]
        selected = [(u, c) for u, c in selected if c]
        rows = set()
        for url, cat in selected[:max_products]:
            if self.blocked:
                break
            row = self.parse_product(url, cat)
            if row:
                rows.add(row)
        return sorted(rows, key=lambda row: (row[0].casefold(), row[1].casefold())), {
            "blocked": self.blocked, "requests": self.requests,
            "candidate_products": len(selected), "visited_products": min(max_products, len(selected)),
            "extracted_models": len(rows),
            "capped": len(selected) > max_products, "errors": self.errors[:90],
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="catalog-site-output")
    parser.add_argument("--site", choices=("kicx", "dynamic_state", "all"), default="all")
    parser.add_argument("--delay", type=float, default=0.55)
    parser.add_argument("--max-products", type=int, default=700)
    opts = parser.parse_args()
    path = Path(opts.out)
    path.mkdir(parents=True, exist_ok=True)
    names = list(BASES) if opts.site == "all" else [opts.site]
    report = {}
    for site in names:
        crawl = OfficialCatalog(site, opts.delay)
        rows, stats = crawl.run(opts.max_products)
        with (path / (site + ".csv")).open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.writer(handle)
            writer.writerow(["бренд", "модель", "категория"])
            writer.writerows(rows)
        report[site] = stats
        print(site, json.dumps(stats, ensure_ascii=False), flush=True)
    (path / "source_coverage.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    if any(not report[s]["extracted_models"] for s in names):
        raise SystemExit("Not all manufacturer sites returned product catalogs; no claims of full coverage")


if __name__ == "__main__":
    main()
