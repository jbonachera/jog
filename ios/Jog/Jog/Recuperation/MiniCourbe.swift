import SwiftUI

/// Mini-courbe d'une tuile de A5 (maquette, « spark ») : les 14 dernières moyennes sur 7 nuits, tracées sur la bande de
/// norme. Une valeur absente coupe la courbe. Sans bande (norme pas encore calculée), la courbe seule.
/// Décorative : la tuile porte déjà sa valeur et sa norme en texte.
struct MiniCourbe: View {
    let valeurs: [Double?]
    let bandeBas: Double?
    let bandeHaut: Double?

    var body: some View {
        Canvas { contexte, taille in
            let extremes = valeurs.compactMap { $0 } + [bandeBas, bandeHaut].compactMap { $0 }
            guard let bas = extremes.min(), let haut = extremes.max() else { return }
            let etendue = max(haut - bas, 1e-9)
            let y = { (v: Double) -> CGFloat in
                taille.height - 3 - CGFloat((v - bas) / etendue) * (taille.height - 6)
            }
            let pas = valeurs.count > 1 ? (taille.width - 4) / CGFloat(valeurs.count - 1) : 0
            let x = { (i: Int) -> CGFloat in 2 + CGFloat(i) * pas }

            if let bandeBas, let bandeHaut {
                let rectangle = CGRect(x: 0, y: y(bandeHaut), width: taille.width, height: y(bandeBas) - y(bandeHaut))
                contexte.fill(Path(rectangle), with: .color(Color.bande))
            }

            var chemin = Path()
            var suite = false
            for (i, valeur) in valeurs.enumerated() {
                guard let valeur else {
                    suite = false
                    continue
                }
                let point = CGPoint(x: x(i), y: y(valeur))
                if suite {
                    chemin.addLine(to: point)
                } else {
                    chemin.move(to: point)
                }
                suite = true
            }
            contexte.stroke(
                chemin, with: .color(Color.accentFjord),
                style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round)
            )
        }
        .accessibilityHidden(true)
    }
}
