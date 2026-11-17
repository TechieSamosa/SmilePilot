# SmilePilot — app

React + TypeScript app for **Android** (Capacitor APK) and **iPhone** (installable web app / PWA, or Xcode project).
One codebase, one **build per clinic** (`src/preset.ts` + `brands/<clinic>/`).

| Build | For | Look | Ships as |
|---|---|---|---|
| `sowmya` | Dr. Sowmya B. — general dentistry | SmilePilot, teal | Android APK |
| `abhidnya` | Dr. Abhidnya Yeole — Brace Place Orthodontics, Pune | Brace Place, lavender & white, DM Sans | iPhone web app (GitHub Pages) / iOS project |

## Features

| Area | What it does |
|---|---|
| Patients & visits | Records, allergy/medical alerts, call/WhatsApp, notes with quick chips, auto-save |
| Tooth chart | Anatomical FDI chart (permanent + primary) with conditions drawn on each tooth; add treatments with fees |
| **Orthodontics** (on for Brace Place, toggle in Settings for anyone) | Braces/aligner/functional/retention tracking, aligner number & change schedule, "aligner changes due" list with WhatsApp reminders (English/Hindi/Marathi), ortho exam (Angle class, overjet, overbite, crowding, crossbite, midline, profile, habits), today's ortho procedure, ortho procedures & fees, braces/aligner/retainer care sheets, progress photos & cephalograms |
| X-ray AI (on-device, free) | YOLOv8 pathology detector (14 findings) + FDI tooth numbering. Android: native ONNX Runtime plugin (~1–2 s), with automatic WebAssembly fallback; iPhone/web: onnxruntime-web in a Web Worker |
| Human-in-the-loop | Confirm / reject / relabel / redraw / add missed findings; per-class thresholds learned from her reviews; accuracy dashboard; export verified YOLO dataset for fine-tuning; import improved models in Settings |
| Offline writing (free) | Case record and patient WhatsApp message (English, Hindi, Marathi) built only from what the dentist entered — nothing invented |
| Prescriptions | Indian dental formulary, templates (incl. ortho soreness/ulcer sets), offline safety rules (allergy, pregnancy, asthma, NSAID/anticoagulant, paediatric…), PDF |
| Billing & appointments | Fees remembered, balance, invoice PDF; bookings with WhatsApp confirmation, Android reminders, iPhone calendar (.ics) |
| **Pro AI agent** (optional, dentist's own Claude key) | Clinical chat; tools to search patients, read records, list appointments, clinic summary, aligner changes due, book appointments and update aligners (always asks to confirm), prepare WhatsApp messages; X-ray second opinion; Rx check; prose reports in any language. Learns from 👍/👎 and edits |
| Data & privacy | Everything on the phone (IndexedDB), PIN lock, backup/restore .zip, no server, no account |

## Architecture

```
src/
  preset.ts                 per-clinic profile, theme (light + dark), specialty
  db.ts                     Dexie (IndexedDB) schema
  lib/ai/detector.ts        letterbox → inference (native or worker) → NMS → tooth assignment
  lib/ai/inference.worker.ts onnxruntime-web (WASM): iPhone/web, Android fallback
  lib/ai/calibration.ts     human-in-the-loop threshold learning + accuracy stats
  lib/ai/dataset.ts         verified-annotation export (YOLO format)
  lib/ai/claude.ts          Claude API (@anthropic-ai/sdk in browser mode, dentist's own key)
  lib/ai/agent.ts           Pro AI agent: tool definitions + confirm-before-write loop
  lib/offline.ts            offline case record & patient messages (EN/HI/MR)
  lib/ortho.ts              aligner schedule, progress, reminders, ortho vocab
  lib/drugs.ts              formulary, templates, care sheets, offline Rx safety rules
  lib/pdf.ts                prescription / invoice / annotated X-ray report PDFs
  screens/, components/     UI
brands/<clinic>/            icons, favicon, web manifest (generated)
public/models/              pathology.onnx/.json, teeth.onnx/.json (fp16-stored weights)
public/sw.js                offline cache + cross-origin isolation for multi-core WASM
android/…/NativeOnnxPlugin.java + OrtRunner.java
                            native ONNX Runtime; crash-loop guard; ORT telemetry provider removed
ios/                        Xcode project (Swift Package Manager, no CocoaPods)
```

## Commands

```bash
npm install
npm run dev               # SmilePilot (teal) in the browser
npm run dev:braceplace    # Brace Place (lavender)
npm run icons             # regenerate all brand icons (Android = sowmya, iOS = abhidnya)
npm run build:braceplace  # iPhone web app → dist/ (deployed by .github/workflows/pages.yml)
npm run android:apk       # Sowmya's signed APK → release/SmilePilot-<version>.apk
npm run ios:sync          # Brace Place → Xcode project (then open ios/App on a Mac)
```

**Android signing**: release key at `~/.dentalos/` (`dentalos-release.jks` + `keystore.properties`) — back it up; every
update must use the same key. Requires JDK 21 + Android SDK 36.

**iPhone**: open the GitHub Pages URL in Safari → Share → Add to Home Screen. Native build: Mac + Xcode 16,
`npm run ios:sync && npx cap open ios`, choose a signing team.

**Testing a release build on a device**: `DENTALOS_DEBUG_WEBVIEW=1 npx cap sync android` enables WebView debugging — never ship with it.
