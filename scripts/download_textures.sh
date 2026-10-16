#!/usr/bin/env bash
# Downloads planet textures into ./textures (all optional — the renderer falls back to procedural textures).
# Source: Solar System Scope (https://www.solarsystemscope.com/textures/) — licensed CC BY 4.0, attribution is shown in the video.
# usage: scripts/download_textures.sh [2048|4096]     (max texture width; 4096 fetches the 8k originals and downsizes them)
set -uo pipefail
cd "$(dirname "$0")/.."
MAXW="${1:-2048}"
mkdir -p textures
BASE="https://www.solarsystemscope.com/textures/download"
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

is_image() { [ -s "$1" ] && [ "$(wc -c < "$1")" -gt 20000 ] && file -b --mime-type "$1" | grep -q '^image/'; }
fetch() { # fetch <url> <dest>
  curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 20 -m 240 -A "$UA" -o "$2.part" "$1" 2>/dev/null && is_image "$2.part" && mv "$2.part" "$2" && return 0
  rm -f "$2.part"; return 1
}
shrink() { # shrink <file> <maxwidth>   (re-encode as high-quality JPEG no wider than maxwidth)
  local f="$1" w="$2" tmp="$1.tmp.jpg"
  ffmpeg -y -loglevel error -i "$f" -vf "scale='min($w,iw)':-2:flags=lanczos" -q:v 2 "$tmp" && mv "$tmp" "$f"
}
get() { # get <key> <ssc-name> [also try 2k fallback]
  local key="$1" name="$2" dest="textures/$1.jpg"
  [ -s "$dest" ] && { echo "have $key"; return; }
  if [ "$MAXW" -ge 4096 ] && fetch "$BASE/8k_$name.jpg" "$dest"; then shrink "$dest" "$MAXW"; echo "ok   $key (8k → ${MAXW})"; return; fi
  if fetch "$BASE/2k_$name.jpg" "$dest"; then shrink "$dest" 2048; echo "ok   $key (2k)"; return; fi
  echo "MISS $key  → procedural fallback will be used"
}
get mercury      mercury
get venus        venus_surface
get earth        earth_daymap
get earth_clouds earth_clouds
get mars         mars
get jupiter      jupiter
get saturn       saturn
get uranus       uranus
get neptune      neptune
get moon         moon
get milkyway     stars_milky_way
if [ ! -s textures/saturn_ring.png ]; then
  if fetch "$BASE/2k_saturn_ring_alpha.png" textures/saturn_ring.png; then echo "ok   saturn_ring"; else echo "MISS saturn_ring → procedural fallback will be used"; fi
fi
# last-resort mirrors for the two most visible bodies
[ -s textures/moon.jpg ]  || fetch "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg" textures/moon.jpg && echo "ok   moon (three.js mirror)"
[ -s textures/earth.jpg ] || fetch "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg" textures/earth.jpg && echo "ok   earth (three.js mirror)"
echo "Textures present: $(ls textures | grep -cE '\.(jpg|png)$')"
exit 0
