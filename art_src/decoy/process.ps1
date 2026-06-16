Add-Type -AssemblyName System.Drawing
$dir = 'C:\Users\tanity\zombie\art_src\decoy'
$outDir = 'C:\Users\tanity\zombie\public\sprites'
$bmp = New-Object System.Drawing.Bitmap("$dir\decoy_sheet.png")
$W = $bmp.Width; $H = $bmp.Height
$rect = New-Object System.Drawing.Rectangle(0,0,$W,$H)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $H)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data); $bmp.Dispose()

$bi = 3*$stride + 3*4
$bgB = $bytes[$bi]; $bgG = $bytes[$bi+1]; $bgR = $bytes[$bi+2]
"BG(R,G,B)=$bgR,$bgG,$bgB  SRC=${W}x${H}"
$T0 = 70.0; $T1 = 130.0
function PixDist($x,$y) {
  $i = $y*$stride + $x*4
  $dr = $bytes[$i+2]-$bgR; $dg = $bytes[$i+1]-$bgG; $db = $bytes[$i]-$bgB
  return [math]::Sqrt($dr*$dr + $dg*$dg + $db*$db)
}
# tight bbox over whole image
$mnX=$W; $mxX=-1; $mnY=$H; $mxY=-1
for($y=0;$y -lt $H;$y++){
  for($x=0;$x -lt $W;$x++){
    if((PixDist $x $y) -gt $T1){
      if($x -lt $mnX){$mnX=$x}; if($x -gt $mxX){$mxX=$x}
      if($y -lt $mnY){$mnY=$y}; if($y -gt $mxY){$mxY=$y}
    }
  }
}
$pad=2
$mnX=[math]::Max(0,$mnX-$pad); $mnY=[math]::Max(0,$mnY-$pad)
$mxX=[math]::Min($W-1,$mxX+$pad); $mxY=[math]::Min($H-1,$mxY+$pad)
$ow=$mxX-$mnX+1; $oh=$mxY-$mnY+1
$out = New-Object System.Drawing.Bitmap($ow,$oh,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for($y=0;$y -lt $oh;$y++){
  for($x=0;$x -lt $ow;$x++){
    $sx=$mnX+$x; $sy=$mnY+$y
    $i=$sy*$stride+$sx*4
    $b=$bytes[$i]; $g=$bytes[$i+1]; $r=$bytes[$i+2]
    $d=PixDist $sx $sy
    if($d -le $T0){ $a=0 } elseif($d -ge $T1){ $a=255 } else { $a=[int](255*(($d-$T0)/($T1-$T0))) }
    $out.SetPixel($x,$y,[System.Drawing.Color]::FromArgb($a,$r,$g,$b))
  }
}
$out.Save((Join-Path $outDir 'decoy.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()
"decoy.png bbox x=$mnX..$mxX y=$mnY..$mxY size=${ow}x${oh}"
