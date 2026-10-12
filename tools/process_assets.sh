#!/usr/bin/env bash
# ==========================================================================
# 素材處理（BUILD_PROMPT 第 3 節）— 需要 ffmpeg／ffprobe（含 libwebp、libx264、libvpx-vp9）與 perl
#
# 輸入（tools/download_assets.sh 下載）：
#   assets-src/video/{hero,inflow,lineup,footer-loop}.mp4
#   assets-src/img/{hero,inflow,lineup,footer}.png
# 輸出（網站實際使用、需上傳的素材）：
#   assets/frames/<hero|inflow|lineup>/{desktop,mobile}/0001.webp …   影格序列
#   assets/video/footer-loop-{1920,960}.{mp4,webm}                     頁尾循環影片（無音軌）
#   assets/img/<hero|inflow|lineup|footer>-{1920,960}.webp             靜態圖（poster／備援）
#   assets/img/hero.png                                                Open Graph 分享圖（寬 1200px）
# 並自動更新 index.html 的影格數量與素材版本號（?v=），重做素材後不會讀到舊快取。
#
# 用法：bash tools/process_assets.sh
# 重做某支影片：用新版本覆蓋 assets-src/ 內同一個檔名，再執行一次本腳本。
# ==========================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=assets-src
OUT=assets
SEQS="hero inflow lineup"
STILLS="hero inflow lineup footer"
BUDGET_TOTAL=$((30 * 1024 * 1024))   # 全部素材 < 30 MB
BUDGET_FIRST=$((3 * 1024 * 1024))    # 首屏素材 < 3 MB

# 影格設定階梯：「品質 桌機張數 手機張數」，超過預算就往下一階（先降品質、再降張數）
LADDER=(
  "72 120 60"
  "64 120 60"
  "64 96 48"
  "58 96 48"
  "58 80 40"
  "52 80 40"
  "52 64 32"
)

for cmd in ffmpeg ffprobe perl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "找不到 $cmd，請先安裝" >&2; exit 1; }
done

missing=()
for f in video/hero.mp4 video/inflow.mp4 video/lineup.mp4 video/footer-loop.mp4 \
         img/hero.png img/inflow.png img/lineup.png img/footer.png; do
  [ -f "$SRC/$f" ] || missing+=("$SRC/$f")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "缺少原始素材（請先執行 tools/download_assets.sh）：" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

# 位元組數（macOS／Linux 皆可用）
bytes() { find "$@" -type f -print0 2>/dev/null | xargs -0 cat 2>/dev/null | wc -c | tr -d ' '; }
mb() { awk -v b="$1" 'BEGIN { printf "%.2f MB", b / 1048576 }'; }
count() { find "$1" -type f -name '*.webp' | wc -l | tr -d ' '; }
ff() { ffmpeg -nostdin -hide_banner -loglevel error -y "$@"; }

# ---------- 影格序列 ----------
make_frames() { # name variant width count quality
  local name=$1 variant=$2 width=$3 n=$4 q=$5
  local src="$SRC/video/$name.mp4" dir="$OUT/frames/$name/$variant"
  local dur fps
  dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$src")
  fps=$(awk -v n="$n" -v d="$dur" 'BEGIN { printf "%.6f", n / d }')
  rm -rf "$dir"
  mkdir -p "$dir"
  ff -i "$src" -an \
    -vf "fps=$fps,scale='min($width,iw)':-2:flags=lanczos" \
    -frames:v "$n" -c:v libwebp -quality "$q" -compression_level 6 -preset photo \
    -f image2 "$dir/%04d.webp"
}

# ---------- 頁尾循環影片 ----------
echo "▸ 頁尾影片（H.264 CRF 26 + WebM，移除音軌）"
mkdir -p "$OUT/video"
for w in 1920 960; do
  ff -i "$SRC/video/footer-loop.mp4" -an -vf "scale='min($w,iw)':-2:flags=lanczos" \
    -c:v libx264 -preset slow -crf 26 -profile:v high -pix_fmt yuv420p -movflags +faststart \
    "$OUT/video/footer-loop-$w.mp4"
  ff -i "$SRC/video/footer-loop.mp4" -an -vf "scale='min($w,iw)':-2:flags=lanczos" \
    -c:v libvpx-vp9 -crf 35 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p \
    "$OUT/video/footer-loop-$w.webm"
