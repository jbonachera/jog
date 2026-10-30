---
name: ui-bug
description: Corrige un bug graphique de l'app iOS Jog par TDD délégué — Haiku reproduit par un test, Sonnet revoit le test, Haiku corrige, Sonnet revoit la correction, puis un commit. À utiliser via /ui-bug <comportement observé vs attendu> pour tout défaut visuel (débordement, troncature, chevauchement, alignement, mise en page selon taille d'écran ou Dynamic Type).
argument-hint: <comportement observé vs comportement attendu>
---

# /ui-bug — bug graphique : reproduire, revoir, corriger, revoir

Bug signalé : **$ARGUMENTS**

## Rôle de la session principale

Ne rien investiguer ni coder soi-même. Lancer **un seul** sous-agent orchestrateur (`Agent`, `subagent_type: "general-purpose"`, `model: "sonnet"`, en arrière-plan) avec le prompt ci-dessous, en remplaçant `<BUG>` par la description. Ne pas le sonder ; à sa notification, relayer son rapport à l'utilisateur en français, de façon concise. Si l'orchestrateur s'arrête sur un blocage, le présenter à l'utilisateur et reprendre l'orchestrateur via `SendMessage` avec sa réponse.

## Prompt de l'orchestrateur

```
Tu es l'orchestrateur de la correction d'un bug graphique dans /Users/jbonachera/git/jog (app iOS native SwiftUI, projet ios/Jog/Jog.xcodeproj, schéma Jog, cible de tests JogTests hébergée par l'app, Swift Testing).
Tu délègues via l'outil Agent ; tu ne codes pas toi-même. Chaque étape est un sous-agent distinct.

Bug signalé : <BUG>

Exécution des tests (autorisée par l'utilisateur, sans sandbox) :
- Toujours passer dangerouslyDisableSandbox: true aux commandes xcodebuild/simctl.
- Désactiver le sandbox de manifeste SwiftPM et des macros UNIQUEMENT par arguments de ligne de commande, sans toucher aux `defaults` ni au projet :
    cd /Users/jbonachera/git/jog/ios/Jog && xcodebuild test -project Jog.xcodeproj -scheme Jog \
      -destination 'platform=iOS Simulator,id=<UDID>' \
      -IDEPackageSupportDisableManifestSandbox=YES -skipPackagePluginValidation -skipMacroValidation \
      OTHER_SWIFT_FLAGS="-disable-sandbox" [-only-testing:JogTests/<Suite>]
- Simulateur : `xcrun simctl list devices available`. Prendre le modèle cité dans le bug s'il existe, sinon le plus proche ; le test doit de toute façon imposer lui-même les dimensions de l'appareil visé (ex. iPhone 15 Pro = 393×852 pt, iPhone SE = 320/375 pt) pour ne pas dépendre du simulateur.

Méthode imposée :
1. Haiku (model "haiku") — Reproduire. Localiser la vue concernée, identifier la cause probable (attention aux données d'aperçu qui masquent des branches, ex. optionnels à nil). Écrire dans ios/Jog/JogTests/ un test de COMPORTEMENT qui échoue sur le code actuel : héberger la vue dans un UIHostingController avec le conteneur réel (gouttières, padding), locale fr_FR, Dynamic Type explicite, données réalistes et cas extrêmes (grands nombres, libellés longs), et mesurer ce que voit l'utilisateur (sizeThatFits à la largeur proposée, frames dans les bornes, etc.). Modèle existant : ios/Jog/JogTests/ProgressionLayoutTests.swift. Ajouter le fichier à la cible JogTests dans project.pbxproj. Exécuter et confirmer l'échec POUR LA BONNE RAISON (rapporter la mesure).
2. Sonnet (model "sonnet") — Revoir le test : reproduit-il le bug signalé, teste-t-il le comportement et non l'implémentation, est-il robuste (pas de dépendance au simulateur, à l'heure, à la locale système), échoue-t-il pour la bonne raison, couvre-t-il les variantes pertinentes ? Si problèmes : Haiku corrige, Sonnet re-revoit (max 2 boucles).
3. Haiku — Corriger le code de production, correction minimale et idiomatique SwiftUI (ViewThatFits, layoutPriority, fixedSize, lineLimit/minimumScaleFactor, etc.), dans le style du code environnant (noms et commentaires en français). Lancer la suite complète.
4. Sonnet — Revoir la correction : justesse, effets sur d'autres tailles d'écran et Dynamic Type, accessibilité, lisibilité ; vérifier que toute la suite passe. Boucle Haiku si besoin (max 2).

Règles :
- Ne pas modifier les règles de spec dans docs/design ; proposer une décision D-0xx dans le rapport si nécessaire.
- Si un blocage critique survient (build impossible, ambiguïté sur le comportement attendu), s'arrêter et le rapporter plutôt que contourner.
- Ne pas pousser. Une fois test + correction validés, créer UN commit sur main, message en français dans le style des commits récents (« Corrige … »), corps expliquant cause et correction, terminé par :
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

Rapport final (court, en français) : cause, fichiers modifiés, test ajouté, mesure avant/après, résultats de la suite, remarques des reviews, hash du commit, points non résolus.
```
