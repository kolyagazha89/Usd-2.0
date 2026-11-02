#!/usr/bin/env python3
"""Public USD brand/model indexer. Two-column CSVs. Respect robots.txt."""
import csv, json, re, time, argparse
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse, urljoin
from urllib.robotparser import RobotFileParser
import requests
from bs4 import BeautifulSoup
from xml.etree import ElementTree as ET

UA="USD-CatalogBot/1.0 (+https://github.com/kolyagazha89/Usd-2.0)"
AUDIO={
"Deaf Bonce":("https://deafbonce.com",["/subwoofers/","/amplifiers/","/speakers/"]),
"Pride":("https://pridecaraudio.com",["/"]),
"Aura":("https://www.aurael.ru",["/"]),
"DL Audio":("https://dlaudio.ru",["/"]),
"Ural":("https://ural-auto.ru",["/"]),
"Kicx":("https://kicx.ru",["/"]),
"Dynamic State":("https://dynamicstatetech.ru",["/"]),
"Sundown Audio":("https://sundownaudio.com",["/collections/subwoofers","/collections/amplifiers"]),
"Skar Audio":("https://www.skaraudio.com",["/collections/subwoofers","/collections/amplifiers"]),
"DD Audio":("https://ddaudio.com",["/"]),
"Ground Zero":("https://www.ground-zero-audio.com",["/"]),
"B2 Audio":("https://b2audio.com",["/"]),
"Taramps":("https://www.taramps.com.br",["/"]),
"Stetsom":("https://stetsom.com.br",["/"]),
"Rockford Fosgate":("https://rockfordfosgate.com",["/"]),
"Hertz":("https://hertz-audio.com",["/"]),
"Fi Car Audio":("https://www.ficaraudio.com",["/"]),
"Resilient Sounds":("https://www.resilientsounds.com",["/"]),
}
GOOD=re.compile(r"subwoofer|speaker|woofer|tweeter|midrange|midbass|amplifier|monoblock|horn|head.unit|receiver|акустик|сабвуфер|усилител|динамик|рупор|магнитол",re.I)
BAD=re.compile(r"shirt|hoodie|gift.card|sticker|hat|merch|repair|recone|dust.cap|cable|fuse|mounting|enclosure|box|accessor|terminal|basket|magnet",re.I)
PRODUCT_PATH=re.compile(r"^/(?:products?|subwoofers|speakers|amplifiers)/[^/?#]+/?$",re.I)
DROM_BRAND=re.compile(r"^/catalog/([^/]+)/?$")
DROM_MODEL=re.compile(r"^/catalog/([^/]+)/([^/]+)/?$")

def tidy(s):return re.sub(r"\s+"," ",s or "").strip(" \n\t-–|")
def key(s):return tidy(s).casefold().replace("ё","е")
class Fetch:
 def __init__(self,delay=0.6):
  self.s=requests.Session();self.s.headers.update({"User-Agent":UA,"Accept-Language":"ru,en;q=0.8"})
  self.robots={};self.last={};self.errors=[];self.delay=delay;self.count=0
 def get(self,url):
  u=urlparse(url);origin=u.scheme+"://"+u.netloc
  if origin not in self.robots:
   try:
    r=self.s.get(origin+"/robots.txt",timeout=20)
    if r.status_code in (401,403,429):self.robots[origin]=False
    elif r.status_code==200:
     p=RobotFileParser();p.parse(r.text.splitlines());self.robots[origin]=p
    else:self.robots[origin]=True
   except Exception as e:self.robots[origin]=False;self.errors.append("robots "+origin+": "+str(e)[:90])
  rule=self.robots[origin]
  if rule is False or (not isinstance(rule,bool) and not rule.can_fetch(UA,url)):
   self.errors.append("disallowed "+url);return None
  delay=self.delay-(time.monotonic()-self.last.get(origin,0))
  if delay>0:time.sleep(delay)
  self.last[origin]=time.monotonic()
  try:
   r=self.s.get(url,timeout=25);self.count+=1
   if r.status_code==200:return r
   self.errors.append("HTTP "+str(r.status_code)+" "+url)
  except Exception as e:self.errors.append("HTTP "+url+": "+str(e)[:90])
  return None

def drom(f):
 rows=set();brands={}
 home=f.get("https://www.drom.ru/catalog/")
 if home:
  soup=BeautifulSoup(home.text,"html.parser")
  for a in soup.select("a[href]"):
   u=urlparse(urljoin("https://www.drom.ru",a["href"]))
   m=DROM_BRAND.fullmatch(u.path)
   name=tidy(a.get_text(" ",strip=True))
   if m and u.netloc.endswith("drom.ru") and name and len(name)<60 and name.lower() not in ("легковые авто","каталог"):brands[m[1]]=name
 # Sitemap of model names may expose brands omitted by the landing page.
 for i in range(1,11):
  r=f.get(f"https://www.drom.ru/sitemap/html/sales_firm_model_{i}.html")
  if not r:continue
  for a in BeautifulSoup(r.text,"html.parser").select("a[href]"):
   u=urlparse(urljoin("https://www.drom.ru",a["href"]))
   m=re.match(r"^/([^/]+)/([^/]+)/(?:used|new)/?$",u.path)
   if not m or u.netloc!="auto.drom.ru":continue
   brand_slug=m[1]
   label=tidy(re.sub(r"\s+(?:б\.у\.|новые)$","",a.get_text(" ",strip=True),flags=re.I))
   brand=brands.get(brand_slug)
   if brand and label.lower().startswith(brand.lower()+" "):
    model=tidy(label[len(brand):])
    if model:rows.add((brand,model))
 # Canonical catalog pages collect discontinued models too.
 for slug,brand in sorted(brands.items()):
  r=f.get("https://www.drom.ru/catalog/"+slug+"/")
  if not r:continue
  for a in BeautifulSoup(r.text,"html.parser").select("a[href]"):
   u=urlparse(urljoin("https://www.drom.ru",a["href"]))
   m=DROM_MODEL.fullmatch(u.path)
   if m and m[1]==slug and u.netloc.endswith("drom.ru"):
    model=tidy(a.get_text(" ",strip=True))
    if model and len(model)<90 and key(model)!=key(brand):rows.add((brand,model))
  if len(brands)%20==0:print("Drom",slug,len(rows),flush=True)
 return rows, len(brands)

