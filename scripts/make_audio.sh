#!/usr/bin/env bash
# Generates an 8:00 ambient "deep space" soundtrack (pure ffmpeg synthesis, no downloads, no copyright issues).
# If assets/music.mp3 (or .wav/.m4a) exists it is used instead (looped/trimmed to length, with fades).
# usage: scripts/make_audio.sh out.m4a [duration_seconds]
set -euo pipefail
OUT="${1:-out/audio.m4a}"; DUR="${2:-480}"
cd "$(dirname "$0")/.."
mkdir -p "$(dirname "$OUT")"
FADE_OUT_START=$(( DUR > 12 ? DUR-6 : 0 ))
for f in assets/music.mp3 assets/music.wav assets/music.m4a; do
  if [ -f "$f" ]; then
    echo "Using your music: $f"
    ffmpeg -y -loglevel error -stream_loop -1 -i "$f" -t "$DUR" -af "afade=t=in:d=3,afade=t=out:st=${FADE_OUT_START}:d=6,loudnorm=I=-20:TP=-2" -c:a aac -b:a 192k "$OUT"
    exit 0
  fi
done
echo "Synthesising ambient space soundtrack (${DUR}s)..."
# slowly breathing chord pad (A1, E2, A2, C#3, E3, B3 + detuned L/R) + low rumble + airy filtered noise
PAD_L="0.17*sin(2*PI*55*t)*(0.65+0.35*sin(2*PI*0.031*t))+0.12*sin(2*PI*82.41*t+1)*(0.6+0.4*sin(2*PI*0.043*t+2))+0.09*sin(2*PI*110*t)*(0.55+0.45*sin(2*PI*0.027*t+4))+0.06*sin(2*PI*138.59*t+2)*(0.5+0.5*sin(2*PI*0.051*t+1))+0.05*sin(2*PI*164.81*t)*(0.5+0.5*sin(2*PI*0.037*t+3))+0.03*sin(2*PI*246.94*t+1)*(0.5+0.5*sin(2*PI*0.061*t))"
PAD_R="0.17*sin(2*PI*55.12*t)*(0.65+0.35*sin(2*PI*0.033*t+1))+0.12*sin(2*PI*82.30*t)*(0.6+0.4*sin(2*PI*0.041*t))+0.09*sin(2*PI*110.2*t+2)*(0.55+0.45*sin(2*PI*0.029*t+1))+0.06*sin(2*PI*138.3*t)*(0.5+0.5*sin(2*PI*0.049*t+3))+0.05*sin(2*PI*165.2*t+1)*(0.5+0.5*sin(2*PI*0.039*t))+0.03*sin(2*PI*247.5*t+2)*(0.5+0.5*sin(2*PI*0.059*t+2))"
ffmpeg -y -loglevel error \
  -f lavfi -i "aevalsrc=exprs='${PAD_L}|${PAD_R}':s=44100:d=${DUR}" \
  -f lavfi -i "anoisesrc=color=pink:amplitude=0.5:sample_rate=44100:duration=${DUR}" \
  -filter_complex "[1:a]lowpass=f=700,highpass=f=80,volume='0.05+0.03*sin(2*PI*0.02*t)':eval=frame,aformat=channel_layouts=stereo[n];\
[0:a][n]amix=inputs=2:duration=first:normalize=0,aecho=0.8:0.7:900|1700:0.35|0.25,lowpass=f=5000,\
afade=t=in:d=4,afade=t=out:st=${FADE_OUT_START}:d=6,alimiter=limit=0.9,volume=1.6[a]" \
  -map "[a]" -c:a aac -b:a 192k "$OUT"
echo "Audio written: $OUT"
