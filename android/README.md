# OwnSteps for Android

The native Android app for OwnSteps (Kotlin, Jetpack Compose, Material 3,
Android 10+). It does what the iOS app does and talks to the same REST API
(`/api/v1`); it can be signed in to several servers at once and follow trips
as a reader without an account.

## Layout

```
android/app/src/main/java/de/ownsteps/app/
├── api/        The server: models, client, addresses, invites, PKCE
├── data/       Accounts, encrypted tokens, Room database, trip cache,
│               photo cache, upload queue, trip logic (days, news, suggestions)
├── media/      Media store library, photo/video preparation, places
├── work/       Upload and background-refresh workers, notifications
├── ui/         Compose screens; shared pieces in Components.kt, Text.kt, Pickers.kt
├── AppModel.kt The process-wide state and services – screens and workers use it
└── MainActivity.kt / OwnStepsApplication.kt
```

Everything that can be tested without a device is plain Kotlin and covered by
JVM unit tests in `app/src/test` – including a contract test that checks the
models against the server's `openapi.json` (the copy in `ios/…/OwnStepsAPI/`,
kept current by `npm run openapi:export`).

## How it maps to the iOS app

| iOS | Android |
| --- | --- |
| SwiftUI, Liquid Glass | Jetpack Compose, Material 3 (Material You colors from Android 12) |
| GRDB | Room (schemas exported to `app/schemas`; migrations append only) |
| Keychain | Android Keystore (AES-GCM key, tokens encrypted in preferences) |
| Background `URLSession` | WorkManager, as a foreground service while it may |
| `BGAppRefreshTask` | Periodic WorkManager job (Android allows 15 min at the shortest) |
| Apple MapKit | MapLibre with OpenFreeMap tiles – no key, like on the web ([D24]) |
| Core Location | Google Play Services fused location |
| `ASWebAuthenticationSession` | Custom Tab, ending at `ownsteps://auth` |
| Share Extension | Share target (`ShareActivity`) using the same composer as the app |
| PhotosPicker | Own picker on the media store – the system picker strips GPS |
| HEIC → JPEG, `AVAssetExportSession` | `ImageDecoder` → JPEG with EXIF copied, Media3 Transformer to 1080p |
| String Catalogs | `res/values/strings.xml` and `res/values-de/strings.xml` |

The app is meant for phones with Google Play Services: "My location" uses
the fused location provider, place names and the place search the system
geocoder. The map stays MapLibre with OpenFreeMap – no key, the same map as
on the web.

## Building

You need JDK 17+ and the Android SDK (platform 37). Point Gradle at the SDK in
`local.properties` (`sdk.dir=…`) or `ANDROID_HOME`, then:

```bash
./gradlew :app:assembleDebug
```

```bash
./gradlew :app:testDebugUnitTest :app:lintDebug
```

Forks publishing their own build set their own application ID: `appId=…` in
`gradle.properties` or with `-PappId=…`.

## Trying it against a local server

Start the server with `npm run dev` (port 2555). The emulator reaches the
host at `http://10.0.2.2:2555` – plain HTTP is allowed for local and private
addresses only ([D26]).

## Server limits

`MediaPreparation` repeats the server's upload limits (25 MB per image,
400 MB per video, from `src/lib/limits.ts`), like the iOS app does. Change
them in all three places.

## License

The app is licensed under the [Mozilla Public License 2.0](LICENSE), like the
iOS app – unlike the server, which is under the AGPL.
