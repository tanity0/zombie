Add-Type -AssemblyName System.Drawing
$dir = 'C:\Users\tanity\zombie\art_src\shield'
$src = [System.Drawing.Image]::FromFile("$dir\shield_sheet.png")
function Crop($x, $y, $w, $h, $name) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $srcRect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $out = Join-Path $dir $name
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "saved $out"
}
Crop 350 40 320 380 'sheet_TOP.png'
Crop 350 620 320 380 'sheet_BOTTOM.png'
Crop 110 330 300 360 'sheet_LEFT.png'
Crop 680 330 320 360 'sheet_RIGHT.png'
$src.Dispose()
