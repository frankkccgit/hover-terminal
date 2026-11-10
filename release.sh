#!/bin/zsh
# 發版：./release.sh <版本號>
# 例：./release.sh 0.1.4
#
# 發版前必須先在 CHANGELOG.md 最上面寫好「## <版本號> (日期)」這一段，否則拒絕發版。
# 這段內容會同時成為 commit 訊息和 GitHub Release 的說明。
# 做的事：檢查 → 改 manifest.json／versions.json 的版本號 → commit → tag → push → 發 GitHub Release
# 各 vault 的 BRAT 會在 Obsidian 下次啟動時自動更新。
set -e
cd "$(dirname "$0")"
v=$1
[ -n "$v" ] || { echo "用法：$0 <版本號>，例如 $0 0.1.4"; exit 1; }

# 檢查 1：版本號不能重複
git rev-parse -q --verify "refs/tags/$v" >/dev/null && { echo "✗ 版本 $v 已經存在"; exit 1; }

# 檢查 2：工作區不能有 CHANGELOG 以外未提交的改動（程式改動應該在開發過程中就提交）
dirty=$(git status --porcelain | grep -v ' CHANGELOG.md$' || true)
[ -z "$dirty" ] || { echo "✗ 還有未提交的改動，請先提交："; echo "$dirty"; exit 1; }

# 檢查 3：CHANGELOG 最上面那一段必須是這個版本，而且有內容
top=$(grep -m1 '^## ' CHANGELOG.md | sed -E 's/^## ([^ ]+).*/\1/')
[ "$top" = "$v" ] || { echo "✗ CHANGELOG.md 最上面那一段是 '$top'，請先加上 '## $v (日期)' 並寫好改了什麼"; exit 1; }
notes=$(awk -v v="$v" '$0 ~ "^## "v" " || $0 == "## "v {f=1; next} /^## / && f {exit} f' CHANGELOG.md | sed -e '/./,$!d')
[ -n "$notes" ] || { echo "✗ CHANGELOG.md 的 $v 段落是空的"; exit 1; }

# 檢查 4：語法
node --check main.js

min=$(jq -r .minAppVersion manifest.json)
jq --arg v "$v" '.version=$v' manifest.json > m.tmp && mv m.tmp manifest.json
jq --arg v "$v" --arg m "$min" '.[$v]=$m' versions.json > v.tmp && mv v.tmp versions.json

git add manifest.json versions.json CHANGELOG.md
git commit -q -m "Release $v" -m "$notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git tag "$v"
# 推送失敗就停下來，不要發一個 GitHub 上沒有對應程式碼的 Release（分開寫，set -e 才會生效）
git push -q
git push -q origin "$v"
gh release create "$v" main.js manifest.json styles.css --title "$v" --notes "$notes"
