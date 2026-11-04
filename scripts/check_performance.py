#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Scheduled availability / response-time / page-size check for GitHub Pages.

Exit code 1 only when an internal page or critical asset is not 200.
Slow responses and large pages are warnings, not failures.
"""
import concurrent.futures
import gzip
import http.client
import json
import os
import statistics
import time
import urllib.parse

ORIGIN = "1901151458-prog.github.io"
SITEMAPS = [
    "/sitemap.xml",
    "/english-materials/sitemap.xml",
    "/sishu/sitemap.xml",
    "/english-vocab-test/sitemap.xml",
    "/cefr-vocab-test/sitemap.xml",
    "/UDHR/sitemap.xml",
]
CRITICAL = [
    "/manifest.webmanifest",
    "/english-materials/manifest.webmanifest",
    "/sishu/manifest.webmanifest",
    "/english-vocab-test/manifest.webmanifest",
    "/cefr-vocab-test/manifest.webmanifest",
    "/UDHR/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-512.png",
    "/sw.js",
    "/sw.min.js",
    "/sw-register.js?v=4",
    "/search-widget.js?v=3",
    "/search-index.json",
    "/english-materials/assets/search-index.json",
    "/sishu/assets/search-index.json",
]
TTFB_WARN = float(os.environ.get("PERF_TTFB_WARN", "4.0"))
SIZE_WARN_KB = float(os.environ.get("PERF_SIZE_WARN_KB", "250"))


def fetch(path, timeout=25):
    """Return status, connect time, TTFB, total, compressed bytes, raw bytes, headers."""
    t0 = time.time()
    conn = http.client.HTTPSConnection(ORIGIN, timeout=timeout)
    try:
        conn.connect()
        connect = time.time() - t0
        t_req = time.time()
        conn.request("GET", path, headers={
            "User-Agent": "Mozilla/5.0 (compatible; dsh-perf-check/1.0)",
            "Accept-Encoding": "gzip",
        })
        res = conn.getresponse()
        ttfb = time.time() - t_req
        body = res.read()
        total = time.time() - t_req
        raw = gzip.decompress(body) if res.getheader("Content-Encoding") == "gzip" else body
        return {
            "status": res.status,
            "connect": connect,
            "ttfb": ttfb,
            "total": total,
            "compressed": len(body),
            "raw": len(raw),
            "content_type": res.getheader("Content-Type", ""),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "ERR:" + type(exc).__name__,
            "connect": time.time() - t0,
            "ttfb": 0,
            "total": time.time() - t0,
            "compressed": 0,
            "raw": 0,
            "content_type": "",
        }
    finally:
        conn.close()


def get_sitemap_urls():
    urls = []
    for sm in SITEMAPS:
        item = fetch(sm)
        if item["status"] != 200:
            print(f"[warn] sitemap {sm} -> {item['status']}")
            continue
        conn = http.client.HTTPSConnection(ORIGIN, timeout=25)
        try:
            conn.request("GET", sm, headers={"User-Agent": "dsh-perf-check"})
            body = conn.getresponse().read().decode("utf-8", "replace")
            import re
            urls += re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body)
        finally:
            conn.close()
    return list(dict.fromkeys(urls))


def main():
    pages = get_sitemap_urls()
    print(f"[info] sitemap pages: {len(pages)}")

    def check(url):
        path = url.replace("https://" + ORIGIN, "")
        return url, fetch(path)

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for url, item in ex.map(check, pages):
            results.append({"url": url, **item})

    ok = [r for r in results if r["status"] == 200]
    failures = [r for r in results if r["status"] != 200]
    slow = [r for r in ok if r["ttfb"] > TTFB_WARN]
    heavy = [r for r in ok if r["compressed"] / 1024 > SIZE_WARN_KB]

    critical = []
    for path in CRITICAL:
        critical.append({"path": path, **fetch(path)})
    critical_failures = [r for r in critical if r["status"] != 200]

    print(f"[info] pages ok={len(ok)} failed={len(failures)}")
    if ok:
        print(f"[info] TTFB median={statistics.median(r['ttfb'] for r in ok):.2f}s "
              f"max={max(r['ttfb'] for r in ok):.2f}s")
        print(f"[info] gzip median={statistics.median(r['compressed'] for r in ok) / 1024:.1f}KB "
              f"max={max(r['compressed'] for r in ok) / 1024:.1f}KB")
    for r in sorted(ok, key=lambda x: x["compressed"], reverse=True)[:8]:
        print(f"[size] {r['compressed'] / 1024:6.1f}KB  {r['url']}")
    for r in sorted(ok, key=lambda x: x["ttfb"], reverse=True)[:5]:
        print(f"[slow] {r['ttfb']:5.2f}s  {r['url']}")
    for r in critical_failures:
        print(f"[error] critical asset {r['path']} -> {r['status']}")
    for r in failures[:20]:
        print(f"[error] page {r['url']} -> {r['status']}")

    out_dir = "artifacts/performance"
    os.makedirs(out_dir, exist_ok=True)
    payload = {
        "pages": results,
        "critical": critical,
        "summary": {
            "pages_total": len(pages),
            "pages_ok": len(ok),
            "pages_failed": len(failures),
            "critical_failed": len(critical_failures),
            "slow_pages": len(slow),
            "heavy_pages": len(heavy),
            "ttfb_median": statistics.median(r["ttfb"] for r in ok) if ok else None,
            "ttfb_max": max((r["ttfb"] for r in ok), default=None),
            "gzip_median_kb": statistics.median(r["compressed"] for r in ok) / 1024 if ok else None,
        },
    }
    with open(os.path.join(out_dir, "performance.json"), "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)

    lines = [
        "# 全站性能检查",
        "",
        f"- 页面：{len(pages)}，正常 {len(ok)}，失败 {len(failures)}",
        f"- 关键资源失败：{len(critical_failures)}",
        f"- TTFB 中位：{payload['summary']['ttfb_median']:.2f}s，"
        f"最大：{payload['summary']['ttfb_max']:.2f}s",
        f"- gzip 中位：{payload['summary']['gzip_median_kb']:.1f} KB",
        f"- 慢页面（>{TTFB_WARN}s）：{len(slow)}",
        f"- 大页面（>{SIZE_WARN_KB}KB）：{len(heavy)}",
        "",
        "## 失败页面",
    ]
    lines += [f"- {r['url']} -> {r['status']}" for r in failures] or ["- 无"]
    lines += ["", "## 关键资源失败"]
    lines += [f"- {r['path']} -> {r['status']}" for r in critical_failures] or ["- 无"]
    lines += ["", "## 最重页面"]
    lines += [f"- {r['compressed'] / 1024:.1f} KB · {r['url']}" for r in sorted(ok, key=lambda x: x["compressed"], reverse=True)[:8]]
    with open(os.path.join(out_dir, "summary.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    if failures or critical_failures:
        print("[fail] availability check failed")
        return 1
    print("[ok] availability check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
