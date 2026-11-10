#!/bin/zsh
# Claude Code hook (Stop / Notification), part of the hover-terminal Obsidian plugin.
# If this Claude Code session runs inside the Obsidian Terminal plugin and its Hover Editor popover is minimized,
# expand it. Keyboard focus stays where it was. On Notification, the session is also marked "waiting" in the status bar.
#
# How the terminal is identified: a unique window title (OSC 0) is written to this session's tty. The Terminal plugin
# shows it as the tab title, then `obsidian eval` calls the plugin's wake(token, event), which finds the matching leaf.
# All Hover Editor DOM handling lives in the plugin (main.js), not here.
# Requires: Obsidian CLI (Obsidian 1.12+), jq. Log: ~/.claude/hooks/obsidian-hover-wake.log

input=$(cat)
LOG=~/.claude/hooks/obsidian-hover-wake.log
OBS=/Applications/Obsidian.app/Contents/MacOS/obsidian
[ -x $OBS ] || OBS=$(command -v obsidian)

# 1. 只在 Obsidian 裡執行；順便找到 controlling tty（必須在前景做，背景後父程序鏈會斷）
pid=$$ inside=0 tty=""
  while [ -n "$pid" ] && [ "$pid" -gt 1 ]; do
    t=$(ps -o tty= -p $pid | tr -d ' ')
    [ -z "$tty" ] && [ -n "$t" ] && [ "$t" != "??" ] && tty=$t
    cmd=$(ps -o comm= -p $pid)
    [[ "$cmd" == *"Obsidian Helper"* ]] && { inside=1; break; }
    pid=$(ps -o ppid= -p $pid | tr -d ' ')
  done
[ $inside = 1 ] && [ -n "$tty" ] || exit 0

main() {

  # 2. 用 cwd 找出所在的 vault 名稱（比對 obsidian.json 裡登記的 vault 路徑）
  local cwd vault
  cwd=$(print -r -- "$input" | jq -r '.cwd // empty')
  vault=$(jq -r --arg cwd "$cwd" '[.vaults[].path | select(. as $p | $cwd == $p or ($cwd | startswith($p + "/")))] | max_by(length) // empty | split("/") | last' \
    ~/Library/Application\ Support/obsidian/obsidian.json 2>/dev/null)
  [ -n "$vault" ] || { echo "$(date '+%F %T') no-vault cwd=$cwd" >> $LOG; return 0; }

  # 3. 先等 Claude Code 自己更新完標題（Stop 當下它也在改標題，會蓋掉記號），再寫入唯一記號；找不到就重試
  # 4. 在 Obsidian 裡找到該 leaf，若在收合的 popover 中就展開，並把焦點還回去
  sleep 1
  local token result attempt js event
  event=$(print -r -- "$input" | jq -r '.hook_event_name // empty')
  js='(()=>{const p=app.plugins.plugins["hover-terminal"];return p?p.wake("TOKEN","EVENT"):"plugin-missing"})()'
  for attempt in 1 2 3; do
    token="CCWAKE${RANDOM}${RANDOM}"
    printf '\033]0;%s\007' "$token" > /dev/$tty
    sleep 0.4
    result=$($OBS vault="$vault" eval code="${${js//TOKEN/$token}//EVENT/$event}" 2>/dev/null | grep '^=>' | tail -1)
    [[ "$result" == *no-leaf* ]] || break
    sleep 0.6
  done
  result="$result (try $attempt)"

  # 5. 還原標題（Claude Code 之後有動作會再自己更新）
  local sid tpath title
  sid=$(print -r -- "$input" | jq -r '.session_id // empty')
  tpath=$(print -r -- "$input" | jq -r '.transcript_path // empty')
  [ -f "$tpath" ] && title=$(grep '"type":"ai-title"' "$tpath" | grep -F "\"sessionId\":\"$sid\"" | tail -1 | jq -r '.aiTitle // empty')
  printf '\033]0;✳ %s\007' "${title:-Claude Code}" > /dev/$tty

  echo "$(date '+%F %T') $(print -r -- "$input" | jq -r '.hook_event_name') vault=$vault tty=$tty $result" >> $LOG
  tail -n 200 $LOG > $LOG.tmp && mv $LOG.tmp $LOG
}

# 背景執行，不拖慢 Claude Code
main &!
exit 0
