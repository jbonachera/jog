// Grammaire éditoriale de l'écran Séance (S3, D-034) : filet, duo, barre empilée, courbe au fil de la distance, tableau
// des tours. Aucun cadre : les blocs se suivent, ouverts par un filet.
import Charts
import SwiftUI
import JogCore

/// Filet : trait `ink` de 1 pt, titre en capitales à gauche, contexte à droite.
struct Filet: View {
    let titre: String
    var contexte: String?

    var body: some View {
        VStack(spacing: 10) {
            Rectangle().fill(.encre).frame(height: 1)
            TitreSection(titre: titre, detail: contexte)
        }
        .padding(.top, 26)
    }
}

/// Duo : grille de deux colonnes de chiffres (30 pt) avec libellé et écart, filets `Ligne`.
struct Duo: View {
    struct Case: Identifiable {
        let libelle: String
        let valeur: String
        var detail: String?
        var bon = false
        var id: String { libelle }
    }
    let cases: [Case]

    var body: some View {
        Grid(horizontalSpacing: 0, verticalSpacing: 0) {
            ForEach(Array(stride(from: 0, to: cases.count, by: 2)), id: \.self) { i in
                GridRow {
                    cellule(cases[i])
                    if i + 1 < cases.count {
                        cellule(cases[i + 1]).padding(.leading, 14)
                            .overlay(alignment: .leading) { Rectangle().fill(.ligne).frame(width: 1) }
                    } else {
                        Color.clear
                    }
                }
                .overlay(alignment: .bottom) { Rectangle().fill(.ligne).frame(height: 1) }
            }
        }
    }

    private func cellule(_ c: Case) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(c.libelle).font(.caption).foregroundStyle(.encre2)
            Text(c.valeur).font(.system(size: 30, weight: .bold, design: .rounded)).tracking(-0.9).foregroundStyle(.encre)
            if let d = c.detail { Text(d).font(.caption).foregroundStyle(c.bon ? Ton.bon.couleur : .encre2) }
        }
        .monospacedDigit()
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 14)
        .accessibilityElement(children: .combine)
    }
}

