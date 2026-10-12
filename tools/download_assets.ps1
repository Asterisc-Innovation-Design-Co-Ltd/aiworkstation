# 下載 Higgsfield 原始素材到 assets-src\（Windows PowerShell）
# 之後在 Git Bash 或 WSL 執行 tools/process_assets.sh 產生網站用素材。
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$failed = @()
Get-Content (Join-Path $PSScriptRoot "assets.txt") | ForEach-Object {
  if ($_.Trim() -eq "") { return }
  $p, $u = $_ -split " ", 2
  New-Item -ItemType Directory -Force -Path (Split-Path $p) | Out-Null
  Write-Host "下載 $p"
  try { Invoke-WebRequest -Uri $u -OutFile $p } catch { $failed += $p }
}
if ($failed.Count -gt 0) {
  Write-Host "以下檔案下載失敗（連結可能已過期）：" -ForegroundColor Red
  $failed | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "完成"
