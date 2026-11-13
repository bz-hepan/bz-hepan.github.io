#!/usr/bin/env bash
# ============================================================
#  bazi-hepan 一键部署脚本 (GitHub Pages)
#  用法（在 Git Bash 里，进入 bazi-hepan 目录后执行）：
#      bash deploy.sh                 # 用默认提交说明
#      bash deploy.sh "你的说明"       # 用自定义说明
#  注意：本脚本只提交站点核心文件，不会把终端截图等杂物带进去。
#        「站长工具.html」「站长私密说明.md」属于站长本地专用，绝不上传（.gitignore 已排除）。
# ============================================================
set -e
cd "$(dirname "$0")" || exit 1

MSG="${1:-deploy: $(date +%Y-%m-%d_%H%M)}"

echo "==> 当前改动"
git status --short

echo "==> 暂存站点核心文件（显式列表，避免漏文件 / 误提交杂物）"
git add .gitignore index.html css/style.css js/app.js js/bazi.js lib/lunar.js lib/html2canvas.min.js assets/ deploy.sh .github/workflows/deploy.yml 部署步骤.md

# 没有待提交内容就直接结束，不报错
if git diff --cached --quiet; then
  echo "✓ 没有需要部署的改动，已是最新。"
  exit 0
fi

echo "==> 提交：$MSG"
git commit -m "$MSG"

echo "==> 推送到 main（触发 Pages 自动部署）"
git push origin main

echo "✅ 已推送。等 1-2 分钟，刷新你的网站（自定义域名或 github.io 地址）即可生效。"
