#!/bin/zsh
# 開發測試用：把目前的 main.js／styles.css 裝進指定 vault 並重新載入外掛（預設 Skills）。
# 用法：./dev-install.sh [vault 名稱]
# 注意：這只是測試。正式版本由 BRAT 從 GitHub Release 安裝，下次 BRAT 更新時會覆蓋掉這份測試檔。
set -e
cd "$(dirname "$0")"
vault=${1:-Skills}
node --check main.js
dir=$(jq -r --arg n "$vault" '.vaults[].path | select(split("/") | last == $n)' ~/Library/Application\ Support/obsidian/obsidian.json)
[ -n "$dir" ] || { echo "✗ 找不到 vault：$vault"; exit 1; }
cp main.js styles.css "$dir/.obsidian/plugins/hover-terminal/"
obsidian vault="$vault" plugin:reload id=hover-terminal >/dev/null 2>&1
echo "✓ 已裝進 $vault 並重新載入"
