# ═══════════════════════════════════════════
# fetch-lyrics.ps1 — .Music 전체 곡의 Suno 싱크 가사(LRC) 일괄 다운로드
#
# 사전 준비:
#   1) tools\suno.exe 존재 (이미 설치됨)
#   2) 최초 1회 인증:  .\tools\suno.exe auth --login
#      (Chrome/Edge 등에 suno.com 로그인 상태여야 함)
#
# 사용:
#   .\scripts\fetch-lyrics.ps1            # .lrc 없는 곡만
#   .\scripts\fetch-lyrics.ps1 -Force     # 전부 다시 받기
#
# 원리: 각 WAV 의 LIST INFO ICMT 청크에 Suno clip id 가 있어
#       suno timed-lyrics <id> --lrc 로 단어 단위 타임스탬프 가사를 받는다.
# ═══════════════════════════════════════════
param([switch]$Force)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$musicDir = Join-Path $root ".Music"
$sunoBin = Join-Path $root "tools\suno.exe"

if (-not (Test-Path $sunoBin)) { Write-Error "tools\suno.exe 가 없습니다"; exit 1 }
if (-not (Test-Path $musicDir)) { Write-Error ".Music 폴더가 없습니다"; exit 1 }

# WAV LIST INFO ICMT 에서 Suno clip id 추출
function Get-SunoId($path) {
  $fs = [System.IO.File]::OpenRead($path)
  try {
    $br = New-Object System.IO.BinaryReader($fs)
    if ([System.Text.Encoding]::ASCII.GetString($br.ReadBytes(4)) -ne "RIFF") { return $null }
    $null = $br.ReadUInt32()
    if ([System.Text.Encoding]::ASCII.GetString($br.ReadBytes(4)) -ne "WAVE") { return $null }
    while ($fs.Position + 8 -le $fs.Length) {
      $id = [System.Text.Encoding]::ASCII.GetString($br.ReadBytes(4))
      $size = $br.ReadUInt32()
      if ($id -eq "LIST" -and $size -le 65536) {
        $body = $br.ReadBytes($size)
        $text = [System.Text.Encoding]::UTF8.GetString($body)
        if ($text -match "id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})") {
          return $Matches[1]
        }
        if ($size % 2 -eq 1) { $fs.Position += 1 }
      } else {
        $fs.Position += $size + ($size % 2)
      }
    }
    return $null
  } finally { $fs.Close() }
}

$wavs = Get-ChildItem $musicDir -Filter *.wav -Recurse -Depth 1
$ok = 0; $skip = 0; $fail = 0

foreach ($wav in $wavs) {
  $lrcPath = [System.IO.Path]::ChangeExtension($wav.FullName, ".lrc")
  if ((Test-Path $lrcPath) -and -not $Force) {
    Write-Host "⏭  $($wav.BaseName) — 이미 .lrc 있음" -ForegroundColor DarkGray
    $skip++
    continue
  }
  $clipId = Get-SunoId $wav.FullName
  if (-not $clipId) {
    Write-Host "⚠  $($wav.BaseName) — Suno clip id 없음 (Suno 생성곡 아님)" -ForegroundColor Yellow
    $fail++
    continue
  }
  Write-Host "⬇  $($wav.BaseName) ($clipId)" -ForegroundColor Cyan
  $lrc = & $sunoBin timed-lyrics $clipId --lrc 2>$null
  if ($LASTEXITCODE -eq 0 -and $lrc -and ($lrc -join "`n") -match "\[\d{1,2}:\d{2}") {
    [System.IO.File]::WriteAllText($lrcPath, ($lrc -join "`n"), [System.Text.UTF8Encoding]::new($false))
    Write-Host "   ✔ 저장: $([System.IO.Path]::GetFileName($lrcPath))" -ForegroundColor Green
    $ok++
  } else {
    Write-Host "   ✘ 실패 — 인증 필요 시: .\tools\suno.exe auth --login" -ForegroundColor Red
    $fail++
  }
}

Write-Host ""
Write-Host "완료: 성공 $ok · 건너뜀 $skip · 실패 $fail" -ForegroundColor White
