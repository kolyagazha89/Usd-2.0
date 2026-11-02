#!/usr/bin/env python3
"""USD reference catalogs: only make/model or audio brand/model; no paid services."""
import csv, json, re, time, unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse, urljoin
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree as ET
import requests
from bs4 import BeautifulSoup

OUT=Path("data/catalogs")
OUT.mkdir(parents=True,exist_ok=True)
UA="USD-CatalogBot/1.0 (brand and model names only; github.com/kolyagazha89/Usd-2.0)"
ses=requests.Session()
ses.headers.update({"User-Agent":UA,"Accept-Language":"ru,en;q=0.8"})
robots={};last={};errors=[];requests_count=defaultdict(int)
def norm(s):
    return re.sub(r"\s+"," ",unicodedata.normalize("NFKC",s or "")).strip(" \t\r\n–—|")
def key(s):return norm(s).replace("ё","е").casefold()
def fetch(url):
    p=urlparse(url);base=p.scheme+"://"+p.netloc
    if base not in robots:
        try:
            r=ses.get(base+"/robots.txt",timeout=15)
            if r.status_code==200:
                rp=RobotFileParser();rp.parse(r.text.splitlines());robots[base]=rp
            else: robots[base]=r.status_code not in (401,403,429)
        except Exception:robots[base]=False
    rule=robots[base]
    if not (rule if isinstance(rule,bool) else rule.can_fetch(UA,url)):
        errors.append("ROBOTS "+url);return None
    t=.35-(time.monotonic()-last.get(base,0))
    if t>0:time.sleep(t)
    last[base]=time.monotonic()
    try:
        r=ses.get(url,timeout=20);requests_count[base]+=1
        if r.status_code==200:return r
        errors.append("HTTP "+str(r.status_code)+" "+url)
    except Exception as e:errors.append("NETWORK "+url+" "+str(e)[:100])
    return None
def save(name,cols,values):
    with (OUT/name).open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f);w.writerow(cols);w.writerows(sorted(values,key=lambda a:tuple(map(key,a))))
def good(a,b):
    return bool(a and b and len(a)<90 and len(b)<140 and key(a)!=key(b) and key(b) not in ("каталог","все модели","подробнее","купить"))
cars={};brand_slugs={}
sale_re=re.compile(r"^https?://auto\.drom\.ru/([^/?#]+)/([^/?#]+)/(?:used|new)/?$",re.I)
for i in range(1,11):
    url="https://www.drom.ru/sitemap/html/sales_firm_model_"+str(i)+".html"
    r=fetch(url); count=0
    if r:
        for a in BeautifulSoup(r.text,"html.parser").select("a[href]"):
            m=sale_re.match(urljoin(url,a["href"]))
            if not m:continue
            brand_slug=m.group(1);title=norm(re.sub(r"\s+(?:б\.у\.|новые)$","",a.get_text(" ",strip=True),flags=re.I))
            expr=r"^[\s\-_]*".join(re.escape(s) for s in brand_slug.replace("_"," ").replace("-"," ").split())
            match=re.match(expr+r"(?=\s|[-–]|\d)",title,re.I)
            if not match:continue
            brand=norm(title[:match.end()]);model=norm(title[match.end():])
            if good(brand,model):
                cars[(key(brand),key(model))]=(brand,model);brand_slugs[brand_slug]=brand;count+=1
    print("Drom sitemap",i,"entries",count,flush=True)
sitemaps_ok=sum("sales_firm_model_"+str(i) not in err for i in [] for err in errors)
brand_pages_ok=0
for slug,brand in sorted(brand_slugs.items()):
    url="https://www.drom.ru/catalog/"+slug+"/"
    r=fetch(url)
    if not r:continue
    brand_pages_ok+=1
    for a in BeautifulSoup(r.text,"html.parser").select("a[href]"):
        p=urlparse(urljoin(url,a["href"]))
        m=re.fullmatch(r"/catalog/([^/]+)/([^/]+)/?",p.path)
        if not m or m.group(1).lower()!=slug.lower():continue
        model=norm(a.get_text(" ",strip=True))
        if good(brand,model):cars[(key(brand),key(model))]=(brand,model)
save("cars.csv",("марка","модель"),cars.values())
print("Drom total",len(cars),"brands",len(brand_slugs),"brand pages",brand_pages_ok,flush=True)

