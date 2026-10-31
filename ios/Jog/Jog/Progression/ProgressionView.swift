import SwiftUI
import JogCore

/// Aucune Vue ni aperçu : l'écran affiche son état d'indisponibilité.
private struct AbsenteVue: Error {}

/// Les résultats de JogCore dont l'onglet Progression a besoin (03, P1 à P5).
///
/// Les calculs ne sont pas refaits dans l'interface : chaque valeur vient d'une fonction de JogCore. Les deux sélecteurs
/// qui changent avec l'écran (le comparateur et le nuage) sont passés en fonctions : l'écran les rappelle, sans rien
/// recalculer lui-même.
struct CalculsProgression {
    /// FC de référence (paramètres en vigueur), pour le libellé de l'allure en P1 et la note de P3.
    let refHr: Double
    /// Bande de FC de fin de répétition des paramètres (P3).
    let bandeFC: (lo: Double, hi: Double)
    /// Dates saisissables : du premier jour de l'historique à hier. Nil sans historique.
    let bornes: ClosedRange<Date>?
    let tendances: Tendances
    let niveau: NiveauEstime
    let prereglage: (Prereglage) throws -> (a: PeriodeDates, b: PeriodeDates)
    let comparer: (PeriodeDates, PeriodeDates) throws -> Comparaison
    let nuage: (PeriodeNuage) throws -> Nuage
    /// La Vue dont ces calculs sont tirés (nil pour les aperçus) : clé de mémoïsation des écrans, qui ne doivent pas
    /// garder un résultat quand la Vue change.
    var cle: Vue? = nil
}

/// Les sections de l'onglet Progrès, dans l'ordre de l'écran (03 : P1, P2, P3, P5, puis H1). P4 vit dans l'écran Séance (S3).
enum SectionProgres: CaseIterable, Hashable {
    case comparateur, tendances, nuage, niveau, saisons

    static let ordre: [SectionProgres] = allCases
}

/// L'onglet Progrès (02, 03) : comparateur (P1), tendances (P2), nuage (P3), niveau estimé (P5), puis les saisons (H1).
/// Un grand titre, une seule page défilante. Les calculs viennent de JogCore, lus dans la Vue. L'ancre `saisons`
/// (Navigation.ouvrirSaisons) fait défiler jusqu'à H1, puis elle est consommée.
struct ProgressionView: View {
    /// La Vue lue par JogCore, ou nil pour l'aperçu (`calculs`).
    private let vue: Vue?
    private let exemple: CalculsProgression?
    @Binding private var ancre: Ancre?
    @State private var memo = Memo<Vue, Result<CalculsProgression, Error>>()

    init(vue: Vue, ancre: Binding<Ancre?> = .constant(nil)) {
        self.vue = vue
        exemple = nil
        _ancre = ancre
    }

    init(calculs: CalculsProgression, ancre: Binding<Ancre?> = .constant(nil)) {
        vue = nil
        exemple = calculs
        _ancre = ancre
    }

    var body: some View {
        Group {
            switch resultat {
            case let .success(calculs):
                ScrollViewReader { proxy in
                    ScrollView {
                        corps(calculs)
                    }
                    .onAppear { consommerAncre(proxy) }
                    .onChange(of: ancre) { _, _ in consommerAncre(proxy) }
                }
            case .failure:
                ContentUnavailableView(
                    "Progression indisponible",
                    systemImage: "exclamationmark.triangle",
                    description: Text("Le calcul de la progression a échoué pour cet historique.")
                )
            }
        }
        .background(Color.fond.ignoresSafeArea())
        .navigationTitle("Progrès")
    }

    /// Les calculs de l'écran, faits une fois par Vue : une réévaluation de l'écran parent ne les refait pas.
    private var resultat: Result<CalculsProgression, Error> {
        if let exemple {
            return .success(exemple)
        }
        guard let vue else {
            return .failure(AbsenteVue())
        }
        return memo.valeur(pour: vue) { Result { try CalculsProgression(vue: vue) } }
    }

    /// Défile jusqu'à la section demandée par l'ancre, puis la consomme pour qu'elle ne rejoue pas.
    private func consommerAncre(_ proxy: ScrollViewProxy) {
        guard ancre == .saisons else { return }
        ancre = nil
        withAnimation {
            proxy.scrollTo(SectionProgres.saisons, anchor: .top)
        }
    }

