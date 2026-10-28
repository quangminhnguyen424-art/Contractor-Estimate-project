# Estimator — AI estimating app for contractors

Phone app (iPhone + Android, one codebase) that turns a job description into a priced estimate, a client quote PDF and a material list. Built with Expo / React Native.

**Status:** Phase 1 working prototype. The AI runs in offline **demo mode** until a Claude API key is connected.

## What it does today

| Area | Features |
|---|---|
| **Setup (first login)** | Company info and WA contractor registration #, pick the work you do (bathroom, kitchen, basement/ADU conversion, flooring, painting, new ADU/DADU, new home; small jobs always on), markup, minimum markup, sales tax, your $/SF by finish level |
| **New estimate** | Pick job type (or let the app guess from your description), describe the job by typing or with the keyboard mic, add photos, client info, Quick ($/SF) or Detailed mode |
| **Smart questions** | Sizes and counts you said are filled in automatically; only the questions that change the price are asked |
| **Detailed estimate** | Built from assemblies (labor + materials per unit), trade-by-trade cost, markup you can adjust, sales tax, purchase quantities rounded to whole boxes/sheets/rolls |
| **Check before sending** | Margin below your minimum, lead-safe (pre-1978), basement egress, panel capacity for 240V circuits, bath fans, smoke/CO detectors, 6/3 wire for 50A range, slab trenching, permits, missing tax rate |
| **"Your price" check** | Compares the estimate's $/SF with your preset and with your own past jobs; flags anything 20%+ off |
| **Client quote** | Branded quote, English or Vietnamese, scope by trade, exclusions, payment schedule, terms, signature lines; shared as a PDF. Never shows cost, labor or markup |
| **Material list** | Grouped by category with quantities and prices; shared as a PDF |
| **My pricing** | Edit $/SF presets, add past jobs (or paste an old quote and the app pulls out type, size and total), and see the $/SF it learned from your jobs |
| **Price book** | Override any labor rate or material price with your own |

All data is stored on the phone. Nothing is sent anywhere unless the Claude backend is turned on.

## Run it on your phone (no app store needed)

1. Install **Expo Go** from the App Store or Google Play.
2. On a computer with Node 20+:
   ```bash
   npm install
   npx expo start
   ```
3. Scan the QR code with your phone camera (iPhone) or the Expo Go app (Android).

## Use it yourself on an iPhone (free)

1. Host the web version on Netlify (free): sign in with GitHub, **Import an existing project**, pick this repo, **Deploy**. `netlify.toml` already has the build settings, and every push redeploys.
2. Open the Netlify link in **Safari** → Share → **Add to Home Screen**.
3. In the app: **Settings → Claude AI**, paste your own key from console.anthropic.com and tap **Save and test key**. The key stays on that device and is never in backups. Set a monthly spending limit in the Anthropic Console.
4. **Settings → Export backup** regularly; data lives on the device. Restore on another device from Settings or on first launch.

## Connect Claude for other users (later)

For an app other contractors use, the shared API key must never go inside the app. A tiny backend is included:

```bash
ANTHROPIC_API_KEY=sk-ant-... node server/index.mjs
EXPO_PUBLIC_AI_URL=http://YOUR-COMPUTER-IP:8787 npx expo start
```

If the backend is unreachable, the app falls back to the offline demo AI.

## Develop

```bash
npm test           # engine tests (includes a real basement ADU job as a "golden job")
npm run typecheck
npx eslint src
```

| Folder | What's in it |
|---|---|
| `src/engine/` | Pure TypeScript estimating engine: catalog (materials, assemblies), job types and questions, estimator, checks, demo AI, quote/PDF HTML. No React — reusable on a server. |
| `src/app/` | Screens (expo-router) |
| `src/store/` | App state and on-phone storage |
| `src/ui/` | Shared UI components |
| `server/` | Optional Claude backend |

## Publishing to the App Store / Google Play

Uses Expo EAS (cloud builds, no Mac required): `npx eas-cli@latest build` then `npx eas-cli@latest submit`. Needs an Apple Developer account ($99/yr) and a Google Play developer account ($25 one-time).

## Roadmap

See the product plan doc. Next up (Phase 2): driving mode (hands-free voice), 3D room scan (LiDAR), photo analysis, walkthrough mode, good/better/best options, photo restyle visualization, change orders, quote follow-ups, estimate vs. actual.
