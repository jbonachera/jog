import SwiftUI
import JogCore

/// P1 · Comparer deux périodes (03, P1). Préréglage segmenté, dates de A et de B, puis le tableau des mesures.
/// Le préréglage et les dates sont mémorisés localement ; une date modifiée bascule sur « Dates personnalisées ».
struct ComparateurView: View {
    let calculs: CalculsProgression
    @AppStorage("jog-cmp-p") private var choixBrut = ChoixComparaison.precedentes.rawValue
    @AppStorage("jog-cmp-dates") private var datesBrut = ""

    private var choix: ChoixComparaison {
        ChoixComparaison(rawValue: choixBrut) ?? .precedentes
    }

    private var datesSaisies: DatesComparateur? {
        guard let donnees = datesBrut.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(DatesComparateur.self, from: donnees)
    }

    /// Les deux périodes en vigueur : celles du préréglage, ou les dates saisies (à défaut, le préréglage par défaut).
    private func periodes() throws -> DatesComparateur {
        if let prereglage = choix.prereglage {
            let resultat = try calculs.prereglage(prereglage)
            return DatesComparateur(a: resultat.a, b: resultat.b)
        }
        if let saisies = datesSaisies {
            return saisies
        }
        let depart = try calculs.prereglage(.douzeSemainesPrecedentes)
        return DatesComparateur(a: depart.a, b: depart.b)
    }

    private var resultat: Result<Comparaison, Error> {
        Result {
            let dates = try periodes()
            return try calculs.comparer(dates.a, dates.b)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Comparer deux périodes")

            VStack(alignment: .leading, spacing: 14) {
                Picker("Préréglage", selection: Binding(get: { choix }, set: choisir)) {
                    ForEach(ChoixComparaison.allCases) { option in
                        Text(option.libelleCourt).tag(option)
                    }
                }
                .pickerStyle(.segmented)

                Text(choix.libelleComplet)
                    .font(.caption)
                    .foregroundStyle(.encre2)

                dates

                contenu
            }
            .carte()
        }
    }

    // MARK: - Dates

    @ViewBuilder
    private var dates: some View {
        if let bornes = calculs.bornes {
            let dates = (try? periodes()) ?? DatesComparateur(a: .vide, b: .vide)
            VStack(alignment: .leading, spacing: 8) {
                ligneDates("A · référence", periode: .a, dates: dates.a, bornes: bornes)
                ligneDates("B · comparée", periode: .b, dates: dates.b, bornes: bornes)
            }
        }
    }

