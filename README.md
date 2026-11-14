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
| **Client quote** | Branded quote in the client’s language (English or Vietnamese, chosen per job), scope by trade, exclusions, payment schedule, terms, signature lines; shared as a PDF. Never shows cost, labor or markup |
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
| `src/engine/` | Pure TypeScript, no React: catalog, job types and questions, estimator, checks, quote/contract HTML, and `job.ts` (what stage a job is at and its next step). Tested with vitest. |
| `src/app/` | Screens (expo-router). One file per screen. |
| `src/store/` | App state and on-phone storage |
| `src/cloud/` | Supabase: login, sync, online signing, support tickets |
| `src/ui/` | Shared components. `kit.tsx` (buttons, fields, lists), `theme.ts` (colors), `Sheet.tsx` (the one bottom sheet), `Composer.tsx` (the one message box), `job/` (the parts of the job page). |
| `src/i18n/` | The app's language: the translator, the list of languages, and the dictionaries. |
| `supabase/` | Database migrations and edge functions |

### How the app is organized

The app follows one line: **say the job → get the price → send the quote → client signs → run the job → get paid.**

- **Tabs:** Home (what needs you today + ask Bidwell), Jobs (every job, one list), **+** (new estimate), Schedule, Me (settings, one page per topic at `/settings?s=…`).
- **One job, one page:** `/job/[id]` shows the stage (Estimate → Sent → Signed → Finished), the one next step, and three views: Overview, Job site, Money. The id is the estimate's id, or the job site's id for a photo-only job; `engine/job.ts` joins the two records.
- **Screens under a job** do one thing each: `estimate/[id]` (private price details), `estimate/[id]/quote`, `sign`, `contract`, `change`, `follow`, `materials`, and `site/[id]/room`, `photo`, `log`, `share`, `money`, `buy`, `cost`.
- **Going back:** screens opened from a tab are pushed on top of the tabs (`router.push`). To return to a tab from deeper in, use `router.dismissTo('/jobs')`, never `router.replace` (that would stack a second copy of the tabs).

### Languages

The app asks for the user's language on first open (`ui/LanguageScreen.tsx`) and the whole interface, Bidwell's answers and the voice follow it. Change it later under Me > Language.

- **Write screens in English.** The app's `Text` component translates what it draws, so screens need no translation keys. Text the user typed (client names, notes) is never translated.
- **After changing any wording, run `node scripts/i18n-extract.mjs`.** It rebuilds `src/i18n/catalog.json`, the list of every sentence the app can show. Then add the new sentences to `src/i18n/vi.json`; `npm test` fails when more than a few are missing.
- **Tiếng Việt is built in** (`vi.json`). Spanish has its first screens built in (`es.json`). Every other language, and the rest of Spanish, is translated by the AI once after login and kept on the phone.
- **Client documents are separate.** Quotes, contracts and invoices are written in the "Client’s language" chosen on each job (English or Vietnamese), not the app's language.

## Publishing to the App Store / Google Play

Uses Expo EAS (cloud builds, no Mac required): `npx eas-cli@latest build` then `npx eas-cli@latest submit`. Needs an Apple Developer account ($99/yr) and a Google Play developer account ($25 one-time).

## Roadmap

See the product plan doc. Next up (Phase 2): driving mode (hands-free voice), 3D room scan (LiDAR), photo analysis, walkthrough mode, good/better/best options, photo restyle visualization, change orders, quote follow-ups, estimate vs. actual.
