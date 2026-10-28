# Jog

App iPhone (iOS 26, SwiftUI) de suivi de course à pied selon la méthode NSA : volume hebdomadaire recommandé, signaux, charge, progression et historique. Elle lit les séances de course dans Santé (HealthKit, lecture seule) ; tout reste sur l'appareil.

## Structure

- `ios/JogCore` : le moteur Swift (calculs, adaptateur HealthKit pur, stockage), sans UIKit ni HealthKit.
- `ios/Jog` : le projet Xcode de l'app (écrans, requêtes HealthKit, synchronisation).
- `docs/design` : la spécification fonctionnelle et les maquettes (`maquette/mobile.html`, design de référence).
- `docs/adr` : les décisions d'architecture (en particulier [0014](docs/adr/0014-app-ios-native.md)).
- `docs/implementation` : contrats, plan de réalisation et historique de la migration.

## Construire et tester

```
cd ios/JogCore && swift test            # ajouter --disable-sandbox si le sandbox gêne
cd ios/Jog && xcodebuild -project Jog.xcodeproj -scheme Jog \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO build
```

Renseigner l'équipe de signature dans Xcode pour installer sur un iPhone (HealthKit exige un compte Apple Developer). Les cas dorés de `ios/JogCore/Tests/Oracle` sont figés (voir leur README).

Les exports de séances (`local-data/`) et l'archive Strava sont des données de santé : ignorés par git, ne jamais les commiter.
