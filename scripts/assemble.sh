#!/usr/bin/env bash
# Joins out/chunk_*.mp4 (lossless stream copy), adds the soundtrack, writes the final MP4.
# usage: scripts/assemble.sh <chunks_dir> <final.mp4> [duration_seconds]
set -euo pipefail
CH="${1:-out}"; FINAL="${2:-out/solar-system.mp4}"; DUR="${3:-480}"
cd "$(dirname "$0")/.."
LIST="$(mktemp)"
for f in $(ls "$CH"/chunk_*.mp4 | sort); do echo "file '$(realpath "$f")'" >> "$LIST"; done
echo "Chunks:"; cat "$LIST"
mkdir -p "$(dirname "$FINAL")"
bash scripts/make_audio.sh "$(dirname "$FINAL")/audio.m4a" "$DUR"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -i "$(dirname "$FINAL")/audio.m4a" -map 0:v -map 1:a -c:v copy -c:a copy -shortest -movflags +faststart "$FINAL"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration -show_entries format=duration,size -of default=nw=1 "$FINAL"
