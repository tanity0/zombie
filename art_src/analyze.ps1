Add-Type -AssemblyName System.Drawing

function Get-Bytes($path) {
  $bmp = New-Object System.Drawing.Bitmap($path)
  $w = $bmp.Width; $h = $bmp.Height
  $rect = New-Object System.Drawing.Rectangle(0,0,$w,$h)
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $h)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $bmp.UnlockBits($data)
  $bmp.Dispose()
  return @{ w=$w; h=$h; stride=$stride; bytes=$bytes }
}

# --- existing sprite: alpha bbox ---
$ex = Get-Bytes 'C:\Users\tanity\zombie\public\sprites\player-striker-walk-0.png'
$minX=$ex.w; $maxX=-1; $minY=$ex.h; $maxY=-1
for($y=0;$y -lt $ex.h;$y++){
  $row=$y*$ex.stride
  for($x=0;$x -lt $ex.w;$x++){
    $a=$ex.bytes[$row+$x*4+3]
    if($a -gt 16){ if($x -lt $minX){$minX=$x}; if($x -gt $maxX){$maxX=$x}; if($y -lt $minY){$minY=$y}; if($y -gt $maxY){$maxY=$y} }
  }
}
"EXISTING 128x108 bbox: x=$minX..$maxX (w=$($maxX-$minX+1)) y=$minY..$maxY (h=$($maxY-$minY+1)) bottomMargin=$(107-$maxY) headCenterApprox=$([int](($minX+$maxX)/2))"

# --- source image ---
$src = Get-Bytes 'C:\Users\tanity\Pictures\ChatGPT Image 2026年6月11日 22_35_02.png'
# bg sample at (3,3)
$br=$src.bytes[3*$src.stride+3*4+2]; $bgG=$src.bytes[3*$src.stride+3*4+1]; $bgB=$src.bytes[3*$src.stride+3*4+0]
"SRC $($src.w)x$($src.h) bg(R,G,B)=$br,$bgG,$bgB"

# per-column non-bg count (tolerance on bg distance)
$T=90
$colCount = New-Object int[] $src.w
for($y=0;$y -lt $src.h;$y++){
  $row=$y*$src.stride
  for($x=0;$x -lt $src.w;$x++){
    $i=$row+$x*4
    $b=$src.bytes[$i]; $g=$src.bytes[$i+1]; $r=$src.bytes[$i+2]
    $dr=$r-$br; $dg=$g-$bgG; $db=$b-$bgB
    $d=[math]::Sqrt($dr*$dr+$dg*$dg+$db*$db)
    if($d -gt $T){ $colCount[$x] = $colCount[$x] + 1 }
  }
}
# find segments where colCount>threshold
$seg=@(); $inSeg=$false; $s0=0
$thr=4
for($x=0;$x -lt $src.w;$x++){
  if($colCount[$x] -gt $thr -and -not $inSeg){ $inSeg=$true; $s0=$x }
  elseif($colCount[$x] -le $thr -and $inSeg){ $inSeg=$false; $seg += ,@($s0,$x-1) }
}
if($inSeg){ $seg += ,@($s0,$src.w-1) }
"SEGMENTS(count=$($seg.Count)): " + (($seg | ForEach-Object { "$($_[0])-$($_[1])" }) -join '  ')

# for each segment compute bbox + head center (top 25% rows centroid)
foreach($s in $seg){
  $x0=$s[0]; $x1=$s[1]
  $mnX=$x1; $mxX=$x0; $mnY=$src.h; $mxY=-1
  for($y=0;$y -lt $src.h;$y++){
    $row=$y*$src.stride
    for($x=$x0;$x -le $x1;$x++){
      $i=$row+$x*4
      $b=$src.bytes[$i]; $g=$src.bytes[$i+1]; $r=$src.bytes[$i+2]
      $dr=$r-$br; $dg=$g-$bgG; $db=$b-$bgB
      if([math]::Sqrt($dr*$dr+$dg*$dg+$db*$db) -gt $T){ if($x -lt $mnX){$mnX=$x}; if($x -gt $mxX){$mxX=$x}; if($y -lt $mnY){$mnY=$y}; if($y -gt $mxY){$mxY=$y} }
    }
  }
  # head center: centroid x over top 28% of figure height
  $hCut=$mnY + [int](($mxY-$mnY)*0.28)
  $sumX=0; $cnt=0
  for($y=$mnY;$y -le $hCut;$y++){
    $row=$y*$src.stride
    for($x=$mnX;$x -le $mxX;$x++){
      $i=$row+$x*4
      $b=$src.bytes[$i]; $g=$src.bytes[$i+1]; $r=$src.bytes[$i+2]
      $dr=$r-$br; $dg=$g-$bgG; $db=$b-$bgB
      if([math]::Sqrt($dr*$dr+$dg*$dg+$db*$db) -gt $T){ $sumX+=$x; $cnt++ }
    }
  }
  $headC = if($cnt -gt 0){ [int]($sumX/$cnt) } else { [int](($mnX+$mxX)/2) }
  "FIG bbox x=$mnX..$mxX (w=$($mxX-$mnX+1)) y=$mnY..$mxY (h=$($mxY-$mnY+1)) headCenterX=$headC"
}
