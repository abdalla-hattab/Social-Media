"""Product sitemaps for Salla stores whose own sitemap misses the live products.

Salla's sitemap for some stores lists only hidden (out of stock) products that
redirect to the home page. This builds a clean sitemap from the public Store API
(visible products only) plus the store's own home, pages and categories, and the
store's robots.txt points Google and Bing to it.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from xml.sax.saxutils import escape

STORES = [
    {"slug": "bluemix", "domain": "https://bluemix-sa.com", "store_id": "1957830158"},
]
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "standalone", "sitemaps")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"


def get(url, headers=None, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
            return urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(3 * (i + 1))


def enc(url):
    p = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(urllib.parse.unquote(p.path), safe="/-._~")
    return urllib.parse.urlunsplit((p.scheme, p.netloc, path, p.query, ""))


def final_url(url):
    """Follow redirects (Salla's /p/<page> links 301 to the page's real address)."""
    try:
        req = urllib.request.Request(enc(url), headers={"User-Agent": UA})
        r = urllib.request.urlopen(req, timeout=30)
        return r.geturl() if r.status == 200 else None
    except Exception:
        return None


def store_pages(domain):
    """Home, pages and categories from Salla's own sitemap (those are fine)."""
    urls = []
    index = get(domain + "/sitemap.xml")
    for sm in re.findall(r"<loc>([^<]+)</loc>", index):
        for loc in re.findall(r"<loc>([^<]+)</loc>", get(sm)):
            if not re.search(r"/p\d+/?$", loc):
                u = final_url(loc)
                if u and urllib.parse.urlsplit(u).netloc == urllib.parse.urlsplit(domain).netloc:
                    urls.append(u)
    return urls


def visible_products(store_id):
    items, url, pages = [], "https://api.salla.dev/store/v1/products?per_page=100", 0
    while url and pages < 2000:
        d = json.loads(get(url, {"Store-Identifier": store_id}))
        items += d.get("data") or []
        url = (d.get("cursor") or {}).get("next")
        pages += 1
    return items


def build(store):
    pages = store_pages(store["domain"])
    products = visible_products(store["store_id"])
    out = os.path.join(OUT_DIR, store["slug"] + ".xml")

    # Never replace a good file with a broken fetch
    if os.path.exists(out):
        old = open(out, encoding="utf-8").read().count("/p")
        if products and old and len(products) < old * 0.5:
            sys.exit(f"{store['slug']}: only {len(products)} products vs {old} before, keeping the old file")
    if not products:
        sys.exit(f"{store['slug']}: no products from the Store API, keeping the old file")

    seen, rows = set(), []
    for u in pages:
        u = enc(u)
        if u not in seen:
            seen.add(u)
            rows.append(f"  <url><loc>{escape(u)}</loc></url>")
    for p in products:
        u = enc(p["url"])
        if u in seen:
            continue
        seen.add(u)
        img = ((p.get("original_image") or {}).get("url") if isinstance(p.get("original_image"), dict) else None) or (p.get("image") or {}).get("url")
        image = f"<image:image><image:loc>{escape(enc(img))}</image:loc></image:image>" if img else ""
        rows.append(f"  <url><loc>{escape(u)}</loc>{image}</url>")

    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
           'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
           + "\n".join(rows) + "\n</urlset>\n")
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"{store['slug']}: {len(pages)} pages/categories + {len(products)} products -> {out}")


if __name__ == "__main__":
    for s in STORES:
        build(s)
