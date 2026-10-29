import SwiftUI
import JogCore

/// Charge › Récupération (03 R1 à R7 ; maquette recuperation.html, onglet Récupération). L'ordre des sections vient de
/// `ModeleRecuperation.sections`. Sans nuit mesurée, la section unique est le message de A5.
struct RecuperationView: View {
    let recuperation: VueRecuperation?
    let besoin_min: Double
    /// Les 16 semaines de R6 (volume de la Charge et écart de la récupération).
    let semaines: [ModeleRecuperation.SemaineChargeRecup]
    /// Fenêtre de R3 et R4 : 8 semaines ou 6 mois, partagée par les deux graphiques.
    @State private var fenetre: ModeleRecuperation.FenetreTendance = .huitSemaines

    var body: some View {
        VStack(alignment: .leading, spacing: 36) {
            ForEach(ModeleRecuperation.sections(recuperation), id: \.self) { section in
                contenu(section)
            }
        }
    }

    @ViewBuilder
    private func contenu(_ section: ModeleRecuperation.SectionRecuperation) -> some View {
        switch section {
        case .etat:
            if let recuperation {
                EtatRecuperationView(recuperation: recuperation)
            }
        case .signaux:
            if let recuperation {
                ListeSignauxRecuperation(indicateurs: (try? ModeleRecuperation.indicateurs(recuperation, besoin_min: besoin_min)) ?? [])
            }
        case .vfc:
            if let recuperation {
                TendanceNocturneView(recuperation: recuperation, mesure: .vfc, fenetre: $fenetre, montrerSelecteur: true)
            }
        case .fcRepos:
            if let recuperation {
                TendanceNocturneView(recuperation: recuperation, mesure: .fcRepos, fenetre: $fenetre, montrerSelecteur: false)
            }
        case .sommeil:
            if let recuperation {
                SommeilNuitsView(recuperation: recuperation)
            }
        case .chargeRecuperation:
            RecuperationChargeView(semaines: semaines)
        case .methode:
            VStack(alignment: .leading, spacing: 12) {
                CommentCestCalculeView()
                Text(ModeleRecuperation.sourceTexte)
                    .font(.footnote)
                    .foregroundStyle(.encre3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)
            }
        case .sansNuit:
            ContentUnavailableView {
                Label("Récupération", systemImage: "bed.double")
            } description: {
                Text(ModeleRecuperation.messageSansNuit)
            }
        }
    }
}

/// R1 : surtitre, état en grand titre (couleur de son ton, `ink-2` sans donnée), puis la phrase d'explication.
private struct EtatRecuperationView: View {
    let recuperation: VueRecuperation

    var body: some View {
        let ton = ModeleRecuperation.tonEtat(recuperation.etat)
        VStack(alignment: .leading, spacing: 8) {
            Text(ModeleRecuperation.surtitre)
                .font(.footnote)
                .foregroundStyle(.encre3)
                .fixedSize(horizontal: false, vertical: true)
            Text(recuperation.titre)
                .font(.largeTitle.weight(.heavy))
                .tracking(-0.5)
                .foregroundStyle(ton.couleur)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(recuperation.phrase)
                .font(.body)
                .foregroundStyle(.encre2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// R2 : « n sur m au vert », puis une ligne par indicateur (nom, « valeur · détail », pastille, chevron). Un appui ouvre
/// la feuille de l'indicateur.
struct ListeSignauxRecuperation: View {
    let indicateurs: [IndicateurRecuperation]
    @State private var choisi: Choisi?

    /// Indicateur ouvert dans la feuille, identifié par sa clé.
    private struct Choisi: Identifiable {
        let indicateur: IndicateurRecuperation
        var id: CleIndicateur { indicateur.cle }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                TitreSection(titre: "Signaux")
                Text(ModeleRecuperation.resumeIndicateurs(indicateurs))
                    .font(.footnote)
                    .foregroundStyle(.encre3)
            }
            VStack(spacing: 0) {
                ForEach(Array(indicateurs.enumerated()), id: \.offset) { indice, indicateur in
                    if indice > 0 {
                        Divider()
                    }
                    Button {
                        choisi = Choisi(indicateur: indicateur)
                    } label: {
                        ligne(indicateur)
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(RoundedRectangle(cornerRadius: 12).fill(.surface))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.ligne, lineWidth: 1))
        }
        .sheet(item: $choisi) { choisi in
            FeuilleIndicateurView(indicateur: choisi.indicateur)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private func ligne(_ indicateur: IndicateurRecuperation) -> some View {
        LigneSignalRecuperation(indicateur: indicateur)
    }
}

/// Une ligne de R2 : nom, « valeur · détail », pastille, chevron. En taille d'accessibilité, la pastille passe sous le nom :
/// elle ne tient jamais à côté, et la disposition côte à côte déborde à 393 pt (`ViewThatFits` la gardait à tort).
private struct LigneSignalRecuperation: View {
    let indicateur: IndicateurRecuperation
    @Environment(\.dynamicTypeSize) private var taille

    var body: some View {
        let pastille = Pastille(texte: ModeleRecuperation.libelleIndicateur(indicateur.etat), ton: ModeleRecuperation.tonIndicateur(indicateur.etat))
        let chevron = Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.encre3)
        Group {
            if taille.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    textes
                    pastille
                }
                // Place réservée au chevron, superposé : il ne compte pas dans la largeur de la ligne.
                .padding(.trailing, 24)
                .overlay(alignment: .trailing) {
                    chevron
                }
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .center, spacing: 12) {
                        textes
                        Spacer(minLength: 8)
                        pastille
                        chevron
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .center, spacing: 8) {
                            textes
                            Spacer(minLength: 0)
                            chevron
                        }
                        pastille
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(indicateur.nom), \(ModeleRecuperation.valeurEtDetail(indicateur)), \(ModeleRecuperation.libelleIndicateur(indicateur.etat))"
        )
        .accessibilityHint("Ouvre le détail de l’indicateur")
    }

    /// Le nom et « valeur · détail ». Le texte se coupe à la largeur qui lui reste : pas de `fixedSize`, qui ferait
    /// mesurer une fraction de point de trop à la ligne en taille d'accessibilité.
    private var textes: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(indicateur.nom)
                .font(.headline)
                .foregroundStyle(.encre)
            Text(ModeleRecuperation.valeurEtDetail(indicateur))
                .font(.footnote)
                .foregroundStyle(.encre2)
        }
    }
}
