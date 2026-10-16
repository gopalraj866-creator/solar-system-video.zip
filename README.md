# Solar System Explorer — 8-minute cinematic 3D video (Three.js → GitHub Actions)

A realistic 3D Solar System made with **Three.js + WebGL**, rendered to a **1080p or 4K MP4 (8:00, 30 fps)** on **GitHub Actions**
— no GPU or PC needed. Built for *Technical Talk India*.

## What's in the video
| Time | Scene |
|---|---|
| 0:00 | Title + wide view of the whole system with orbit rings and labelled planets (AU distances) |
| 0:20 | The Sun — animated plasma surface, sunspots, flaring limb, corona and bloom |
| 0:55 – 2:05 | Mercury · Venus · Earth (clouds, atmosphere) → fly across to **the Moon** |
| 2:05 | Mars |
| 2:25 | **Asteroid belt** — camera flies through 4,500 rocks + dust, heading for Jupiter |
| 2:55 | **Jupiter** with the Galilean moons → close pass of **Io** |
| 3:50 | **Saturn** with ring system (Cassini division) → **Titan** |
| 4:50 | Uranus · Neptune |
| 5:40 | Pull-back: **scale view** of the whole system, then a slow orbit and outro |

Always on screen: badge (top-left), planet name + type + **orbital speed / distance from Sun / year length** (bottom-left),
a rotating "Did you know?" fact panel (top-right) and a permanent **NOT TO SCALE** notice (bottom-right).
Facts, speeds and distances are real values; sizes/distances in the 3D scene are compressed so every planet is visible,
and planet spin plus the moons' orbits are sped up. Time runs at 1 s ≈ 6 days (1 Earth year = 60 s).

## Render it on GitHub Actions (≈ 5 minutes of setup)
1. Create a new GitHub repository (public is best — Actions minutes are free) and upload everything in this folder.
2. Open **Actions → "Render Solar System video" → Run workflow** and choose:
   * **resolution**: `1080p` or `4k`
   * **fps**: 30 (or 24)
   * **quick_test**: tick this the first time — it renders a 15-second sample with one job to check everything works.
   * **textures**: real planet textures (Solar System Scope, CC BY 4.0). If the download is blocked the video falls back to procedural textures.
   * **badge_text**: e.g. `LIVE • SOLAR SYSTEM EXPLORER`. Default is `SOLAR SYSTEM EXPLORER`, because a pre-rendered video isn't live.
   * **publish_release**: also attach the MP4 to a GitHub Release (handy for big 4K files).
3. When the run finishes, download **`solar-system-1080p`** (or `-4k`) from the run's *Artifacts* section (kept 14 days).

How it works: the 8-minute timeline is split into N chunks (20 for 1080p, 48 for 4K, adjustable) that render **in parallel** as a job matrix.
Every frame is a pure function of its timestamp, so chunks are independent; they are then joined losslessly and the soundtrack is added.
If one chunk fails, use *Re-run failed jobs*.

### Time and cost (measured here on 2 CPU cores with software WebGL — real runners are similar or faster)
| | per frame | total CPU time | default chunks | wall-clock (≈) |
|---|---|---|---|---|
| 1080p, 30 fps (14,400 frames) | ~2–4 s | ~10–15 h | 20 | ~40–60 min |
| 4K, 30 fps | ~8–12 s | ~35–50 h | 48 | ~2–3 h |

Public repositories: free. Private repositories: 1080p fits inside the 2,000 free minutes/month; 4K does not.
GitHub runners have no GPU, so Chromium renders WebGL on the CPU (SwiftShader) — that's why it takes a while.

## Audio
A calm ambient "deep space" soundtrack is **synthesised by ffmpeg** (no copyright issues). To use your own music put it at
`assets/music.mp3` (or `.wav`/`.m4a`) before running — it will be looped/trimmed to 8:00 with fades.

## Run on your own computer
```bash
npm install
npx playwright install chromium            # needs ffmpeg installed too
npm run textures                           # optional: real textures (npm run textures:4k for 4K)
npm run preview                            # still frames -> ./preview  (fast sanity check)
node render.mjs --res 1080 --chunks 1 --out out/solar-1080.mp4     # full silent video
node render.mjs --res 4k   --start 85 --end 100 --out out/sample.mp4   # just a 15 s sample
node render.mjs --res 1080 --gpu ...       # use your GPU instead of software WebGL (much faster)
```
`render.mjs` options: `--res 480|720|1080|4k` · `--fps` · `--chunk i --chunks n` · `--start/--end` (seconds) · `--out` ·
`--png 10,60,...` (stills) · `--badge "TEXT"` · `--bloom 0..2` · `--crf` · `--preset` · `--gpu`.

**Live view / OBS:** `npm run live`, then open the printed URL in a 1920×1080 window (or an OBS *Browser Source* 1920×1080).
It plays the same 8-minute tour in a loop in real time — also usable for your 24/7 live stream.

## Customise
* `public/js/director.js` — the shot list (`SHOTS`): timings, camera paths, which planet each shot follows.
* `public/js/info.js` — all on-screen names, stats and facts.
* `public/js/sim.js` — orbital distances/periods, sizes, moons, time scale.
* `public/js/scene.js` / `public/index.html` — look of the Sun, atmospheres, overlay layout and fonts.

## Honest notes
* Not rendered: cast shadows (eclipses, ring shadow on Saturn) — lighting is a single Sun light with a day/night terminator and atmosphere glow.
* Moons modelled: Earth's Moon, Io, Europa, Ganymede, Callisto, Enceladus, Rhea and Titan. The other 400+ known moons are not shown.
* Moons other than Earth's Moon use procedural textures (no free high-res maps are downloaded for them).
* Textures: Solar System Scope, CC BY 4.0 — the video shows "Textures: Solar System Scope · CC BY 4.0" when they are used; keep it in your description too.
