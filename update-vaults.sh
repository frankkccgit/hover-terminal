#!/bin/zsh
# 把每個開著、有裝 Hover Terminal 的 vault 立刻更新到 GitHub 上的最新版，並核對實際載入的版本。
# 用法：./update-vaults.sh [版本號]（預設：manifest.json 的版本號）
# release.sh 發版後會自動執行；平常發現某個 vault 停在舊版時也可以單獨執行。
#
# 為什麼需要：BRAT 只在 Obsidian 啟動時檢查更新，vault 一直開著就會停在舊版
# （2026-11-10 Learning 停在 0.1.2，沒有防覆蓋，終端機被開檔案蓋掉）。
#
# 安全性：BRAT 更新完會重新載入 hover-terminal，這不會關掉終端機。絕對不要重載 terminal 外掛。
# 注意：Skills 若裝著 dev-install.sh 的測試版，會被正式版覆蓋。
cd "$(dirname "$0")"
v=${1:-$(jq -r .version manifest.json)}
id=hover-terminal
repo=frankkccgit/hover-terminal

ev() { obsidian vault="$1" eval code="$2" </dev/null 2>/dev/null | grep '^=> ' | sed 's/^=> //'; }
loaded() { ev "$1" "app.plugins.plugins['$id']?.manifest.version ?? 'not loaded'"; }

fail=0
# 只處理 Obsidian 標記為開著的 vault，而且要有裝這個外掛
jq -r '.vaults[] | select(.open == true) | .path' ~/Library/Application\ Support/obsidian/obsidian.json |
while read -r dir; do
  name=${dir:t}
  [ -f "$dir/.obsidian/plugins/$id/manifest.json" ] || continue

  ev "$name" "app.plugins.plugins['obsidian42-brat']?.betaPlugins.updatePlugin('$repo',false,false,false); 'started'" >/dev/null

  # BRAT 是非同步下載，最多等 20 秒
  got=""
  for i in {1..20}; do
    got=$(loaded "$name")
    [ "$got" = "$v" ] && break
    sleep 1
  done

  # 檔案已經是新版但記憶體裡的 manifest 還是舊的（例如 dev-install 只複製了 main.js）：重新讀 manifest 再重載
  if [ "$got" != "$v" ] && [ "$(jq -r .version "$dir/.obsidian/plugins/$id/manifest.json")" = "$v" ]; then
    ev "$name" "app.plugins.loadManifests().then(()=>app.plugins.disablePlugin('$id')).then(()=>app.plugins.enablePlugin('$id'))" >/dev/null
    sleep 2
    got=$(loaded "$name")
  fi

  if [ "$got" = "$v" ]; then
    echo "✓ $name：$got"
  else
    echo "✗ $name：載入的是 $got，不是 $v"
    fail=1
  fi
done
exit $fail
