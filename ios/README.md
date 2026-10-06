# OwnSteps for iOS

The native app for OwnSteps (SwiftUI, iOS 26+). It talks to a server's REST
API (`/api/v1`) and can be signed in to several servers at once.

## Layout

```
ios/
├── OwnSteps/                 App target: SwiftUI views, app state, strings
├── ShareExtension/           Share Extension: shared photos become a step
├── Packages/OwnStepsKit/     Swift package with everything testable
│   ├── Sources/OwnStepsAPI/  Generated API client (from openapi.json)
│   └── Sources/OwnStepsKit/  Server address, sign-in, tokens, accounts
└── Config/                   xcconfig, Info.plist, entitlements
```

## Building

1. `cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig` and enter your
   team ID. Forks also set their own `APP_BUNDLE_ID_PREFIX` there – bundle IDs
   are unique per App Store account. App and Share Extension share an app
   group and a keychain group derived from the prefix, so the team needs the
   App Groups capability (any paid developer account has it). Without it the
   app still works; the extension then says it can't reach the app's data.
2. Open `OwnSteps.xcodeproj`. Xcode asks once to trust the
   `OpenAPIGenerator` build plugin; it generates the API client at build time.

From the command line:

```bash
xcodebuild -project OwnSteps.xcodeproj -scheme OwnSteps \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -skipPackagePluginValidation build
```

Package tests run on the Mac: `cd Packages/OwnStepsKit && swift test`.

## The API description

`Packages/OwnStepsKit/Sources/OwnStepsAPI/openapi.json` is exported from the
server. After changing the API, run `npm run openapi:export` in the repository
root; a server test fails while the copy is out of date.

## Trying it against a local server

Start the server with `npm run dev` (port 2555). The simulator reaches it at
`http://localhost:2555` – plain HTTP is allowed for local addresses only.

The simulator's hardware keyboard follows the Mac's layout, which garbles
`:` and `/` when typing through automation. Debug builds therefore accept
prefills as launch arguments:

```bash
xcrun simctl launch booted de.ownsteps.app \
  -OwnStepsDebugServer http://localhost:2555 \
  -OwnStepsDebugEmail you@example.com -OwnStepsDebugPassword '…'
```

## License

The app is licensed under the [Mozilla Public License 2.0](LICENSE) – unlike
the server, which is under the AGPL (see the repository root).
