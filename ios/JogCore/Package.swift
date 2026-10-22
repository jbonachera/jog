// swift-tools-version: 6.0
import PackageDescription

// Les cas dorés (Tests/Oracle/*.json) ne sont pas copiés dans le bundle de test : le harnais les lit à partir de
// #filePath, donc le dossier est exclu de la cible pour que SwiftPM ne le signale pas comme fichiers non gérés.
let package = Package(
    name: "JogCore",
    platforms: [
        .iOS("26.0"),
        .macOS("15.0"),
    ],
    products: [
        .library(name: "JogCore", targets: ["JogCore"]),
    ],
    targets: [
        .target(
            name: "JogCore",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "JogCoreTests",
            dependencies: ["JogCore"],
            path: "Tests",
            exclude: ["Oracle"],
            sources: ["JogCoreTests"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ],
    swiftLanguageModes: [.v6]
)