def sitemap_urls(f,base,limit=1500):
 found=set();seen=set();q=[base.rstrip("/")+"/sitemap.xml",base.rstrip("/")+"/sitemap_index.xml"]
 host=urlparse(base).hostname
 while q and len(seen)<160 and len(found)<limit:
  url=q.pop(0)
  if url in seen:continue
  seen.add(url);r=f.get(url)
  if not r:continue
  try:root=ET.fromstring(r.content)
  except ET.ParseError:continue
  for x in root.iter():
   if not x.tag.endswith("loc") or not x.text:continue
   u=x.text.strip();p=urlparse(u)
   if p.hostname!=host:continue
   if p.path.endswith(".xml") and "sitemap" in p.path and len(q)<250:q.append(u)
   elif PRODUCT_PATH.match(p.path) and not BAD.search(p.path):found.add(u.split("?")[0])
 return sorted(found)[:limit]

def add_audio(rows,brand,title):
 t=tidy(re.sub(r"\s+\|.*$","",title))
 if not t or len(t)>120 or BAD.search(t) or key(t) in ("shop","catalog","products","speakers","amplifiers","subwoofers"):return
 if brand=="Deaf Bonce":
  for b in ["Deaf Bonce","Apocalypse","Machete","Avatar","Hannibal","Black Hydra"]:
   if t.lower().startswith(b.lower()+" "):
    rows.add((b,tidy(t[len(b):])));return
 if t.lower().startswith(brand.lower()+" "):t=tidy(t[len(brand):])
 if t and key(t)!=key(brand):rows.add((brand,t))

def audio(f):
 rows=set();stats={}
 for brand,(base,listings) in AUDIO.items():
  rset=set()
  # Public Shopify storefront JSON avoids per-product requests where supported.
  for page in range(1,21):
   r=f.get(base+"/products.json?limit=250&page="+str(page))
   if not r:break
   try:products=r.json().get("products",[])
   except Exception:break
   if not products:break
   for p in products:
    name=p.get("title","");category=p.get("product_type","")
    if GOOD.search(category+" "+name) and not BAD.search(category+" "+name):add_audio(rset,brand,name)
   if len(products)<250:break
  # Public WooCommerce Store endpoint.
  if not rset:
   for page in range(1,31):
    r=f.get(base+"/wp-json/wc/store/v1/products?per_page=100&page="+str(page))
    if not r:break
    try:products=r.json()
    except Exception:break
    if not isinstance(products,list) or not products:break
    for p in products:
     name=BeautifulSoup(p.get("name",""),"html.parser").get_text(" ",strip=True)
     categories=" ".join(c.get("name","") for c in p.get("categories",[]) if isinstance(c,dict))
     if GOOD.search(categories+" "+name) and not BAD.search(categories+" "+name):add_audio(rset,brand,name)
    if len(products)<100:break
  urls=set(sitemap_urls(f,base))
  for path in listings:
   r=f.get(base.rstrip("/")+path)
   if not r:continue
   for a in BeautifulSoup(r.text,"html.parser").select("a[href]"):
    u=urljoin(base,a["href"]);p=urlparse(u)
    if p.hostname==urlparse(base).hostname and PRODUCT_PATH.fullmatch(p.path):
     urls.add(u.split("?")[0])
     label=tidy(a.get("title","") or a.get_text(" ",strip=True))
     if label and len(label)<100:add_audio(rset,brand,label)
  for url in sorted(urls):
   r=f.get(url)
   if not r:continue
   soup=BeautifulSoup(r.text,"html.parser")
   h=soup.find("h1")
   if h:add_audio(rset,brand,h.get_text(" ",strip=True))
  stats[brand]={"models":len(rset),"product_pages":len(urls)}
  rows.update(rset);print("Audio",brand,len(rset),flush=True)
 return rows,stats

def write(path,header,rows):
 with open(path,"w",newline="",encoding="utf-8-sig") as out:
  w=csv.writer(out);w.writerow(header)
  w.writerows(sorted(set(rows),key=lambda x:(key(x[0]),key(x[1]))))

def main():
 a=argparse.ArgumentParser();a.add_argument("--output",default="catalog-output");a.add_argument("--cars-only",action="store_true");a.add_argument("--audio-only",action="store_true");a.add_argument("--delay",type=float,default=0.6);args=a.parse_args()
 output=Path(args.output);output.mkdir(parents=True,exist_ok=True);f=Fetch(args.delay);report={}
 if not args.audio_only:
  cars,brands=drom(f);write(output/"cars.csv",["марка","модель"],cars);report["cars"]={"rows":len(cars),"brands":brands}
 if not args.cars_only:
  sound,stats=audio(f);write(output/"audio.csv",["бренд","модель"],sound);report["audio"]={"rows":len(sound),"sites":stats}
 report["requests"]=f.count;report["errors"]=f.errors[:500];(output/"coverage.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
 print(json.dumps({k:v for k,v in report.items() if k!="errors"},ensure_ascii=False))
 if any(v["rows"]==0 for k,v in report.items() if k in ("cars","audio")):raise SystemExit(2)
if __name__=="__main__":main()
