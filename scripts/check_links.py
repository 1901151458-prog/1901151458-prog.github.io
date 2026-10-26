#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Check all published pages and their external links.

Usage:
  python scripts/check_links.py                 # internal + external
  python scripts/check_links.py --internal-only
  python scripts/check_links.py --max-external 80
Exit code 1 when an internal page or a hard external link fails.
"""
import argparse
import concurrent.futures
import re
import sys
import urllib.error
import urllib.request
from urllib.parse import urljoin, urlparse

UA = "Mozilla/5.0 (compatible; dsh-link-check/1.0)"
ORIGIN = "https://1901151458-prog.github.io"
SITEMAPS = [
    ORIGIN + "/sitemap.xml",
    ORIGIN + "/english-materials/sitemap.xml",
    ORIGIN + "/sishu/sitemap.xml",
    ORIGIN + "/english-vocab-test/sitemap.xml",
    ORIGIN + "/cefr-vocab-test/sitemap.xml",
    ORIGIN + "/UDHR/sitemap.xml",
]
# 403/429/451 are often bot protection rather than dead links.
SOFT = {401, 403, 405, 429, 451}
ALLOW_HOSTS = {"www.acftu.org.cn"}  # blocked from some networks; keep as warning
SKIP_SUFFIX = (".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".zip")


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception as e:  # noqa: BLE001
        return "ERR:" + type(e).__name__, b""


def sitemap_urls():
    urls = []
    for sm in SITEMAPS:
        status, body = fetch(sm)
        if status != 200:
            print(f"[warn] sitemap {sm} -> {status}")
            continue
        urls += re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body.decode("utf-8", "replace"))
    # de-duplicate, keep order
    seen = set()
    return [u for u in urls if not (u in seen or seen.add(u))]


def page_links(pages):
    links = set()
    bad_pages = []
    link_re = re.compile(r'href=["\'](https?://[^"\']+)["\']', re.I)
    for url in pages:
        status, body = fetch(url)
        if status != 200:
            bad_pages.append((url, status))
            continue
        html = body.decode("utf-8", "replace")
        for raw in link_re.findall(html):
            full = urljoin(url, raw)
            if urlparse(full).scheme in ("http", "https"):
                links.add(full)
    return links, bad_pages


def check_external(links, max_external):
    hard, soft = [], []
    if max_external and len(links) > max_external:
        print(f"[info] {len(links)} external links, checking first {max_external}")
        links = sorted(links)[:max_external]

    def one(url):
        if urlparse(url).hostname in ALLOW_HOSTS:
            return url, 0, "allow"
        status, _ = fetch(url, timeout=15)
        return url, status, ""

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        for url, status, note in ex.map(one, sorted(links)):
            if note == "allow":
                soft.append((url, "allowlist"))
            elif isinstance(status, int) and 200 <= status < 400:
                continue
            elif isinstance(status, int) and status in SOFT:
                soft.append((url, status))
            else:
                hard.append((url, status))
    return hard, soft


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--internal-only", action="store_true")
    ap.add_argument("--max-external", type=int, default=800)
    args = ap.parse_args()

    pages = sitemap_urls()
    print(f"[info] sitemap pages: {len(pages)}")
    links, bad_pages = page_links(pages)
    external = sorted(
        {u for u in links if urlparse(u).hostname not in ("1901151458-prog.github.io", "localhost")}
    )
    print(f"[info] unique external links: {len(external)}")

    hard = []
    soft = []
    if not args.internal_only:
        hard, soft = check_external(external, args.max_external)

    if bad_pages:
        print("[error] internal pages failed:")
        for url, status in bad_pages:
            print(f"  {status} {url}")
    if hard:
        print("[error] dead external links:")
        for url, status in hard:
            print(f"  {status} {url}")
    if soft:
        print("[warn] soft/allowlisted links:")
        for url, status in soft[:30]:
            print(f"  {status} {url}")
        if len(soft) > 30:
            print(f"  ... {len(soft) - 30} more")

    if bad_pages or hard:
        print(f"[fail] pages={len(pages)} bad_pages={len(bad_pages)} dead_ext={len(hard)}")
        return 1
    print(f"[ok] pages={len(pages)} external={len(external)} soft={len(soft)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
