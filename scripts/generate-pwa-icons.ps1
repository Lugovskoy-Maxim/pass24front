# Generate PWA/favicon PNGs (any + maskable) from public/favicon.ico
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$public = (Resolve-Path (Join-Path $PSScriptRoot '..\frontend\public')).Path
$icoPath = Join-Path $public 'favicon.ico'
$iconsDir = Join-Path $public 'icons'

Write-Host "Source: $icoPath"
Write-Host "Out dir: $iconsDir"

$bytes = [System.IO.File]::ReadAllBytes($icoPath)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$br = New-Object System.IO.BinaryReader($ms)
$null = $br.ReadUInt16() # reserved
$type = $br.ReadUInt16()
$count = $br.ReadUInt16()
Write-Host "ICO type=$type count=$count"

$entries = @()
for ($i = 0; $i -lt $count; $i++) {
  $w = $br.ReadByte()
  $h = $br.ReadByte()
  $null = $br.ReadByte() # colors
  $null = $br.ReadByte() # reserved
  $null = $br.ReadUInt16() # planes
  $bpp = $br.ReadUInt16()
  $size = $br.ReadUInt32()
  $offset = $br.ReadUInt32()
  $ww = if ($w -eq 0) { 256 } else { $w }
  $hh = if ($h -eq 0) { 256 } else { $h }
  Write-Host ("  entry {0}: {1}x{2} bpp={3} size={4} offset={5}" -f $i, $ww, $hh, $bpp, $size, $offset)
  $entries += [pscustomobject]@{ W = $ww; H = $hh; Size = [int]$size; Offset = [int]$offset }
}
$br.Close()
$ms.Close()

$largest = $entries | Sort-Object W -Descending | Select-Object -First 1
Write-Host ("Using largest frame: {0}x{1}" -f $largest.W, $largest.H)

$frame = New-Object byte[] $largest.Size
[Array]::Copy($bytes, $largest.Offset, $frame, 0, $largest.Size)

$isPng = ($frame.Length -ge 8 -and $frame[0] -eq 0x89 -and $frame[1] -eq 0x50 -and $frame[2] -eq 0x4E -and $frame[3] -eq 0x47)
$srcMs = $null

if ($isPng) {
  Write-Host "Frame is embedded PNG"
  $srcMs = New-Object System.IO.MemoryStream(,$frame)
  $src = [System.Drawing.Image]::FromStream($srcMs)
} else {
  Write-Host "Frame is BMP/DIB - loading via Icon"
  $icon = New-Object System.Drawing.Icon($icoPath, $largest.W, $largest.H)
  $src = $icon.ToBitmap()
  $icon.Dispose()
}

Write-Host ("Source image: {0}x{1} {2}" -f $src.Width, $src.Height, $src.PixelFormat)

function Save-Png {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size,
    [string]$Path
  )
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($Image, 0, 0, $Size, $Size)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("Wrote {0} ({1}x{1})" -f $Path, $Size)
}

function Save-Maskable {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size,
    [System.Drawing.Color]$Bg,
    [string]$Path
  )
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear($Bg)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  # Safe zone ~80%: 10% padding on each side
  $pad = [int]([math]::Round($Size * 0.1))
  $draw = $Size - (2 * $pad)
  $g.DrawImage($Image, $pad, $pad, $draw, $draw)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("Wrote {0} (maskable {1}x{1})" -f $Path, $Size)
}

if (-not (Test-Path $iconsDir)) {
  New-Item -ItemType Directory -Path $iconsDir | Out-Null
}

Save-Png -Image $src -Size 32 -Path (Join-Path $iconsDir 'favicon-32.png')
Save-Png -Image $src -Size 180 -Path (Join-Path $iconsDir 'apple-touch-icon.png')
Save-Png -Image $src -Size 192 -Path (Join-Path $iconsDir 'icon-192.png')
Save-Png -Image $src -Size 512 -Path (Join-Path $iconsDir 'icon-512.png')

# Sample background from near-edge of icon (fallback #393737 from source)
$probe = New-Object System.Drawing.Bitmap($src)
$mid = [int]($src.Width / 2)
$bg = $probe.GetPixel($mid, [int]($src.Height * 0.08))
if ($bg.A -lt 200) { $bg = $probe.GetPixel($mid, [int]($src.Height * 0.15)) }
if ($bg.A -lt 200) { $bg = [System.Drawing.Color]::FromArgb(255, 57, 55, 55) }
$probe.Dispose()
Write-Host ('Maskable BG ARGB={0},{1},{2},{3}' -f $bg.A, $bg.R, $bg.G, $bg.B)

Save-Maskable -Image $src -Size 192 -Bg $bg -Path (Join-Path $iconsDir 'icon-192-maskable.png')
Save-Maskable -Image $src -Size 512 -Bg $bg -Path (Join-Path $iconsDir 'icon-512-maskable.png')

$src.Dispose()
if ($null -ne $srcMs) { $srcMs.Dispose() }

Write-Host "Done."