sites=[
("Deaf Bonce","https://deafbonce.com",["/subwoofers/","/amplifiers/","/speakers/"]),
("Pride","https://pridecaraudio.com",["/products/"]),
("Aura","https://www.aurael.ru",["/shop/"]),
("DL Audio","https://dlaudio.ru",["/catalog/"]),
("Ural","https://ural-auto.ru",["/catalog/"]),
("Kicx","https://kicx.ru",["/catalog/"]),
("Dynamic State","https://dynamicstatetech.ru",["/catalog/"]),
("Sundown Audio","https://sundownaudio.com",["/collections/subwoofers","/collections/amplifiers"]),
("Skar Audio","https://www.skaraudio.com",["/collections/subwoofers","/collections/amplifiers"]),
("DD Audio","https://ddaudio.com",["/products/"]),
("Ground Zero","https://www.ground-zero-audio.com",["/products/"]),
("B2 Audio","https://b2audio.com",["/collections/"]),
("Taramps","https://www.taramps.com.br",["/produtos/"]),
("Stetsom","https://stetsom.com.br",["/produtos/"]),
("Rockford Fosgate","https://rockfordfosgate.com",["/products/"]),
("Hertz","https://hertz-audio.com",["/product/"]),
("Fi Car Audio","https://www.ficaraudio.com",["/collections/"]),
("Resilient Sounds","https://www.resilientsounds.com",["/collections/"]),
]
deaf_lines=("Deaf Bonce","Apocalypse","Machete","Avatar","Hannibal","Black Hydra")
product_link=re.compile(r"/(?:product|products|subwoofers|speakers|amplifiers)/[^/?#]+/?$",re.I)
omit=re.compile(r"\b(?:t-shirts?|hoodies?|sticker|cap|shirt|merch|hat|gift card|recone|replacement|repair kit|enclosure|wiring kit|wire|cable|terminal|fuse|bracket|grille|dust cap)\b",re.I)
audio={};coverage={}
def put(brand,title):
    title=norm(re.sub(r"\s+[\|–]\s+.*$","",title))
    if not title or len(title)>130 or omit.search(title):return
    if brand=="Deaf Bonce":
        for line in deaf_lines:
            if title.casefold().startswith(line.casefold()+" "):
                brand=line;title=norm(title[len(line):]);break
    elif title.casefold().startswith(brand.casefold()+" "): title=norm(title[len(brand):])
    if good(brand,title) and not re.fullmatch(r"(?:Products?|Speakers?|Subwoofers?|Amplifiers?|Shop|Каталог|Товары)",title,re.I):
        audio[(key(brand),key(title))]=(brand,title)
def xml_product_urls(base,limit=280):
    root=urlparse(base).netloc.removeprefix("www.")
    queue=[base+"/sitemap.xml",base+"/sitemap_index.xml",base+"/product-sitemap.xml"]
    seen=set();pages=set()
    while queue and len(seen)<65 and len(pages)<limit:
        u=queue.pop(0)
        if u in seen:continue
        seen.add(u);r=fetch(u)
        if not r:continue
        try:t=ET.fromstring(r.content)
        except ET.ParseError:continue
        for el in t.iter():
            if el.tag.rsplit("}",1)[-1]!="loc" or not el.text:continue
            loc=el.text.strip().split("?",1)[0];p=urlparse(loc)
            if not p.netloc.removeprefix("www.").endswith(root):continue
            if loc.endswith(".xml") and "sitemap" in loc:
                if len(queue)<150:queue.append(loc)
            elif product_link.search(p.path) and not omit.search(p.path):
                pages.add(loc)
    return sorted(pages)[:limit]
for brand,base,lists in sites:
    base=base.rstrip("/");before=len(audio);scanned=0
    # Shopify products JSON and public WooCommerce store API: names only.
    for page in range(1,15):
        r=fetch(base+"/products.json?limit=250&page="+str(page))
        if not r:break
        try:products=r.json()["products"]
        except (ValueError,TypeError,KeyError):break
        if not isinstance(products,list) or not products:break
        for item in products:
            typ=item.get("product_type","");name=item.get("title","")
            if re.search(r"subwoofer|speaker|amplifier|tweeter|woofer|midrange|midbass|monoblock|dsp|акустика|сабвуфер|усилител|динамик",typ+" "+name,re.I):
                put(brand,name)
        if len(products)<250:break
    for page in range(1,8):
        r=fetch(base+"/wp-json/wc/store/v1/products?per_page=100&page="+str(page))
        if not r:break
        try:products=r.json()
        except ValueError:break
        if not isinstance(products,list) or not products:break
        for item in products:
            typ=" ".join(c.get("name","") for c in item.get("categories",[]))
            name=BeautifulSoup(str(item.get("name","")),"html.parser").get_text(" ",strip=True)
            if re.search(r"subwoofer|speaker|amplifier|tweeter|woofer|midrange|midbass|monoblock|dsp|акустика|сабвуфер|усилител|динамик",typ+" "+name,re.I):
                put(brand,name)
        if len(products)<100:break
    urls=xml_product_urls(base)
    for url in urls:
        r=fetch(url)
        if not r:continue
        scanned+=1;soup=BeautifulSoup(r.text,"html.parser")
        h1=soup.select_one("h1")
        if h1:put(brand,h1.get_text(" ",strip=True))
        else:
            tag=soup.select_one('meta[property="og:title"]')
            if tag:put(brand,tag.get("content",""))
    for path in lists:
        r=fetch(base+path)
        if not r:continue
        for a in BeautifulSoup(r.text,"html.parser").select("a[href]"):
            url=urlparse(urljoin(base,a["href"]))
            if url.netloc.removeprefix("www.")!=urlparse(base).netloc.removeprefix("www."):continue
            if product_link.search(url.path):
                title=norm(a.get("title") or a.get_text(" ",strip=True))
                if title:put(brand,title)
    n=len(audio)-before
    coverage[brand]={"new_models":n,"product_pages":scanned,"sitemap_product_urls":len(urls)}
    print("Audio",brand,n,"models",scanned,"product pages",flush=True)
save("audio.csv",("бренд","модель"),audio.values())
report={"cars":{"rows":len(cars),"brands":len(brand_slugs),"brand_pages":brand_pages_ok},"audio":{"rows":len(audio),"brands":len(set(x[0] for x in audio.values())),"sites":coverage},"requests":requests_count,"errors":errors[:200],"complete":len(cars)>1000 and all(x["new_models"]>0 for x in coverage.values())}
(OUT/"coverage.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("FINISHED",len(cars),len(audio),"complete",report["complete"],flush=True)
if len(cars)<100 or len(audio)<20: raise SystemExit("Insufficient scraped data; do not publish as complete")
