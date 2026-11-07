#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统一构建脚本：把"源文件"重新压缩成发布用的 .min 文件。

用法：
  python scripts/build.py            # 构建全部
  python scripts/build.py --check    # 只检查是否有过期产物，不写入（CI 用）
  python scripts/build.py --site english-materials

规则：
  - 每个 xxx.css 旁边生成 xxx.min.css（若该站确实引用了 .min 产物）
  - app.js / theme.js 等被引用为 .min.js 的，同样生成
  - sw.js -> sw.min.js（root-site）
  - 只在源文件确实有对应 .min 产物时构建，避免产生无用文件

退出码：--check 模式下有过期产物返回 1。
"""
import argparse
import gzip
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE = os.path.dirname(ROOT)
ESBUILD = os.path.join(WORKSPACE, "work", "minify-tools", "node_modules", "esbuild", "bin", "esbuild")
NODE = os.path.join(
    os.path.expanduser("~"),
    ".dsh", "dsh-runtimes", "dsh-primary-runtime", "dependencies", "node", "bin", "node.exe"
)

SITES = {
    "root-site": ROOT,
    "english-materials": os.path.join(WORKSPACE, "english-materials"),
    "sishu": os.path.join(WORKSPACE, "sishu"),
    "web-vocab": os.path.join(WORKSPACE, "web-vocab"),
    "cefr-vocab": os.path.join(WORKSPACE, "cefr-vocab"),
    "deploy-web": os.path.join(WORKSPACE, "deploy-web"),
}

SKIP_DIRS = {".git", "node_modules", "artifacts", "work", "_backup"}


def iter_files(root, exts):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name.endswith(exts):
                yield os.path.join(dirpath, name)


def minify(src, dst):
    ext = os.path.splitext(src)[1].lower()
    cmd = [NODE, ESBUILD, src, "--outfile=" + dst]
    cmd.append("--minify-whitespace" if ext == ".js" else "--minify")
    if ext == ".js":
        cmd.append("--minify-syntax")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"esbuild failed for {src}: {result.stderr[:400]}")


def is_stale(src, dst):
    """产物不存在或比源文件旧，视为过期。"""
    if not os.path.exists(dst):
        return True
    return os.path.getmtime(dst) < os.path.getmtime(src)


def targets_for(site_name, site_root):
    """返回 [(src, dst)] 列表：只处理"确实存在对应 .min 产物"的文件。"""
    pairs = []
    for src in iter_files(site_root, (".css", ".js")):
        base = os.path.basename(src)
        if base.endswith(".min.css") or base.endswith(".min.js"):
            continue
        if base.endswith(".bundle.js"):
            continue
        dst = os.path.splitext(src)[0] + (".min.css" if src.endswith(".css") else ".min.js")
        if os.path.exists(dst):
            pairs.append((src, dst))
    return pairs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只检查，不写入")
    ap.add_argument("--site", default=None, help="只构建某个站点")
    args = ap.parse_args()

    sites = SITES if not args.site else {args.site: SITES[args.site]}
    stale = []
    built = 0
    errors = []

    for name, root in sites.items():
        if not os.path.isdir(root):
            continue
        for src, dst in targets_for(name, root):
            if not is_stale(src, dst):
                continue
            rel = os.path.relpath(dst, WORKSPACE)
            stale.append(rel)
            if args.check:
                continue
            try:
                minify(src, dst)
                built += 1
                before = os.path.getsize(dst)
                print(f"[built] {rel} ({before / 1024:.1f} KB)")
            except Exception as exc:  # noqa: BLE001
                errors.append((rel, str(exc)[:200]))

    if errors:
        print("[error] build failures:")
        for rel, msg in errors:
            print(f"  {rel}: {msg}")
        return 1

    if args.check:
        if stale:
            print(f"[fail] {len(stale)} stale minified asset(s):")
            for rel in stale:
                print("  " + rel)
            print("[hint] 运行 python root-site/scripts/build.py 重新构建")
            return 1
        print("[ok] all minified assets up to date")
        return 0

    print(f"[ok] built {built} file(s), {len(stale)} stale detected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
