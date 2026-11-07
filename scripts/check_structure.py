#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""结构自检：检查静态站点里容易漏掉的问题。

检查项：
  1. 内部相对链接是否有目标文件
  2. 页面是否有重复 id
  3. 是否恰好一个 <h1>
  4. <html lang> / <title> / meta description / viewport 是否齐全
  5. `?v=` 版本引用的文件是否存在
  6. CSS 花括号是否配平
  7. JS 语法（node --check）
  8. window.X = {...} 形式的数据文件是否是合法 JSON
  9. JSON 文件是否可解析

用法：
  python scripts/check_structure.py            # 全部检查
  python scripts/check_structure.py --quiet    # 只输出问题

退出码：发现问题返回 1。
"""
import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE = os.path.dirname(ROOT)
SITES = ["english-materials", "sishu", "web-vocab", "cefr-vocab", "deploy-web", "root-site"]
SKIP_DIRS = {".git", "node_modules", "artifacts", "work", "__pycache__"}
NODE = os.path.join(
    os.path.expanduser("~"),
    ".dsh", "dsh-runtimes", "dsh-primary-runtime", "dependencies", "node", "bin", "node.exe"
)


def site_roots():
    roots = []
    for name in SITES:
        path = ROOT if name == "root-site" else os.path.join(WORKSPACE, name)
        if os.path.isdir(path):
            roots.append(path)
    return roots


def iter_files(roots, suffix):
    for root in roots:
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for name in filenames:
                if name.endswith(suffix):
                    yield os.path.join(dirpath, name)


def rel(path):
    return os.path.relpath(path, WORKSPACE)


def check_links(problems):
    for path in iter_files(site_roots(), ".html"):
        html = open(path, encoding="utf-8", errors="replace").read()
        for match in re.finditer(r'(?<!data-)(?:href|src)="([^"]+)"', html):
            url = match.group(1)
            if url.startswith(("http", "mailto:", "javascript:", "data:", "#", "//", "/")) or "${" in url:
                continue
            target = url.split("#")[0].split("?")[0]
            if not target:
                continue
            if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(path), target))):
                problems.append(f"{rel(path)}: 相对链接目标不存在 -> {url}")


def check_html_structure(problems):
    for path in iter_files(site_roots(), ".html"):
        html = open(path, encoding="utf-8", errors="replace").read()
        ids = re.findall(r'\sid="([^"]+)"', html)
        seen = set()
        dups = [i for i in ids if i in seen or seen.add(i)]
        if dups:
            problems.append(f"{rel(path)}: 重复 id -> {', '.join(dups[:5])}")
        if "<html" in html and not re.search(r"<html[^>]*\blang=", html):
            problems.append(f"{rel(path)}: <html> 缺少 lang")
        if "<title>" not in html:
            problems.append(f"{rel(path)}: 缺少 <title>")
        if not re.search(r'name="description"', html):
            problems.append(f"{rel(path)}: 缺少 meta description")
        if "<html" in html and not re.search(r'name="viewport"', html):
            problems.append(f"{rel(path)}: 缺少 viewport")
        h1 = len(re.findall(r"<h1[\s>]", html))
        if h1 == 0:
            problems.append(f"{rel(path)}: 缺少 <h1>")
        elif h1 > 1:
            problems.append(f"{rel(path)}: 有 {h1} 个 <h1>")


def check_versioned_refs(problems):
    for path in iter_files(site_roots(), ".html"):
        html = open(path, encoding="utf-8", errors="replace").read()
        for match in re.finditer(r'(?:href|src)="([^"?#]+)\?v=\d+"', html):
            target = match.group(1)
            if target.startswith(("/", "http")):
                continue
            full = os.path.normpath(os.path.join(os.path.dirname(path), target))
            if not os.path.exists(full):
                problems.append(f"{rel(path)}: 版本化引用文件不存在 -> {target}")


def check_css(problems):
    for path in iter_files(site_roots(), ".css"):
        text = open(path, encoding="utf-8", errors="replace").read()
        if text.count("{") != text.count("}"):
            problems.append(f"{rel(path)}: CSS 花括号不配平 ({text.count('{')} vs {text.count('}')})")


def check_js(problems):
    if not os.path.exists(NODE):
        return
    for path in iter_files(site_roots(), ".js"):
        result = subprocess.run([NODE, "--check", path], capture_output=True, text=True)
        if result.returncode != 0:
            first = (result.stderr or "").strip().splitlines()[:2]
            problems.append(f"{rel(path)}: JS 语法错误 -> {' '.join(first)[:160]}")


def check_json(problems):
    for path in iter_files(site_roots(), ".json"):
        try:
            json.load(open(path, encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            problems.append(f"{rel(path)}: JSON 解析失败 -> {str(exc)[:120]}")
    for path in iter_files(site_roots(), ".js"):
        text = open(path, encoding="utf-8", errors="replace").read()
        match = re.search(r"window\.\w+\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
        if not match:
            continue
        try:
            json.loads(match.group(1))
        except Exception as exc:  # noqa: BLE001
            problems.append(f"{rel(path)}: window 数据不是合法 JSON -> {str(exc)[:120]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    problems = []
    checks = [
        ("相对链接", check_links),
        ("HTML 结构", check_html_structure),
        ("版本化引用", check_versioned_refs),
        ("CSS", check_css),
        ("JS 语法", check_js),
        ("JSON", check_json),
    ]
    for name, fn in checks:
        before = len(problems)
        fn(problems)
        if not args.quiet:
            status = "ok" if len(problems) == before else f"{len(problems) - before} 个问题"
            print(f"[{name}] {status}")

    if problems:
        print(f"[fail] 共 {len(problems)} 个问题:")
        for item in problems[:50]:
            print("  " + item)
        if len(problems) > 50:
            print(f"  ... 还有 {len(problems) - 50} 个")
        return 1

    print("[ok] 结构自检全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
