# Hover Terminal：開發規則

Obsidian 外掛（純 JS，不需要 build）。功能和原理見 README.md，版本歷史見 CHANGELOG.md。
Frank 的使用筆記（只記用法，不記開發細節）：Skills vault `280_ob_plugin/Obsidian Terminal 外掛 vs macOS Terminal.app.md`。

## 唯一正本
- 這個 repo 是唯一正本。**不要直接改 vault 裡 `.obsidian/plugins/hover-terminal/` 的檔案**，那份是 BRAT 從 GitHub Release 裝的，改了下次更新就會被覆蓋，git 也看不到。
- 自動展開的 hook：`~/.claude/hooks/obsidian-hover-wake.sh` 是指向本 repo `hooks/claude-code-wake.sh` 的 symlink，改 repo 裡的檔案就會生效。

## 修改流程
1. 在 repo 裡改 `main.js`／`styles.css`／`hooks/`
2. 測試：`./dev-install.sh`（預設裝進 Skills 並重新載入），用 `obsidian vault="Skills" eval code="..."` 驗證
3. **每完成一個小改動就提交一次**，commit 訊息寫清楚「改了什麼、為什麼」，失敗的做法也要提交並說明為什麼放棄
4. 在 `CHANGELOG.md` 最上面加 `## <新版本號> (日期)`，寫給使用者看的變更說明
5. 發版：`./release.sh <新版本號>`。腳本會檢查 CHANGELOG 和未提交的改動，不通過就拒絕發版
6. 其他 vault：BRAT 會在 Obsidian 下次啟動時自動更新；要立刻更新可以用
   `obsidian vault="<vault>" eval code="app.plugins.plugins['obsidian42-brat'].betaPlugins.updatePlugin('frankkccgit/hover-terminal',false,false,false)"`

## 測試安全規則（踩過的坑）
- **不要在 Frank 開著 Claude session 的終端機旁邊做會開檔案、關分頁、重載終端機外掛的測試**。開檔案可能蓋掉終端機分頁，該 session 就會結束（2026-11-10 真的發生過）。測試前先確認所有終端機都已釘選，只對自己開的測試視窗動手，測完只關自己開的那個。
- 重載 `terminal` 外掛會關掉所有終端機，絕對不要做。重載 `hover-terminal` 本身沒問題。

## 依賴其他外掛的地方（壞掉時先看這裡）
- Hover Editor 的 DOM 選擇器全在 `main.js` 開頭的 `HE` 物件；另外用到 `spawnPopover()`
- Terminal 外掛：view type `terminal:terminal`、`settings.value.profiles`、分頁標題會跟著 OSC 0 視窗標題變
- 「Hover Terminal: Diagnose」指令會逐項檢查以上依賴
