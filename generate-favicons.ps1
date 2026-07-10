Add-Type -AssemblyName System.Drawing

$base = "c:\Users\iain\OneDrive\Documents\reading-log"

$favicons = @(
  @{ name='favicon';   letter='p' }
  @{ name='favicon-a'; letter='a' }
  @{ name='favicon-b'; letter='b' }
  @{ name='favicon-c'; letter='c' }
  @{ name='favicon-f'; letter='f' }
  @{ name='favicon-l'; letter='l' }
  @{ name='favicon-n'; letter='n' }
  @{ name='favicon-s'; letter='s' }
)

function Make-Png($letter, $size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode    = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  $dark  = [System.Drawing.ColorTranslator]::FromHtml('#33302B')
  $cream = [System.Drawing.ColorTranslator]::FromHtml('#FAF7F2')

  # Outer ring: r=47 of 100 → 94% of size
  $outerD = [int]($size * 0.94)
  $outerO = [int](($size - $outerD) / 2)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($dark)), $outerO, $outerO, $outerD, $outerD)

  # Inner circle: r=40 of 100 → 80% of size
  $innerD = [int]($size * 0.80)
  $innerO = [int](($size - $innerD) / 2)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($cream)), $innerO, $innerO, $innerD, $innerD)

  # Letter centred in a square the size of the inner circle
  $fontSize = [float]($size * 0.50)
  $font = New-Object System.Drawing.Font(
    'Georgia', $fontSize,
    [System.Drawing.FontStyle]::Bold,
    [System.Drawing.GraphicsUnit]::Pixel
  )
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment     = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF([float]0, [float]0, [float]$size, [float]$size)
  $g.DrawString($letter, $font, (New-Object System.Drawing.SolidBrush($dark)), $rect, $sf)

  $g.Dispose()
  return $bmp
}

# Per-letter PNGs at 32x32
foreach ($fav in $favicons) {
  $bmp = Make-Png $fav.letter 32
  $bmp.Save("$base\$($fav.name).png", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "OK $($fav.name).png"
}

# Apple-touch-icon at 180x180 (always p)
$bmp = Make-Png 'p' 180
$bmp.Save("$base\apple-touch-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "OK apple-touch-icon.png"

# Add PNG fallback + apple-touch-icon links to every HTML page
$enc = [System.Text.Encoding]::UTF8
Get-ChildItem "$base\*\index.html" | ForEach-Object {
  $content = [System.IO.File]::ReadAllText($_.FullName, $enc)
  if ($content -match 'type="image/png"') { Write-Host "- skipped $($_.Directory.Name) (already done)"; return }
  if ($content -notmatch 'type="image/svg\+xml"') { return }
  $updated = [System.Text.RegularExpressions.Regex]::Replace(
    $content,
    '<link rel="icon" type="image/svg\+xml" href="(/favicon[^"]*\.svg)">',
    {
      param($m)
      $png = $m.Groups[1].Value -replace '\.svg$', '.png'
      "$($m.Value)`n  <link rel=`"icon`" type=`"image/png`" href=`"$png`">`n  <link rel=`"apple-touch-icon`" href=`"/apple-touch-icon.png`">"
    }
  )
  [System.IO.File]::WriteAllText($_.FullName, $updated, $enc)
  Write-Host "OK $($_.Directory.Name)"
}

Write-Host "`nDone. Commit all .png files and updated HTML."
