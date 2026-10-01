// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "OwnStepsKit",
    defaultLocalization: "en",
    // macOS only so `swift test` runs on the development machine.
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "OwnStepsKit", targets: ["OwnStepsKit"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.13.1"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.12.2"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.3.2"),
        .package(url: "https://github.com/groue/GRDB.swift", from: "7.11.1"),
    ],
    targets: [
        // Generated from openapi.json (exported from the server with
        // `npm run openapi:export`) – never edit the generated code.
        .target(
            name: "OwnStepsAPI",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime")
            ],
            plugins: [
                .plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")
            ]
        ),
        .target(
            name: "OwnStepsKit",
            dependencies: [
                "OwnStepsAPI",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
                .product(name: "GRDB", package: "GRDB.swift"),
            ]
        ),
        .testTarget(name: "OwnStepsKitTests", dependencies: ["OwnStepsKit"]),
    ]
)
