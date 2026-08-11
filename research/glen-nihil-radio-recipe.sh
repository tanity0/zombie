#!/bin/bash
# グレンの「お墓技」(虚無の三唱)SE — 壊れたラジオ加工。
# 使い方: ./radio.sh <tempo> <出力パス>
#   tempo … 1.0=原速。社長指示「もう少しテンポ早く」。
# 加工の中身(順に):
#   1) atempo            … テンポ上げ(音程は変えない)
#   2) 1.15kHzを+6dB     … 安物スピーカーのコーンの鳴き(ラジオらしさの芯)
#   3) asoftclip         … 歪み(音が割れているラジオ)
#   4) tremolo×2         … 0.37Hzと1.7Hzの重ね掛け=周期が噛み合わないので
#                          「電波が入ったり切れたりする」不規則な揺れになる
#   5) vibrato           … 微妙な音程のふらつき(同調がズレた感じ)
#   6) aecho             … 小さい箱鳴り
#   7) ヒス+パチパチ     … ピンクノイズの砂嵐 + ホワイトノイズを深いゲートに通した放電音
#   8) ★最後に一括で帯域制限 … highpass420(低音を全部落とす=小型スピーカー)
#                          + lowpass2200×4(高音を落とす=籠り)。
#      ※ノイズを混ぜた**後**に掛けるのが肝。先に掛けるとノイズだけ帯域外に出て
#        「籠らせたはずが逆に明るくなる」(この加工で実際に一度踏んだ)。
set -e
SRC="/root/.claude/uploads/cf6fb9c6-9726-5e51-916f-149ace8787c1/3bbb35f0-My_Song_3.m4a"
TEMPO="${1:-1.12}"
OUT="${2:-out.mp3}"
DUR=$(python3 -c "print(round(17.531/$TEMPO, 2))")
FADE=$(python3 -c "print(round($DUR-0.12, 2))")
ffmpeg -v error -y -i "$SRC" \
 -f lavfi -t "$DUR" -i "anoisesrc=color=pink:amplitude=0.9:r=44100" \
 -f lavfi -t "$DUR" -i "anoisesrc=color=white:amplitude=1:r=44100" \
 -filter_complex "\
[0:a]aformat=channel_layouts=mono,atempo=${TEMPO},\
equalizer=f=1150:width_type=o:width=1.4:g=6,\
volume=6dB,asoftclip=type=tanh:threshold=0.35,\
tremolo=f=0.37:d=0.45,tremolo=f=1.7:d=0.18,\
vibrato=f=5.5:d=0.10,\
aecho=0.85:0.6:35:0.20,volume=1.4[voice];\
[1:a]aformat=channel_layouts=mono,volume=-26dB[hiss];\
[2:a]aformat=channel_layouts=mono,agate=threshold=0.55:ratio=9000:attack=1:release=40,volume=-17dB[crackle];\
[voice][hiss][crackle]amix=inputs=3:duration=first:dropout_transition=0:normalize=0,\
highpass=f=420,highpass=f=420,\
lowpass=f=2200,lowpass=f=2200,lowpass=f=2200,lowpass=f=2200,\
alimiter=limit=0.93,volume=5dB,\
afade=t=in:st=0:d=0.05,afade=t=out:st=${FADE}:d=0.12[out]" \
 -map "[out]" -ac 1 -ar 44100 -b:a 96k "$OUT"
echo "$OUT ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")s)"
