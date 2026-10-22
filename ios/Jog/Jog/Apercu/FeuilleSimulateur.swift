import SwiftUI
import JogCore

/// Le simulateur « Et si je cours… » (05, « Simulateur »). Le curseur va de 0,5 à 1,6 fois la référence, au pas de
/// 1 km. Les résultats se mettent à jour en direct et sont annoncés aux lecteurs d'écran.
struct FeuilleSimulateur: View {
    let simulateur: Simulateur
    let fourchette: Fourchette
    @State private var km: Double
    @Environment(\.dismiss) private var fermer

    init(simulateur: Simulateur, fourchette: Fourchette) {
        self.simulateur = simulateur
        self.fourchette = fourchette
        _km = State(initialValue: simulateur.defaut)
    }

    private var resultat: ModeleApercu.ResultatAffiche? {
        ModeleApercu.simulation(km: km, simulateur: simulateur, fourchette: fourchette)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Kilomètres sur les 7 prochains jours")
                            .font(.footnote)
                            .foregroundStyle(.encre2)
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text(ModeleApercu.nombre(km))
                                .font(.largeTitle.weight(.heavy))
                                .monospacedDigit()
                                .foregroundStyle(.encre)
                                .contentTransition(.numericText(value: km))
                            Text("km")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(.encre2)
                        }
                        Slider(value: $km, in: simulateur.min...simulateur.max, step: 1) {
                            Text("Kilomètres sur les 7 prochains jours")
                        } minimumValueLabel: {
                            Text(ModeleApercu.nombre(simulateur.min)).monospacedDigit()
                        } maximumValueLabel: {
                            Text(ModeleApercu.nombre(simulateur.max)).monospacedDigit()
                        }
                        .tint(.accentFjord)
                        .accessibilityValue("\(ModeleApercu.nombre(km)) km")
                        Text("Fourchette proposée : \(ModeleApercu.fourchetteTexte(fourchette))")
                            .font(.footnote)
                            .foregroundStyle(.encre3)
                    }
                    .carte()

                    if let resultat {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                Text("Ratio 7 j / 30 j projeté")
                                    .font(.subheadline)
                                    .foregroundStyle(.encre)
                                Spacer(minLength: 8)
                                Pastille(texte: resultat.ratio, ton: resultat.tonRatio)
                            }
                            HStack {
                                Text("Fraîcheur dans 7 jours")
                                    .font(.subheadline)
                                    .foregroundStyle(.encre)
                                Spacer(minLength: 8)
                                Pastille(texte: resultat.fraicheur, ton: resultat.tonFraicheur)
                            }
                            Text(resultat.phrase)
                                .font(.footnote)
                                .foregroundStyle(.encre2)
                            Text("Estimation à intensité inchangée.")
                                .font(.footnote)
                                .foregroundStyle(.encre3)
                        }
                        .carte()
                        .accessibilityElement(children: .contain)
                        .accessibilityLabel("Résultats")
                        .onChange(of: resultat.phrase) { _, nouvelle in
                            AccessibilityNotification.Announcement(nouvelle).post()
                        }
                    }
                }
                .padding(16)
            }
            .background(Color.fond.ignoresSafeArea())
            .navigationTitle("Et si je cours…")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fermer") { fermer() }
                }
            }
        }
    }
}
