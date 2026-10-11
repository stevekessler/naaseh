// swift-tools-version: 6.4

import PackageDescription

let package = Package(
    name: "NaasehApple",
    platforms: [
        .iOS(.v27),
        .macOS(.v27),
    ],
    products: [
        .library(name: "NaasehContracts", targets: ["NaasehContracts"]),
        .library(name: "NaasehCrypto", targets: ["NaasehCrypto"]),
        .library(name: "NaasehPersistence", targets: ["NaasehPersistence"]),
        .library(name: "NaasehSync", targets: ["NaasehSync"]),
        .library(name: "NaasehServices", targets: ["NaasehServices"]),
        .library(name: "NaasehFeatures", targets: ["NaasehFeatures"]),
        .library(name: "NaasehDesignSystem", targets: ["NaasehDesignSystem"]),
        .library(name: "NaasehTestSupport", targets: ["NaasehTestSupport"]),
    ],
    targets: [
        .target(
            name: "ModuleManifest",
            path: "Sources",
            exclude: [
                "CArgon2", "NaasehContracts", "NaasehCrypto", "NaasehDesignSystem",
                "NaasehFeatures", "NaasehPersistence", "NaasehServices", "NaasehSync",
                "NaasehTestSupport",
            ],
            sources: ["ModuleManifest.swift"]
        ),
        .target(
            name: "CArgon2",
            path: "Sources/CArgon2",
            exclude: ["LICENSE", "VENDORED.md"],
            publicHeadersPath: "include"
        ),
        .target(name: "NaasehContracts", dependencies: ["ModuleManifest"]),
        .target(name: "NaasehCrypto", dependencies: ["CArgon2", "NaasehContracts"]),
        .target(name: "NaasehPersistence", dependencies: ["NaasehContracts", "NaasehCrypto"]),
        .target(
            name: "NaasehSync",
            dependencies: ["NaasehContracts", "NaasehPersistence", "NaasehServices"]
        ),
        .target(name: "NaasehServices", dependencies: ["NaasehContracts", "NaasehCrypto"]),
        .target(
            name: "NaasehFeatures",
            dependencies: [
                "NaasehContracts", "NaasehDesignSystem", "NaasehPersistence", "NaasehServices",
                "NaasehSync",
            ]
        ),
        .target(name: "NaasehDesignSystem"),
        .target(name: "NaasehTestSupport", dependencies: ["NaasehContracts"]),
        .testTarget(name: "NaasehContractsTests", dependencies: ["NaasehContracts", "NaasehTestSupport"]),
        .testTarget(
            name: "NaasehCryptoTests",
            dependencies: ["NaasehCrypto", "NaasehFeatures", "NaasehTestSupport"]
        ),
        .testTarget(name: "NaasehPersistenceTests", dependencies: ["NaasehPersistence", "NaasehTestSupport"]),
        .testTarget(name: "NaasehSyncTests", dependencies: ["NaasehSync", "NaasehTestSupport"]),
        .testTarget(name: "NaasehServicesTests", dependencies: ["NaasehServices", "NaasehTestSupport"]),
        .testTarget(name: "NaasehFeaturesTests", dependencies: ["NaasehFeatures", "NaasehTestSupport"]),
        .testTarget(name: "NaasehPerformanceTests", dependencies: ["NaasehFeatures", "NaasehTestSupport"]),
    ],
    swiftLanguageModes: [.v6]
)
