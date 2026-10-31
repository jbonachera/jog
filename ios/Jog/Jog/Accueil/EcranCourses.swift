// Écran Courses (N2 ; 03 N2 ; 02 « Filtre des courses », non mémorisé ; D-027 ; point de décision 14 ; docs/implementation/
// refonte-accueil.md, lot 16). En-tête du niveau, courbe des VDOT, filtre par distance, liste par année. Une ligne ouvre
// l'écran Séance. Ne lit que la Vue et `ModeleNiveau` ; les calculs sont mémorisés par Vue.
import SwiftUI
import Charts
import JogCore

struct EcranCourses: View {
    let vue: Vue
    /// Empile un écran de détail (la séance d'une course) dans la pile de l'onglet courant.
    let ouvrir: (Destination) -> Void
    @State private var filtre: ModeleNiveau.FiltreCourses = .toutes
    @State private var memo = Memo<Vue, Calculs?>()

    /// Ce qui ne dépend que de la Vue : l'en-tête, la courbe et la liste complète (filtrée ensuite par `ModeleNiveau`).
    private struct Calculs {
        let enTete: ModeleNiveau.EnTete
        let lignes: [LigneCourse]
        let courbe: ModeleNiveau.Courbe
        let compte: String
    }

    var body: some View {
        if let calculs = memo.valeur(pour: vue, calcul: { calcul() }) {
            let annees = ModeleNiveau.courses(calculs.lignes, filtre: filtre)
            VStack(alignment: .leading, spacing: 24) {
                enTete(calculs.enTete)
                courbe(calculs.courbe)

                VStack(alignment: .leading, spacing: 12) {
                    TitreSection(titre: "Courses", detail: calculs.compte)
                    Picker("Distance", selection: $filtre) {
                        ForEach(ModeleNiveau.FiltreCourses.allCases, id: \.self) { option in
                            Text(option.libelle).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()

                    if annees.isEmpty {
                        EtatVide(texte: "Aucune course ni test pour cette distance.")
                    }
                    ForEach(annees) { annee in
                        VStack(alignment: .leading, spacing: 8) {
                            TitreSection(titre: String(annee.annee))
                            ForEach(annee.lignes) { ligne in
                                ligneCourse(ligne)
                            }
                        }
                    }
                }
            }
        } else {
            ContentUnavailableView("Pas encore de courses", systemImage: "figure.run")
        }
    }

    /// La jauge du niveau : valeur, écart à il y a un an, et sa référence (N2).
    private func enTete(_ enTete: ModeleNiveau.EnTete) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            TitreSection(titre: enTete.titre)
            if let valeur = enTete.valeur {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(valeur)
                        .font(.largeTitle.weight(.heavy))
                        .monospacedDigit()
                        .foregroundStyle(.encre)
                    if let ecart = enTete.ecart {
                        Pastille(texte: ecart, ton: enTete.ton)
                    }
                }
                if let ilYAUnAn = enTete.ilYAUnAn {
                    Text("Il y a un an : \(ilYAUnAn)")
                        .font(.footnote)
                        .foregroundStyle(.encre2)
                }
            }
            if let sousTitre = enTete.sousTitre {
                Text(sousTitre)
                    .font(.caption)
                    .foregroundStyle(.encre3)
            }
        }
        .carte()
    }

    /// La courbe des VDOT, un point par course, avec la valeur d'il y a un an en repère.
    private func courbe(_ courbe: ModeleNiveau.Courbe) -> some View {
        Chart {
            if let reference = courbe.reference {
                RuleMark(y: .value("Il y a un an", reference))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
            }
            ForEach(Array(courbe.points.enumerated()), id: \.offset) { index, point in
                LineMark(x: .value("Course", index), y: .value("VDOT", point.vdot))
                    .foregroundStyle(Zone.sousSeuil.couleur)
                PointMark(x: .value("Course", index), y: .value("VDOT", point.vdot))
                    .foregroundStyle(Zone.sousSeuil.couleur)
            }
        }
        .chartXAxis(.hidden)
        .frame(height: 140)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Courbe des VDOT de tes courses et tests, \(courbe.points.count) points")
    }

    /// Une course : titre, date, temps, allure, VDOT, et une pastille quand elle détient le record de sa distance.
    /// Toucher la ligne ouvre l'écran Séance de la course.
    private func ligneCourse(_ ligne: ModeleNiveau.Ligne) -> some View {
        Button {
            ouvrir(.seance(cleSource: ligne.id))
        } label: {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(ligne.titre)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.encre)
                    Text(ligne.date)
                        .font(.caption)
                        .foregroundStyle(.encre3)
                }
                Spacer(minLength: 8)
                if ligne.record {
                    Pastille(texte: "Record", ton: .bon)
                }
                VStack(alignment: .trailing, spacing: 2) {
                    Text(ligne.temps)
                        .font(.subheadline)
                        .monospacedDigit()
                        .foregroundStyle(.encre)
                    Text("\(ligne.allure) · VDOT \(ligne.vdot)")
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(.encre2)
                }
            }
            .carte()
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ligne.accessibilite)
        .accessibilityHint("Ouvre le détail de la séance")
        .accessibilityAddTraits(.isButton)
    }

    /// Les calculs de la Vue, une fois : nil si le niveau ou les courses ne se calculent pas.
    private func calcul() -> Calculs? {
        guard
            let niveau = try? niveauVDOT(vue),
            let six = try? sixQualites(vue),
            let lignes = try? coursesEtTests(vue)
        else { return nil }
        return Calculs(
            enTete: ModeleNiveau.enTete(niveau, six),
            lignes: lignes,
            courbe: ModeleNiveau.courbe(lignes, ilYAUnAn: niveau.ilYAUnAn),
            compte: ModeleNiveau.titreCompte(lignes)
        )
    }
}

#Preview("Courses (maquette)") {
    NavigationStack {
        EcranCourses(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-30"), ouvrir: { _ in })
    }
}
