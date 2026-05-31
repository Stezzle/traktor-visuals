# Traktor Visuals

Automatically finds and plays YouTube videos synced to whatever 
you're playing in Traktor DJ — with animated split-screen transitions 
as you mix between tracks.

## Demo
![Screenshot](https://github.com/Stezzle/traktor-visuals/blob/main/2026-05-31%2011_44_04-.png?raw=true "Screenshot")

## How it works
Traktor broadcasts track metadata over a local Icecast stream.
This app listens for that, searches YouTube, and displays the 
matched video in a browser with animated transitions.

## Setup

### 1. Traktor
- Open Traktor → Preferences → Broadcasting
- Set Address: 127.0.0.1, Port: 8000, Mount: /, Password: putanythinghere
- Format: Ogg Vorbis, 44100 Hz

### 2. YouTube API Key (free)
1. Go to https://console.cloud.google.com
2. New project → Enable YouTube Data API v3
3. Credentials → Create API Key

### 3. Run
**Option A — Executable (no install needed)**
Download traktor-visuals.exe from Releases, double-click, 
paste your API key when prompted.

**Option B — From source**
\`\`\`
npm install
node server.js
\`\`\`

Then open http://localhost:3000 in your browser and 
click the antenna icon in Traktor's Audio Recorder.

## Tested on
- Traktor Pro 3.11 (Windows)
- Node.js v24

- Six rotating visualiser modes — cycles automatically every 18–32 seconds with a crossfade between them:
Mode - Effect
Bars - The original spring-physics equaliser
Wave - A single undulating sine wave that breathes and shifts frequency over time
Static - Chunky coloured noise pixels, denser in the centre — like VHS interference
Sparkles - Particles shoot outward from the split line into both videos, trail and fade
Rings - Expanding concentric circles spawn along the line at random heights
Helix - Two interweaving DNA-strand sine waves in pink and blue
