#!/usr/bin/env bash
# ============================================================
#  bazi-hepan 一键部署脚本 (GitHub Pages)
#  用法（在 Git Bash 里，进入 bazi-hepan 目录后执行）：
#      bash deploy.sh                 # 用默认提交说明
#      bash deploy.sh "你的说明"       # 用自定义说明
#  注意：本脚本只提交站点核心文件，不会把终端截图等杂物带进去。
# ============================================================
set -e
cd "$(dirname "$0")" || exit 1

MSG="${1:-deploy: $(date +%Y-%m-%d_%H%M)}"

echo "==> 当前改动"
git status --short

echo "==> 暂存站点核心文件（显式列表，避免漏文件 / 误提交杂物）"
git add index.html css/style.css js/app.js js/bazi.js lib/lunar.js lib/html2canvas.min.js assets/ deploy.sh

# 没有待提交内容就直接结束，不报错
if git diff --cached --quiet; then
  echo "✓ 没有需要部署的改动，已是最新。"
  exit 0
fi

echo "==> 提交：$MSG"
git commit -m "$MSG"

echo "==> 推送到 main（触发 Pages 自动部署）"
git push origin main

echo "✅ 已推送。等 1-2 分钟刷新 https://123wyd456.github.io/bazi-hepan/ 即可生效。"
