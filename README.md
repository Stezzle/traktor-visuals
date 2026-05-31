# Traktor Visuals

Automatically finds and plays YouTube videos synced to whatever you're playing in Traktor DJ — with animated split-screen transitions as you mix between tracks.

![Screenshot](https://github.com/Stezzle/traktor-visuals/blob/main/2026-05-31%2011_44_04-.png?raw=true "Screenshot")

---

## What it does
 
- Reads the currently playing track from Traktor in real time
- Searches YouTube and plays the best matching music video automatically
- Displays a full-screen visual with **8 different dramatic track announcement animations** (random each song)
- When you mix in a new track, the screen splits — old track on the left, new track on the right
- After 30–60 seconds the new track takes over full screen
- **6 rotating visualiser effects** appear at the split point (bars, wave, static, sparkles, rings, helix)
- Falls back to a generic DJ visual if no YouTube match is found
---
 
## Requirements
 
- **Traktor Pro 2 or 3** (Windows)
- A free **YouTube Data API key** (instructions below — takes 5 minutes)
- A browser (Chrome recommended) open on the same machine
---
 
## Quick Start — Executable (Recommended)
 
No coding required.
 
### Step 1 — Download
Go to the [Releases](../../releases) page and download **traktor-visuals.exe**
 
### Step 2 — Set up Traktor Broadcasting
This tells Traktor to send track info to the app.
 
1. Open Traktor
2. Go to **Preferences** (cog icon, top right)
3. Click **Broadcasting** in the left sidebar
4. Fill in these exact values:
| Field | Value |
|---|---|
| Address | `127.0.0.1` |
| Port | `8000` |
| Mount path | `/` |
| Password | `traktor123` |
| Format | `Ogg Vorbis, 44100 Hz` |
 
5. Click **Apply** and close Preferences
### Step 3 — Get a YouTube API Key (free)
The app needs this to search YouTube. You only do this once.
 
1. Go to [https://console.cloud.google.com](https://console.cloud.google.com) and sign in with a Google account
2. Click **Select a project** (top left) → **New Project** → give it any name → **Create**
3. In the left menu go to **APIs & Services** → **Enable APIs & Services**
4. Search for **YouTube Data API v3** → click it → click **Enable**
5. Go to **APIs & Services** → **Credentials** → **+ Create Credentials** → **API Key**
6. Copy the key that appears — you'll paste it into the app in the next step
### Step 4 — Run
 
1. Double-click **traktor-visuals.exe**
2. A terminal window opens and asks for your YouTube API key — paste it in and press Enter
3. Your key is saved — it won't ask again next time
4. Open **http://localhost:3000** in your browser
5. In Traktor, open the **Audio Recorder** panel (the cassette/tape icon in the top bar)
6. Click the **antenna icon** — it should turn solid and stay on
7. Load a track in Traktor and hit **Play**
The browser page will show a waiting spinner, then the YouTube video appears automatically. 🎉
 
> **Note:** Traktor needs to be actively playing audio for the broadcast connection to stay open. If the antenna icon keeps flashing on and off, make sure a track is playing first, then click it.
 
---
 
## Running from Source
 
If you'd prefer to run the Node.js script directly rather than the exe:
 
**Requirements:** [Node.js](https://nodejs.org) v18 or higher
 
```bash
# Clone the repo
git clone https://github.com/Stezzle/traktor-visuals.git
cd traktor-visuals
 
# Run
node server.js
```
 
Follow Steps 2–7 from the Quick Start above.
 
---
 
## Visualiser Modes
 
Six effects rotate automatically at the split point every 18–32 seconds:
 
| Mode | Effect |
|---|---|
| **Bars** | Spring-physics equaliser bars, grow symmetrically from centre |
| **Wave** | Undulating sine wave that breathes and shifts over time |
| **Static** | Chunky coloured noise, like VHS interference |
| **Sparkles** | Particles shoot outward from the split line into both videos |
| **Rings** | Expanding concentric circles at random heights |
| **Helix** | Two interweaving DNA-strand sine waves in pink and blue |
 
---
 
## Track Announcement Styles
 
Each new track gets a random full-screen entrance animation:
 
**Slam** · **Rush** · **Rise** · **Zoom** · **Flicker** · **Strobe** · **Split** · **Shatter**
 
---
 
## Troubleshooting
 
**The browser page shows "Waiting for Traktor" and nothing happens**
- Make sure the antenna icon in Traktor's Audio Recorder is solid blue (not flashing)
- Make sure a track is playing before clicking the antenna icon
- Check that port 8000 isn't being used by something else
**"This video is unavailable" appears**
- The app automatically tries backup search results — it should recover on its own within a few seconds
**The antenna icon keeps flashing on and off**
- Traktor disconnects if no audio is streaming. Make sure a track is loaded and playing first
**YouTube API errors in the terminal**
- Double check your API key is correct in `config.json`
- Make sure YouTube Data API v3 is enabled in your Google Cloud project
---
 
## Roadmap
 
- [ ] Windows `.exe` release
- [ ] Android TV app (display client over local network)
- [ ] Crossfader sync via MIDI
- [ ] Manual video override / search
---
 
## Notes
 
- Each user needs their own YouTube API key (free tier gives 10,000 searches/day — plenty for a session)
- This is a personal/non-commercial tool
- Tested on Traktor Pro 3.11.1 and Node.js v24 on Windows
---
 
## Contributing
 
Issues and pull requests welcome. If something doesn't work on your setup, open an issue with your Traktor version and what the terminal shows.
