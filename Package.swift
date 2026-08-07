// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RevnixCapacitor",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "RevnixCapacitor",
            targets: ["RevnixPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "RevnixPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/RevnixPlugin"),
        .testTarget(
            name: "RevnixPluginTests",
            dependencies: ["RevnixPlugin"],
            path: "ios/Tests/RevnixPluginTests")
    ]
)