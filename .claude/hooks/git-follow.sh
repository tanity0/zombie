#!/bin/bash
# ★ローカルが origin より後れている時だけ自動で追いつく(実測3回・2026-08-22)。
#
# 何を直すためのものか: このリモート実行環境では、**ローカルの作業ツリーだけが過去のコミットへ
# 巻き戻る**ことがある(コンテナが再起動し、セッション開始時点のスナップショットから再クローン
# されるため)。`git log` から push 済みの分が消え、`git status` はクリーン、`package.json` の
# version も古い版に戻る。リモートには全て無事なので、追いつけば復旧できる。
#
# 掟:
# - **`--ff-only` しか使わない。** 早送りできない時(ローカルが進んでいる/分岐している/
#   未コミットの変更がある)は**何もせず黙って終わる**。破壊的な操作は一切しない。
# - **失敗しても常に exit 0**。この hook がプロンプトの処理を止めてはいけない。
# - 追いついた時だけ1行出す(気づけるように)。何も起きなければ無言。
set -o pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
[ -n "$(git remote 2>/dev/null)" ] || exit 0
b=$(git branch --show-current 2>/dev/null)
[ -n "$b" ] || exit 0
before=$(git rev-parse HEAD 2>/dev/null) || exit 0
git fetch -q origin "$b" >/dev/null 2>&1 || exit 0
git merge --ff-only "origin/$b" >/dev/null 2>&1 || exit 0
after=$(git rev-parse HEAD 2>/dev/null) || exit 0
if [ "$before" != "$after" ]; then
  echo "[git-follow] ローカルが origin より後れていたため追従しました: ${before:0:7} → ${after:0:7}(version: $(node -p "require('./package.json').version" 2>/dev/null))"
fi
exit 0
