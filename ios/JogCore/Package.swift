// swift-tools-version: 6.0
import PackageDescription
import Foundation

// Les cas dorés (Tests/Oracle/*.json) sont produits par le lot 0.2. Le dossier
// peut être absent au début : la ressource n'est déclarée que s'il existe,
// sinon SwiftPM refuserait le paquet. La condition de compilation ORACLE_PRESENT
// indique au code de test que Bundle.module contient le dossier.
let dossierOracle = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .appendingPathComponent("Tests/Oracle")
let oraclePresent = FileManager.default.fileExists(atPath: dossierOracle.path)

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
            sources: ["JogCoreTests"],
            resources: oraclePresent ? [.copy("Oracle")] : [],
            swiftSettings: [.swiftLanguageMode(.v6)]
                + (oraclePresent ? [.define("ORACLE_PRESENT")] : [])
        ),
    ],
    swiftLanguageModes: [.v6]
)