done

# ---------- 靜態圖 ----------
echo "▸ 靜態圖（WebP 1920／960）"
mkdir -p "$OUT/img"
for name in $STILLS; do
  for w in 1920 960; do
    ff -i "$SRC/img/$name.png" -vf "scale='min($w,iw)':-2:flags=lanczos" \
      -frames:v 1 -c:v libwebp -quality 80 -preset photo -f image2 "$OUT/img/$name-$w.webp"
  done
done
ff -i "$SRC/img/hero.png" -vf "scale='min(1200,iw)':-2:flags=lanczos,format=rgb24" \
  -frames:v 1 -c:v png -pred mixed -f image2 "$OUT/img/hero.png"

# ---------- 影格（超過預算自動降階） ----------
fixed=$(bytes "$OUT/video" "$OUT/img")
for step in "${LADDER[@]}"; do
  read -r q dn mn <<< "$step"
  echo "▸ 影格：品質 $q、桌機 $dn 張（1920px）、手機 $mn 張（960px）"
  for name in $SEQS; do
    make_frames "$name" desktop 1920 "$dn" "$q"
    make_frames "$name" mobile 960 "$mn" "$q"
  done
  total=$((fixed + $(bytes "$OUT/frames")))
  if [ "$total" -le "$BUDGET_TOTAL" ]; then break; fi
  echo "  全部素材 $(mb "$total")，超過 30 MB，降低品質或張數後重做"
done

# ---------- 更新 index.html：影格數量與版本號 ----------
ver=$(date +%s)
json="{\"v\":\"$ver\""
for name in $SEQS; do
  json+=",\"$name\":{\"desktop\":$(count "$OUT/frames/$name/desktop"),\"mobile\":$(count "$OUT/frames/$name/mobile")}"
done
json+="}"
FW_JSON="$json" perl -0pi -e 's{<script id="fw-frames">.*?</script>}{<script id="fw-frames">window.FW_FRAMES=$ENV{FW_JSON};</script>}s' index.html
FW_VER="$ver" perl -pi -e 's{(assets/(?:img|video)/[A-Za-z0-9._/-]+\.(?:webp|png|mp4|webm))(?:\?v=\w+)?}{$1?v=$ENV{FW_VER}}g' index.html assessment.html

# ---------- 回報 ----------
echo
echo "素材大小"
echo "------------------------------------------------------------"
for name in $SEQS; do
  for variant in desktop mobile; do
    dir="$OUT/frames/$name/$variant"
    dim=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$dir/0001.webp")
    printf '%-34s %4s 張  %-10s %s\n' "$dir" "$(count "$dir")" "$dim" "$(mb "$(bytes "$dir")")"
  done
done
for f in "$OUT"/video/* "$OUT"/img/*; do
  printf '%-34s %s\n' "$f" "$(mb "$(bytes "$f")")"
done
echo "------------------------------------------------------------"
total=$(bytes "$OUT/frames" "$OUT/video" "$OUT/img")
printf '%-34s %s\n' "assets/frames" "$(mb "$(bytes "$OUT/frames")")"
printf '%-34s %s\n' "assets/video" "$(mb "$(bytes "$OUT/video")")"
printf '%-34s %s\n' "assets/img" "$(mb "$(bytes "$OUT/img")")"
printf '%-34s %s（目標 < 30 MB）\n' "全部素材" "$(mb "$total")"
for variant in desktop mobile; do
  first=$(bytes index.html css js/sequence.js js/main.js "$OUT/frames/hero/$variant/0001.webp")
  printf '%-34s %s（目標 < 3 MB；另加 GSAP 約 0.11 MB 與 Google Fonts）\n' "首屏（$variant）" "$(mb "$first")"
  [ "$first" -le "$BUDGET_FIRST" ] || echo "  ⚠ 首屏超過 3 MB" >&2
done
[ "$total" -le "$BUDGET_TOTAL" ] || echo "⚠ 已降到最低設定，全部素材仍超過 30 MB" >&2
echo
echo "已更新 index.html：window.FW_FRAMES=$json"