/// Barre empilée : parts (somme 1) avec leur couleur et leur nom, puis la légende.
struct BarreEmpilee: View {
    let parts: [(nom: String, couleur: Color, part: Double)]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { g in
                HStack(spacing: 2) {
                    ForEach(parts.indices.filter { parts[$0].part > 0 }, id: \.self) { i in
                        parts[i].couleur.frame(width: max(0, g.size.width * parts[i].part - 2))
                    }
                }
            }
            .frame(height: 12)
            .clipShape(Capsule())
            HStack(spacing: 14) {
                ForEach(parts.indices, id: \.self) { i in
                    Label {
                        Text("\(parts[i].nom) **\(Int((parts[i].part * 100).rounded())) %**")
                    } icon: {
                        RoundedRectangle(cornerRadius: 2).fill(parts[i].couleur).frame(width: 10, height: 10)
                    }
                    .font(.caption)
                    .foregroundStyle(.encre2)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Courbe au fil de la distance (allure, FC, altitude) avec réticule. Allures en s/km, axe inversé (plus rapide en haut).
struct CourbeDistance: View {
    struct Serie {
        let nom: String
        let valeurs: [(km: Double, v: Double)]
        var pointille = false
        var couleur: Color = .accentFjord
    }
    let series: [Serie]
    var allure = false
    var aire = false
    var repere: (valeur: Double, texte: String)?
    var plages: [ClosedRange<Double>] = []
    var hauteur: CGFloat = 100
    let description: String
    @State private var km: Double?

    var body: some View {
        graphique
    }

    /// Vue tableau (D-011) : une ligne par kilomètre, la valeur du point le plus proche de chaque série.
    private var tableau: TableauAffiche {
        let fin = Int(series.first?.valeurs.last?.km ?? 0)
        let lignes = (fin > 0 ? Array(1...fin) : []).map { k in
            ["\(k)"] + series.map { s in
                s.valeurs.min(by: { abs($0.km - Double(k)) < abs($1.km - Double(k)) }).map { texte($0.v) } ?? "—"
            }
        }
        return TableauAffiche(entetes: ["km"] + series.map(\.nom), lignes: lignes)
    }

    private var graphique: some View {
        Chart {
            ForEach(plages.indices, id: \.self) { i in
                RectangleMark(xStart: .value("km", plages[i].lowerBound), xEnd: .value("km", plages[i].upperBound))
                    .foregroundStyle(.bande)
            }
            ForEach(series.indices, id: \.self) { s in
                let serie = series[s]
                ForEach(serie.valeurs.indices, id: \.self) { i in
                    let p = serie.valeurs[i]
                    if aire {
                        AreaMark(x: .value("km", p.km), y: .value(serie.nom, p.v))
                            .foregroundStyle(.grille)
                    }
                    LineMark(x: .value("km", p.km), y: .value(serie.nom, p.v), series: .value("série", serie.nom))
                        .foregroundStyle(serie.couleur)
                        .lineStyle(StrokeStyle(lineWidth: serie.pointille ? 1.5 : 2, dash: serie.pointille ? [4, 3] : []))
                }
            }
            if let repere {
                RuleMark(y: .value("repère", repere.valeur))
                    .foregroundStyle(Ton.mauvais.couleur)
                    .lineStyle(StrokeStyle(lineWidth: 1.2, dash: [4, 3]))
                    .annotation(position: .top, alignment: .trailing) {
                        Text(repere.texte).font(.caption2.monospacedDigit()).foregroundStyle(.encre2)
                    }
            }
            if let km, let p = series.first?.valeurs.min(by: { abs($0.km - km) < abs($1.km - km) }) {
                RuleMark(x: .value("km", p.km))
                    .foregroundStyle(.encre2)
                    .annotation(position: .top, overflowResolution: .init(x: .fit, y: .disabled)) {
                        Text("\(ModeleApercu.nombre(p.km, 1)) km · \(texte(p.v))")
                            .font(.caption2.monospacedDigit())
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(RoundedRectangle(cornerRadius: 6).fill(.encre))
                            .foregroundStyle(.fond)
                    }
            }
        }
        .chartYScale(domain: .automatic(includesZero: false, reversed: allure))
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { v in
                AxisGridLine().foregroundStyle(.grille)
                AxisValueLabel { if let d = v.as(Double.self) { Text(texte(d)) } }
            }
        }
        .chartXSelection(value: $km)
        .frame(height: hauteur)
        .accessibilityLabel(description)
    }

    private func texte(_ v: Double) -> String { allure ? formatAllure(v) : "\(Int(v.rounded()))" }
}

/// Tableau des tours ou des répétitions : colonnes chiffrées, une cellule peut être mise en avant (`Attention` ou accent).
struct TableauTours: View {
    struct Cellule {
        let texte: String
        var ton: Ton?
    }
    let entetes: [String]
    let lignes: [[Cellule]]

    var body: some View {
        Grid(alignment: .trailing, horizontalSpacing: 12, verticalSpacing: 8) {
            GridRow {
                ForEach(entetes, id: \.self) { Text($0) }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.encre2)
            Divider().overlay(.ligne)
            ForEach(lignes.indices, id: \.self) { i in
                GridRow {
                    ForEach(lignes[i].indices, id: \.self) { j in
                        let c = lignes[i][j]
                        Text(c.texte).foregroundStyle(c.ton?.couleur ?? .encre).fontWeight(c.ton == nil ? .regular : .semibold)
                    }
                }
                .font(.subheadline.monospacedDigit())
            }
        }
    }
}

/// Tracé GPS dessiné comme une ligne sur une grille, sans fond de carte (D-034). Coloré par l'allure sur 4 classes (plus
/// rapide = plus intense), ou bicolore quand `enRepetition` est donné ; départ en `Bon`, bornes kilométriques.
struct TraceView: View {
    let points: [PointTrace]
    var enRepetition: ((Double) -> Bool)?

    private static let rampe: [Color] = [Zone.facile.couleur, Zone.marathon.couleur, Zone.sousSeuil.couleur, Zone.auDessus.couleur]

    var body: some View {
        let allures = points.compactMap(\.allure_skm).sorted()
        // Bornes à 5 % et 95 % : un arrêt ou un sprint ne tasse pas les classes.
        let lent = allures.isEmpty ? 0 : allures[allures.count * 95 / 100]
        let vite = allures.isEmpty ? 0 : allures[allures.count * 5 / 100]
        VStack(alignment: .leading, spacing: 8) {
            Canvas { ctx, taille in
                let pas: CGFloat = 24
                var grille = Path()
                for x in stride(from: 0, through: taille.width, by: pas) { grille.move(to: .init(x: x, y: 0)); grille.addLine(to: .init(x: x, y: taille.height)) }
                for y in stride(from: 0, through: taille.height, by: pas) { grille.move(to: .init(x: 0, y: y)); grille.addLine(to: .init(x: taille.width, y: y)) }
                ctx.stroke(grille, with: .color(.grille), lineWidth: 1)

                let xs = points.map(\.x), ys = points.map(\.y)
                guard let x0 = xs.min(), let x1 = xs.max(), let y0 = ys.min(), let y1 = ys.max() else { return }
                let marge: CGFloat = 14
                let echelle = min((taille.width - 2 * marge) / max(x1 - x0, 1), (taille.height - 2 * marge) / max(y1 - y0, 1))
                let dx = (taille.width - (x1 - x0) * echelle) / 2, dy = (taille.height - (y1 - y0) * echelle) / 2
                func ecran(_ p: PointTrace) -> CGPoint { .init(x: dx + (p.x - x0) * echelle, y: taille.height - dy - (p.y - y0) * echelle) }

                for (a, b) in zip(points, points.dropFirst()) {
                    var segment = Path()
                    segment.move(to: ecran(a)); segment.addLine(to: ecran(b))
                    ctx.stroke(segment, with: .color(couleur(b, vite: vite, lent: lent)), style: .init(lineWidth: 4, lineCap: .round))
                }
                // Une borne par km ; tous les 2 km au-delà de 12 km, tous les 5 au-delà de 25.
                let total = points.last?.km ?? 0
                let pasKm = total > 25 ? 5.0 : total > 12 ? 2 : 1
                var borne = pasKm
                for p in points where p.km >= borne {
                    let c = ecran(p)
                    ctx.fill(Path(ellipseIn: .init(x: c.x - 7, y: c.y - 7, width: 14, height: 14)), with: .color(.fond))
                    ctx.draw(Text("\(Int(borne))").font(.system(size: 9, weight: .semibold).monospacedDigit()).foregroundStyle(.encre), at: c)
                    borne += pasKm
                }
                if let depart = points.first {
                    let c = ecran(depart)
                    ctx.fill(Path(ellipseIn: .init(x: c.x - 6, y: c.y - 6, width: 12, height: 12)), with: .color(Ton.bon.couleur))
                }
            }
            .frame(height: 220)
            .accessibilityLabel("Tracé de la séance, coloré par l'allure")
            legende(vite: vite, lent: lent)
        }
    }

    private func couleur(_ p: PointTrace, vite: Double, lent: Double) -> Color {
        if let enRepetition { return enRepetition(p.t_s) ? Zone.auDessus.couleur : Zone.facile.couleur }
        guard let a = p.allure_skm, lent > vite else { return Self.rampe[0] }
        return Self.rampe[min(3, max(0, Int((lent - a) / (lent - vite) * 4)))]
    }

    @ViewBuilder private func legende(vite: Double, lent: Double) -> some View {
        HStack(spacing: 6) {
            if enRepetition != nil {
                case_(Zone.auDessus.couleur, "répétitions")
                case_(Zone.facile.couleur, "le reste")
            } else {
                ForEach(Self.rampe.indices, id: \.self) { RoundedRectangle(cornerRadius: 2).fill(Self.rampe[$0]).frame(width: 10, height: 10) }
                Text("\(formatAllure(lent)) → \(formatAllure(vite)) /km")
            }
            Spacer()
            case_(Ton.bon.couleur, "départ")
        }
        .font(.caption.monospacedDigit())
        .foregroundStyle(.encre2)
    }

    private func case_(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 4) { Circle().fill(c).frame(width: 8, height: 8); Text(t) }
    }
}
