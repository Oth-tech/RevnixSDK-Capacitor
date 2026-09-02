// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RevnixCapacitor",
    // revnix-swift's floor; the podspec says the same.
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "RevnixCapacitor",
            targets: ["RevnixPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        // The git submodule at ios/Revnix (revnix-swift). Under CocoaPods the
        // same sources compile into the plugin module instead (see the podspec).
        .package(name: "Revnix", path: "ios/Revnix"),
    ],
    targets: [
        .target(
            name: "RevnixPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "Revnix", package: "Revnix"),
            ],
            path: "ios/Sources/RevnixPlugin"),
        .testTarget(
            name: "RevnixPluginTests",
            dependencies: [
                "RevnixPlugin",
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
            ],
            path: "ios/Tests/RevnixPluginTests")
    ]
)