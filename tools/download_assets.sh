#!/usr/bin/env bash
# 下載 Higgsfield 原始素材到 assets-src/（macOS / Linux）
# 之後執行 tools/process_assets.sh 產生網站用的影格、影片與靜態圖。
set -euo pipefail
cd "$(dirname "$0")/.."
failed=()
while read -r path url; do
  [ -z "${path:-}" ] && continue
  mkdir -p "$(dirname "$path")"
  echo "下載 $path"
  if ! curl -fL --retry 3 -o "$path.part" "$url"; then
    rm -f "$path.part"
    failed+=("$path")
    continue
  fi
  mv "$path.part" "$path"
done < tools/assets.txt
if [ ${#failed[@]} -gt 0 ]; then
  echo "以下檔案下載失敗（連結可能已過期）：" >&2
  printf '  %s\n' "${failed[@]}" >&2
  exit 1
fi
echo "完成"