    private func corps(_ calculs: CalculsProgression) -> some View {
        VStack(alignment: .leading, spacing: 36) {
            ForEach(SectionProgres.ordre, id: \.self) { section in
                switch section {
                case .comparateur:
                    ComparateurView(calculs: calculs)
                case .tendances:
                    TendancesView(tendances: calculs.tendances, refHr: calculs.refHr)
                case .nuage:
                    NuageView(calculs: calculs)
                case .niveau:
                    NiveauView(niveau: calculs.niveau)
                case .saisons:
                    if let vue {
                        SaisonsSectionView(vue: vue)
                            .id(SectionProgres.saisons)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Données d'aperçu

extension CalculsProgression {
    /// Des valeurs fictives, construites avec les types publics de JogCore, pour les aperçus. Rien n'y est calculé.
    static var exemple: CalculsProgression {
        CalculsProgression(
            refHr: 164,
            bandeFC: (lo: 158, hi: 170),
            bornes: nil,
            tendances: exempleTendances,
            niveau: exempleNiveau,
            prereglage: { _ in
                (a: PeriodeDates(debut: "2026-06-03", fin: "2026-08-25"), b: PeriodeDates(debut: "2026-08-26", fin: "2026-11-18"))
            },
            comparer: { _, _ in exempleComparaison },
            nuage: { periode in exempleNuage(periode) }
        )
    }

    private static var exempleTendances: Tendances {
        let semaines = (0..<12).map { i in
            PointSemaine(lundi: "2026-0\(7 + i / 5)-\(String(format: "%02d", 1 + (i * 6) % 27))", brut: 330 - Double(i) * 1.5, lisse: 328 - Double(i) * 1.4)
        }
        let sorties = (0..<6).map { i in
            PointSortie(date: "2026-08-\(String(format: "%02d", 2 + i * 5))", brut: 6 - Double(i) * 0.4, lisse: 5.5 - Double(i) * 0.3, forme: i % 2 == 0 ? .losange : .rond)
        }
        return Tendances(
            allure: Tendance(points: semaines, derniere: 317, ecart: -11, bonSens: true),
            ef: Tendance(points: semaines, derniere: 1.42, ecart: 0.06, bonSens: true),
            decouplage: Tendance(points: sorties, derniere: 4.1, ecart: -1.4, bonSens: true)
        )
    }

    private static var exempleNiveau: NiveauEstime {
        let test = SourceNiveau(date: "2026-10-04", distance_km: 5, temps_s: 1230, type: .test)
        let lignes = [
            LigneNiveau(distance_km: 5, libelle: "5 km", equivalence_s: 1230, allure_skm: 246, record: RecordNiveau(temps_s: 1230, date: "2026-10-04"), libelleDateRecord: "4 oct.", ecart_s: 0, bat: false),
            LigneNiveau(distance_km: 10, libelle: "10 km", equivalence_s: 2572, allure_skm: 257, record: RecordNiveau(temps_s: 2601, date: "2026-06-21"), libelleDateRecord: "21 juin", ecart_s: -29, bat: true),
            LigneNiveau(distance_km: 21.0975, libelle: "Semi", equivalence_s: 5610, allure_skm: 266, record: nil, libelleDateRecord: "pas encore couru", ecart_s: nil, bat: false),
            LigneNiveau(distance_km: 42.195, libelle: "Marathon", equivalence_s: 11820, allure_skm: 280, record: nil, libelleDateRecord: "pas encore couru", ecart_s: nil, bat: false),
        ]
        return .estime(source: test, lignes: lignes)
    }

    private static var exempleComparaison: Comparaison {
        let a = PeriodeBornee(debut: "2026-06-03", fin: "2026-08-25", jours: 84)
        let b = PeriodeBornee(debut: "2026-08-26", fin: "2026-11-18", jours: 84)
        return Comparaison(
            a: a,
            b: b,
            historiquePartiel: false,
            mesures: [
                Mesure(cle: .km, groupe: .volume, nom: "km / sem.", sens: .plusHaut, a: 32.4, b: 36.1, ecart: 3.7, ecartAffiche: 3.7, etat: .mieux),
                Mesure(cle: .seances, groupe: .volume, nom: "séances / sem.", sens: .neutre, a: 4, b: 4, ecart: 0, ecartAffiche: 0, etat: .egal),
                Mesure(cle: .minutesSS, groupe: .sousSeuil, nom: "min / sem.", sens: .plusHaut, a: 48, b: 41, ecart: -7, ecartAffiche: -7, etat: .moinsBien),
                Mesure(cle: .allure, groupe: .sousSeuil, nom: "allure à 164 bpm", sens: .plusRapide, a: 312, b: 306, ecart: -6, ecartAffiche: -6, etat: .mieux),
                Mesure(cle: .partSS, groupe: .sousSeuil, nom: "% du temps", sens: .neutre, a: 9.5, b: 11.2, ecart: 1.7, ecartAffiche: 2, etat: .neutre),
                Mesure(cle: .heures, groupe: .volume, nom: "h / sem.", sens: .plusHaut, a: 5.4, b: 6.1, ecart: 0.7, ecartAffiche: 0.7, etat: .mieux),
                Mesure(cle: .test5, groupe: .performance, nom: "meilleur test 5 km", sens: .plusRapide, a: 1290, b: 1230, ecart: -60, ecartAffiche: -60, etat: .mieux),
                Mesure(cle: .decouplage, groupe: .endurance, nom: "découplage sortie longue", sens: .plusBas, a: 6.2, b: 4.1, ecart: -2.1, ecartAffiche: -2.1, etat: .mieux),
            ]
        )
    }

    private static func exempleNuage(_ periode: PeriodeNuage) -> Nuage {
        func points(_ allures: [Double], _ fc: [Double]) -> [PointRepetition] {
            zip(allures, fc).enumerated().map { index, valeur in
                PointRepetition(date: "2026-09-2\(index % 9)", format: "5×8'", n: Double(index % 5 + 1), allure_skm: valeur.0, fcFin: valeur.1, allureNorm_skm: valeur.0 + (valeur.1 - 164) * 1.1)
            }
        }
        let recente = points([306, 304, 309, 305, 303], [166, 165, 168, 164, 163])
        let reference = points([318, 316, 320, 314, 319], [166, 165, 168, 164, 167])
        return Nuage(
            periode: periode,
            recente: PeriodeRepetitions(
                debut: "2026-08-01", fin: "2026-10-26", jours: 84, nombre: Double(recente.count), points: recente,
                centre: CentreRepetitions(allure_skm: 305.4, fcFin: 165.6), allureNormMoy_skm: 306
            ),
            reference: PeriodeRepetitions(
                debut: "2025-08-01", fin: "2025-10-26", jours: 84, nombre: Double(reference.count), points: reference,
                centre: CentreRepetitions(allure_skm: 317.4, fcFin: 165.6), allureNormMoy_skm: 322
            ),
            ecart_skm: 16
        )
    }
}

#Preview("Clair") {
    ProgressionView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
        .preferredColorScheme(.light)
}

#Preview("Sombre") {
    ProgressionView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
        .preferredColorScheme(.dark)
}
