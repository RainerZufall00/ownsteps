#!/bin/sh
# Xcode Cloud: runs after cloning. Config/Secrets.xcconfig is ignored by Git,
# so it's created here; CI_TEAM_ID is set by Xcode Cloud.
set -e

cat > "$CI_PRIMARY_REPOSITORY_PATH/ios/Config/Secrets.xcconfig" <<XCCONFIG
DEVELOPMENT_TEAM = ${CI_TEAM_ID}
XCCONFIG

# The OpenAPIGenerator build plugin generates the API client. Locally Xcode
# asks once to trust it; in CI there's nobody to ask.
defaults write com.apple.dt.Xcode IDESkipPackagePluginFingerprintValidatation -bool YES
