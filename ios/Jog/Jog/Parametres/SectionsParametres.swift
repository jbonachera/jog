import SwiftUI
import UIKit
import JogCore

/// Actions de la feuille, transmises à ses sections (la feuille garde l'état et les appels au modèle).
struct ActionsParametres {
    let defauts: () -> Void
    let supprimer: () -> Void
    let retirerModification: (String) -> Void
    let utiliserPaceHrK: (Double) -> Void
    let utiliserFCMax: (SuggestionHrMax) -> Void
}

/// Les sections du formulaire des Paramètres (06). Tout ce qui s'affiche vient de `ModeleParametres.swift` et de la Vue.
struct SectionsParametres: View {
    @Binding var brouillon: Brouillon
    @Binding var dateEffet: Date
    let vue: Vue?
    let verification: Verification?
    @Binding var hrMaxIgnoree: String
    let historique: [LigneHistorique]
    let etat: EtatDonnees?
    let statut: String?
    let erreur: String?
    let actions: ActionsParametres

    var body: some View {
        Section {
            DatePicker("À partir du", selection: $dateEffet, in: ...Date(), displayedComponents: .date)
        } header: {
            Text("Date d’effet")
        } footer: {
            Text("Elle s’applique aux mesures de l’athlète (FC max, seuil, zones, footings). "
                + "Les réglages globaux valent pour tout l’historique.")
        }

        if let erreur {
            Section {
                Label(erreur, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(Ton.mauvais.couleur)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        } else if let statut {
            Section {
                Text(statut)
                    .foregroundStyle(.encre2)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }

        sectionFCMax

        Section {
            ligne(.datee(.hrMax))
            ligne(.datee(.hrRest))
            ligne(.datee(.easyCap))
        } header: {
            Text("Fréquence cardiaque")
        } footer: {
            Text("La FC max règle les zones, le classement des minutes et la charge. "
                + "La FC de repos est sans effet sur les calculs pour l’instant.")
        }

        Section {
            ligne(.datee(.lt2Hr))
            ligne(.datee(.lt2Pace))
            ligne(.globale(.refHr))
            ligne(.globale(.paceHrK))
            suggestionPaceHrK
        } header: {
            Text("Seuil")
        } footer: {
            Text("Le seuil s’estime à la FC et à l’allure, par un test de 30 min ou un 10 km couru autour d’une heure.")
        }

        Section {
            ligne(.datee(.subtHrLo))
            ligne(.datee(.subtHrHi))
            ligne(.globale(.subtPctLo))
            ligne(.globale(.subtPctHi))
        } header: {
            Text("Méthode NSA")
        } footer: {
            Text("Bande des FC de fin de répétition et part de sous-seuil visée.")
        }

        Section {
            ligne(.datee(.z1))
            ligne(.datee(.z2))
            ligne(.datee(.z3))
            ligne(.datee(.z4))
            ForEach(lignesZones(brouillon), id: \.nom) { zone in
                LabeledContent(zone.nom, value: zone.texte)
                    .foregroundStyle(.encre2)
            }
        } header: {
            Text("Zones")
        } footer: {
            Text("Limites hautes en % de la FC max. La zone 5 va de la zone 4 à 100 %.")
        }

        Section {
            ligne(.globale(.ctlDays))
            ligne(.globale(.atlDays))
        } header: {
            Text("Modèle de charge")
        } footer: {
            Text("Constantes du modèle de forme (CTL) et de fatigue (ATL), pour tout l’historique.")
        }

        Section {
            if historique.isEmpty {
                Text("Aucune modification enregistrée.")
                    .foregroundStyle(.encre2)
            }
            ForEach(historique) { ligne in
                VStack(alignment: .leading, spacing: 2) {
                    Text(ligne.titre)
                    Text(ligne.detail)
                        .font(.footnote)
                        .foregroundStyle(.encre2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                .swipeActions {
                    Button("Supprimer", role: .destructive) {
                        actions.retirerModification(ligne.id)
                    }
                }
            }
        } header: {
            Text("Historique des modifications")
        } footer: {
            Text("Glissez une modification vers la gauche pour la supprimer. Les séances sont recalculées.")
        }

        etatDonnees

        Section {
            Button("Revenir aux valeurs par défaut", action: actions.defauts)
            Button("Supprimer toutes mes données", role: .destructive, action: actions.supprimer)
        } footer: {
            Text("Supprimer efface les séances, les paramètres, leur historique et les marquages de cet iPhone. "
                + "Les données Santé d’Apple ne sont pas touchées.")
        }
    }

    /// Un champ de saisie avec sa valeur à J−1 et, s'il y a lieu, son message de validation (06).
    private func ligne(_ champ: ChampParametre) -> some View {
        ChampSaisie(
            champ: champ,
            texte: Binding(get: { brouillon.texte(champ) }, set: { brouillon.definir(champ, $0) }),
            enVigueur: vue.flatMap { valeurJm1(champ, $0.parametresEnVigueur) },
            erreur: messageChamp(verification, champ)
        )
    }

    /// Suggestion de paceHrK (D-004), ou la raison de son absence.
    @ViewBuilder
    private var suggestionPaceHrK: some View {
        if let parametres = vue?.parametresEnVigueur {
            Text(texteSuggestionPaceHrK(parametres))
                .font(.footnote)
                .foregroundStyle(.encre2)
            if let suggestion = parametres.suggestionPaceHrK {
                let valeur = (suggestion * 100).rounded() / 100
                Button("Utiliser \(texteNombre(valeur)) pour le coefficient") {
                    actions.utiliserPaceHrK(valeur)
                }
            }
        }
    }

    /// Encart « FC max observée » (D-019), en tête du formulaire tant qu'il n'est pas ignoré.
    @ViewBuilder
    private var sectionFCMax: some View {
        if let parametres = vue?.parametresEnVigueur,
           let suggestion = parametres.suggestionHrMax,
           let encart = encartFCMax(suggestion, hrMaxVeille: parametres.datesAJm1.hrMax, ignoree: hrMaxIgnoree) {
            Section {
                Text(encart.phrase)
                if let alerte = encart.alerte {
                    Label(alerte, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(Ton.attention.couleur)
                }
                Button(encart.libelleUtiliser) {
                    actions.utiliserFCMax(suggestion)
                }
                Button("Ignorer") {
                    hrMaxIgnoree = cleIgnoree(suggestion)
                }
            } header: {
                Text(encart.titre)
            } footer: {
                Text("Proposition seulement : enregistrer une valeur datée de la séance demande votre confirmation. "
                    + "« Ignorer » masque cette proposition sur cet appareil.")
            }
        }
    }

    /// Données : versions, compteurs, dernière synchronisation, et le lien vers les réglages (D-017, adapté).
    @ViewBuilder
    private var etatDonnees: some View {
        if let etat {
            Section {
                LabeledContent("Règles de calcul", value: etat.reglesVersion)
                LabeledContent("Séances importées", value: "\(etat.seancesImportees)")
                LabeledContent("Écartées du calcul", value: "\(etat.ecartees)")
                LabeledContent("Ignorées à l’import", value: "\(etat.ignorees.values.reduce(0, +))")
                ForEach(etat.ignorees.keys.sorted { $0.rawValue < $1.rawValue }, id: \.self) { raison in
                    LabeledContent(libelleRaison(raison), value: "\(etat.ignorees[raison] ?? 0)")
                        .foregroundStyle(.encre2)
                }
                LabeledContent("Refusées", value: "\(etat.echecs)")
                LabeledContent("Dernière synchronisation", value: libelleDerniereSynchro(etat.derniereSynchro))
                if let reglages = URL(string: UIApplication.openSettingsURLString) {
                    Link("Ouvrir les réglages de Jog", destination: reglages)
                }
            } header: {
                Text("État des données")
            } footer: {
                Text("L’accès aux données de santé se règle dans Réglages > Santé > Accès aux données > Jog.")
            }
        }
    }
}

/// Un champ numérique : libellé, valeur à J−1, unité, et le message de validation sous le champ (06).
struct ChampSaisie: View {
    let champ: ChampParametre
    @Binding var texte: String
    let enVigueur: String?
    let erreur: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(champ.libelle)
                    if let enVigueur {
                        Text("À J−1 : \(enVigueur)")
                            .font(.footnote)
                            .foregroundStyle(.encre2)
                    }
                }
                Spacer(minLength: 8)
                TextField(champ.libelle, text: $texte)
                    .multilineTextAlignment(.trailing)
                    .keyboardType(champ.estAllure ? .numbersAndPunctuation : .decimalPad)
                    .monospacedDigit()
                    .accessibilityLabel(champ.libelle)
                    .accessibilityValue(texte.isEmpty ? "vide" : "\(texte) \(champ.unite)")
                Text(champ.unite)
                    .font(.footnote)
                    .foregroundStyle(.encre2)
            }
            if let erreur {
                Label(erreur, systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(Ton.mauvais.couleur)
            }
        }
    }
}

private extension ChampParametre {
    var estAllure: Bool {
        if case .datee(.lt2Pace) = self { return true }
        return false
    }
}