    private func ligneDates(
        _ titre: String, periode: ErreurPeriodeInvalide.Periode, dates: PeriodeDates, bornes: ClosedRange<Date>
    ) -> some View {
        HStack(spacing: 12) {
            Text(titre)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.encre2)
                .frame(width: 100, alignment: .leading)
            DatePicker(
                "Début de la période \(periode.rawValue)",
                selection: liaison(dates, periode, debut: true),
                in: bornes,
                displayedComponents: .date
            )
            .labelsHidden()
            DatePicker(
                "Fin de la période \(periode.rawValue)",
                selection: liaison(dates, periode, debut: false),
                in: bornes,
                displayedComponents: .date
            )
            .labelsHidden()
        }
        .environment(\.timeZone, ModeleProgression.calendrierUTC.timeZone)
        .environment(\.calendar, ModeleProgression.calendrierUTC)
    }

    /// Lit une date de la période, et l'écrit en « Dates personnalisées » (03, P1).
    private func liaison(_ dates: PeriodeDates, _ periode: ErreurPeriodeInvalide.Periode, debut: Bool) -> Binding<Date> {
        Binding(
            get: { ModeleApercu.date(debut ? dates.debut : dates.fin) ?? Date() },
            set: { nouvelle in
                var modifiee = dates
                if debut {
                    modifiee.debut = ModeleProgression.civile(nouvelle)
                } else {
                    modifiee.fin = ModeleProgression.civile(nouvelle)
                }
                enregistrer(periode, modifiee)
            }
        )
    }

    private func enregistrer(_ periode: ErreurPeriodeInvalide.Periode, _ modifiee: PeriodeDates) {
        var dates = (try? periodes()) ?? DatesComparateur(a: .vide, b: .vide)
        if periode == .a {
            dates.a = modifiee
        } else {
            dates.b = modifiee
        }
        ecrireDates(dates)
        choixBrut = ChoixComparaison.personnalisees.rawValue
    }

    /// Choisir « Dates personnalisées » reprend les dates du préréglage en cours, pour les corriger.
    private func choisir(_ nouveau: ChoixComparaison) {
        if nouveau == .personnalisees, let dates = try? periodes() {
            ecrireDates(dates)
        }
        choixBrut = nouveau.rawValue
    }

    private func ecrireDates(_ dates: DatesComparateur) {
        guard let donnees = try? JSONEncoder().encode(dates), let texte = String(data: donnees, encoding: .utf8) else { return }
        datesBrut = texte
    }

    // MARK: - Contenu

    @ViewBuilder
    private var contenu: some View {
        switch resultat {
        case let .success(comparaison):
            VStack(alignment: .leading, spacing: 10) {
                if let partiel = ModeleProgression.texteHistoriquePartiel(comparaison) {
                    Text(partiel)
                        .font(.footnote)
                        .foregroundStyle(Ton.attention.couleur)
                }
                TableauComparaison(comparaison: comparaison)
                Text("Valeurs ramenées à la semaine. Vert : meilleur sur B ; orange : moins bon ; « = » : identique.")
                    .font(.caption)
                    .foregroundStyle(.encre3)
            }
        case let .failure(erreur as ErreurPeriodeInvalide):
            Text(ModeleProgression.messageErreur(erreur))
                .font(.footnote)
                .foregroundStyle(Ton.mauvais.couleur)
        case .failure:
            EtatVide(texte: "Impossible de comparer ces périodes pour le moment.")
        }
    }
}

private extension PeriodeDates {
    /// Période sans date, pour une liaison de saisie avant le premier calcul.
    static let vide = PeriodeDates(debut: "", fin: "")
}

/// Le tableau du comparateur : groupe, mesure, A, B, écart (03, P1). Les en-têtes A et B rappellent la plage et le
/// nombre de jours ; un filet sépare les groupes.
private struct TableauComparaison: View {
    let comparaison: Comparaison

    var body: some View {
        let groupes = ModeleProgression.groupes(comparaison)
        ScrollView(.horizontal) {
            Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 6) {
                GridRow {
                    Text("Mesure")
                    enTete("A", comparaison.a)
                    enTete("B", comparaison.b)
                    Text("Écart")
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.encre2)

                ForEach(groupes) { groupe in
                    GridRow {
                        Text(groupe.titre.uppercased())
                            .font(.caption2.weight(.semibold))
                            .tracking(1)
                            .foregroundStyle(.encre3)
                            .gridCellColumns(4)
                            .padding(.top, 10)
                    }
                    ForEach(groupe.lignes) { ligne in
                        GridRow {
                            Text(ligne.nom)
                                .font(.footnote)
                                .foregroundStyle(.encre)
                            Text(ligne.valeurA)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                            Text(ligne.valeurB)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                            Pastille(texte: ligne.ecart, ton: ligne.ton)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                        }
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(.encre)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(ligne.libelleAccessible)
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func enTete(_ titre: String, _ periode: PeriodeBornee) -> some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text(titre)
                .font(.caption.weight(.semibold))
            Text("\(ModeleProgression.texteDates(periode)) · \(Int(periode.jours)) j")
                .font(.caption2)
                .foregroundStyle(.encre3)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .accessibilityAddTraits(.isHeader)
    }
}

#Preview("Comparateur") {
    ScrollView {
        ComparateurView(calculs: .exemple)
            .padding(16)
    }
    .background(Color.fond)
}
