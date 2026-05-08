#!/bin/bash
# map-simplifier を launchd 常駐用にローカルへデプロイする。
#
# 流れ:
#   1. (必要なら) pnpm build を流して dist/ を更新
#   2. dist/ を ~/.local/share/map-simplifier/dist/ へ rsync
#   3. plist を heredoc で生成して ~/Library/LaunchAgents/ へ書き出す
#   4. ユーザーに launchctl 操作のコマンドを案内
#
# 使い方:
#   bash scripts/launchd/deploy.sh           # 既存の dist/ をそのまま使う
#   bash scripts/launchd/deploy.sh --build   # 先に pnpm build を流す
#
# 設計の前提は ~/.claude/references/launchd-service-guide.md 参照。
# Dropbox CloudStorage 配下のソースを launchd から直接実行できないため、
# build 結果だけをローカル (~/.local/share/...) に置いて serve する。
#
# plist には環境固有のフルパス (/Users/<user>/...) が必須なので、
# リポジトリには plist 実体は置かず、本スクリプトが $HOME 込みで生成する。

set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DEST_DIR="$HOME/.local/share/map-simplifier"
PLIST_LABEL="com.inuro.map-simplifier"
PLIST_DEST="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

if [ "${1:-}" = "--build" ]; then
    echo "==> pnpm build"
    (cd "$SRC_DIR" && pnpm build)
fi

if [ ! -d "$SRC_DIR/dist" ]; then
    echo "ERROR: $SRC_DIR/dist がありません。'pnpm build' を先に流すか、--build を付けて実行してください。" >&2
    exit 1
fi

echo "==> rsync dist -> $DEST_DIR/dist"
mkdir -p "$DEST_DIR/dist"
rsync -a --delete "$SRC_DIR/dist/" "$DEST_DIR/dist/"

echo "==> generate plist -> $PLIST_DEST"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST_DEST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>-m</string>
        <string>http.server</string>
        <string>--bind</string>
        <string>127.0.0.1</string>
        <string>5173</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${DEST_DIR}/dist</string>

    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>StandardOutPath</key>
    <string>/tmp/map-simplifier-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/map-simplifier-stderr.log</string>
</dict>
</plist>
EOF

cat <<EOF

Deploy 完了。

  dist 配置:   $DEST_DIR/dist
  plist 配置:  $PLIST_DEST

初回登録 / 更新後の再起動:
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  launchctl load "$PLIST_DEST"

確認:
  launchctl list | grep $PLIST_LABEL
  curl -I http://127.0.0.1:5173/
  tail -n 50 /tmp/map-simplifier-stderr.log

停止:
  launchctl unload "$PLIST_DEST"

開発時に pnpm dev を使う場合は、先に上記 unload で 5173 を空けるか、
'pnpm dev --port 5174' のように別ポートで起動する。
EOF
