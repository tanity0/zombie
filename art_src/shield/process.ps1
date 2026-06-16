Add-Type -AssemblyName System.Drawing
$dir   = 'C:\Users\tanity\zombie\art_src\shield'
$outDir = 'C:\Users\tanity\zombie\public\sprites'
$srcPath = "$dir\shield_sheet.png"

# Load source pixels (32bpp ARGB)
$bmp = New-Object System.Drawing.Bitmap($srcPath)
$W = $bmp.Width; $H = $bmp.Height
$rect = New-Object System.Drawing.Rectangle(0,0,$W,$H)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $H)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data); $bmp.Dispose()

# Background color sampled at (3,3)
$bi = 3*$stride + 3*4
$bgB = $bytes[$bi]; $bgG = $bytes[$bi+1]; $bgR = $bytes[$bi+2]
"BG(R,G,B)=$bgR,$bgG,$bgB  SRC=${W}x${H}"

$T0 = 70.0   # below => background (alpha 0)
$T1 = 130.0  # above => solid (alpha 255)

function PixDist($x,$y) {
  $i = $y*$stride + $x*4
  $dr = $bytes[$i+2]-$bgR; $dg = $bytes[$i+1]-$bgG; $db = $bytes[$i]-$bgB
  return [math]::Sqrt($dr*$dr + $dg*$dg + $db*$db)
}

# region: x,y,w,h (generous box) ; outName
function Process($rx,$ry,$rw,$rh,$outName) {
  # tight bbox of non-bg within region
  $mnX=$rx+$rw; $mxX=$rx-1; $mnY=$ry+$rh; $mxY=$ry-1
  for($y=$ry;$y -lt ($ry+$rh);$y++){
    for($x=$rx;$x -lt ($rx+$rw);$x++){
      if((PixDist $x $y) -gt $T1){
        if($x -lt $mnX){$mnX=$x}; if($x -gt $mxX){$mxX=$x}
        if($y -lt $mnY){$mnY=$y}; if($y -gt $mxY){$mxY=$y}
      }
    }
  }
  $pad=2
  $mnX=[math]::Max($rx,$mnX-$pad); $mnY=[math]::Max($ry,$mnY-$pad)
  $mxX=[math]::Min($rx+$rw-1,$mxX+$pad); $mxY=[math]::Min($ry+$rh-1,$mxY+$pad)
  $ow=$mxX-$mnX+1; $oh=$mxY-$mnY+1
  $out = New-Object System.Drawing.Bitmap($ow,$oh,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for($y=0;$y -lt $oh;$y++){
    for($x=0;$x -lt $ow;$x++){
      $sx=$mnX+$x; $sy=$mnY+$y
      $i=$sy*$stride+$sx*4
      $b=$bytes[$i]; $g=$bytes[$i+1]; $r=$bytes[$i+2]
      $d=PixDist $sx $sy
      if($d -le $T0){ $a=0 }
      elseif($d -ge $T1){ $a=255 }
      else { $a=[int](255*(($d-$T0)/($T1-$T0))) }
      $col=[System.Drawing.Color]::FromArgb($a,$r,$g,$b)
      $out.SetPixel($x,$y,$col)
    }
  }
  $out.Save((Join-Path $outDir $outName),[System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
  "$outName  bbox x=$mnX..$mxX y=$mnY..$mxY  size=${ow}x${oh}"
}

# Mapping (full reversal):
# sheet TOP -> shield-down ; BOTTOM -> shield-up ; LEFT -> shield-right ; RIGHT -> shield-left
Process 350 40 320 380 'shield-down.png'
Process 350 620 320 380 'shield-up.png'
Process 110 330 300 360 'shield-right.png'
Process 680 330 320 360 'shield-left.png'
