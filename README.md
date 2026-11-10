# SF Bay Sailing Sim — "Windward"

An interactive 3D sailing simulator for San Francisco Bay, built with Three.js. Everything is procedural: no textures or model files.

## Play

**Easiest (Windows, Mac, Linux):** download [`release/Windward.html`](release/Windward.html) and double-click it. It is one self-contained file and opens in Chrome, Edge or Firefox. A computer with a reasonable graphics card is recommended.

**From source:**

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run dev:lan` serves it to other devices on your network, and `npm run build:portable` regenerates `release/Windward.html`.

## Controls

| Key | Action |
| --- | --- |
| A / D or ← / → | Steer |
| W / S or ↑ / ↓ | Sheet in / ease (switches to manual trim) |
| T | Toggle auto-trim |
| C | Cycle camera (chase, orbit, helm, drone) |
| 1–4 | Switch boat |
| R | Reset to last location |
| H | Hide all panels |
| K | Show / hide the controls list |
| M | Sound on/off |
| Space | Pause |
| Drag / scroll | Look around / zoom |

## What's in it

- Four boats: Catalina 27, J/24, Nordic Folkboat and a 40-foot performance cruiser
- Sailing physics: apparent wind, sail trim, heel, leeway, weather helm, grounding, tidal current
- Ocean with wind-driven waves, sun glitter, whitecaps, shore foam, wake and gust patches
- Full day/night cycle, clouds, rain, and a fog bank that rolls in through the Golden Gate
- The Bay: Golden Gate and Bay Bridges, Alcatraz, Angel Island, Treasure Island, the city skyline, Marin and the East Bay, plus other boats, a container ship and channel buoys

The coastline and hills are hand-traced approximations, not survey data.
