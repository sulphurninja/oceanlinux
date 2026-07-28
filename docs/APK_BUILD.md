# OceanLinux — Android APK (Capacitor + PWABuilder)

Your site is a **live web app** (`https://oceanlinux.com`). The Android app is a native shell that opens it full-screen (same idea as [PWABuilder](https://www.pwabuilder.com/) TWA).

---

## Option A — PWABuilder (fastest, no Android Studio)

1. Deploy latest code so icons + manifest are live at `https://oceanlinux.com/site.webmanifest`
2. Open [https://www.pwabuilder.com](https://www.pwabuilder.com)
3. Enter `https://oceanlinux.com` → **Start**
4. Fix any manifest warnings (icons should pass after deploy)
5. **Package For Stores** → **Android** → download **APK** (test) or **AAB** (Play Store)

---

## Option C — Bubblewrap TWA (CLI, optional)

Config template: `android-twa/twa-manifest.json`

```bash
npm install -g @bubblewrap/cli
cd android-twa
bubblewrap init --manifest=https://oceanlinux.com/site.webmanifest
bubblewrap build
```

Signed APK output in `android-twa/app-release-signed.apk`.

---

## Option B — Capacitor in this repo (Android Studio signed APK)

### One-time setup

1. **Node.js 18+** and **Android Studio** ([download](https://developer.android.com/studio))
2. In Android Studio: install **Android SDK**, **SDK Platform 34+**, **Build-Tools**
3. Set environment variables (Windows):

```powershell
# Example — adjust paths to your SDK install
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
```

4. From project root:

```bash
bun install
bun run icons:generate
bun run cap:init
```

`cap:init` adds the `android/` folder (only needed once).

### Regenerate icons (after changing logo)

```bash
# Replace assets/oceanlinux-app-icon-source.png (512×512 PNG), then:
bun run icons:generate
bun run cap:sync
```

### Open in Android Studio

```bash
bun run cap:open:android
```

- Wait for Gradle sync
- **Build → Build Bundle(s) / APK(s) → Build APK(s)** (debug, for testing)
- APK path: `android/app/build/outputs/apk/debug/app-debug.apk`

### Signed release APK / AAB (Play Store)

1. Android Studio → **Build → Generate Signed Bundle / APK**
2. **Android App Bundle** (Play Store) or **APK** (direct install)
3. Create new keystore (save password + `.jks` file safely — **never commit keystore**)
4. Release build → upload AAB to [Google Play Console](https://play.google.com/console)

### Useful scripts

| Script | Purpose |
|--------|---------|
| `bun run icons:generate` | PNG icons → `public/` |
| `bun run cap:sync` | Copy web assets + update Android project |
| `bun run cap:open:android` | Open Android Studio |
| `bun run cap:run:android` | Run on connected device/emulator |

### Local dev against `bun run dev`

Emulator uses `10.0.2.2` for host machine localhost:

```powershell
$env:CAPACITOR_SERVER_URL="http://10.0.2.2:3000"
bun run cap:sync
bun run cap:run:android
```

Physical device: use your PC LAN IP, e.g. `http://192.168.1.5:3000`.

### Production URL (default)

`capacitor.config.ts` loads **`https://oceanlinux.com`** — no redeploy of the app needed when you update the website.

---

## Files added

| Path | Purpose |
|------|---------|
| `public/site.webmanifest` | PWA manifest (PWABuilder + Add to Home Screen) |
| `public/android-chrome-*.png` | App icons |
| `assets/oceanlinux-app-icon-source.png` | Master icon (edit & re-run `icons:generate`) |
| `mobile/index.html` | Capacitor fallback splash |
| `capacitor.config.ts` | App id `com.oceanlinux.app`, server URL |
| `android/` | Native Android project (after `cap:init`) |

---

## Play Store checklist

- [ ] Privacy policy URL on site
- [ ] Signed AAB uploaded
- [ ] Screenshots (phone + optional tablet)
- [ ] App name: **OceanLinux**
- [ ] Package: `com.oceanlinux.app`

---

## Troubleshooting

**White screen in app** — Check `https://oceanlinux.com` loads in Chrome; verify `CAPACITOR_SERVER_URL` for local dev.

**Gradle sync failed** — Open Android Studio SDK Manager; install latest SDK + build tools.

**Payment redirect** — Razorpay/Cashfree return URLs must allow in-app browser; test renew/checkout flow on a real device.
