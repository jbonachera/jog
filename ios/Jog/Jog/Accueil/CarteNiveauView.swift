// Carte Niveau (N1 ; 03 N1 ; 04, « VDOT et niveau », « Six qualités » ; maquette `niveau` et `tip` ; D-027, D-028 ; lot 17).
// En-tête (VDOT, il y a un an, écart), radar hexagonal à 6 axes, légende, et une bulle par qualité touchée. Toucher ailleurs
// sur la carte ouvre Courses (N2). Aucun calcul ici : `ModeleNiveau.Calculs` vient de `CacheNiveau`, par Vue.
import SwiftUI
import JogCore

/// Un geste sur la carte Niveau, et sa transition pure : la bulle ouverte après le geste, et si le geste navigue.
enum GesteNiveau: Equatable {
    case toucheQualite(Qualite), toucheBulle, fermeBulle, toucheFond

    /// Toucher une qualité ouvre sa bulle (sans navigation). Toucher la bulle ne la ferme pas ; le ✕ la ferme. Toucher
    /// ailleurs sur la carte ouvre Courses (N2) et garde la bulle telle quelle.
    static func effet(_ geste: GesteNiveau, bulle: Qualite?) -> (bulle: Qualite?, navigue: Bool) {
        switch geste {
        case .toucheQualite(let qualite): (qualite, false)
        case .toucheBulle: (bulle, false)
        case .fermeBulle: (nil, false)
        case .toucheFond: (bulle, true)
        }
    }
}

struct CarteNiveauView: View {
    let calculs: ModeleNiveau.Calculs?
    /// Empile un écran de détail (Courses) dans la pile de l'onglet courant.
    let ouvrir: (Destination) -> Void
    @State private var bulle: Qualite?

    /// Dimensions du radar, mises à l'échelle du Dynamic Type (relatives à `caption`, comme les étiquettes) : à grande taille
    /// de texte, les étiquettes restent hors du polygone et ne débordent pas du radar. Valeurs par défaut en points.
    @ScaledMetric(relativeTo: .caption) private var hauteurRadar: CGFloat = 200
    /// Rayon de l'anneau extérieur, et écart entre lui et l'ancre des étiquettes.
    @ScaledMetric(relativeTo: .caption) private var rayon: CGFloat = 48
    @ScaledMetric(relativeTo: .caption) private var ecartEtiquette: CGFloat = 8
    /// Cadre d'une étiquette (largeur et hauteur prévues) : le texte s'y coupe en lignes, sans déborder.
    @ScaledMetric(relativeTo: .caption) private var largeurEtiquette: CGFloat = 76
    @ScaledMetric(relativeTo: .caption) private var hauteurEtiquette: CGFloat = 32

    var body: some View {
        if let calculs {
            VStack(alignment: .leading, spacing: 12) {
                enTete(calculs.enTete)
                radar(calculs.axes)
                legende
            }
            .carte()
            .contentShape(Rectangle())
            .onTapGesture { appliquer(.toucheFond) }
            .accessibilityAction(named: "Voir les courses et tests") { appliquer(.toucheFond) }
        } else {
            EtatVide(texte: "Niveau pas encore calculé.")
        }
    }

    /// Applique un geste à l'état de la bulle, et navigue vers Courses si le geste le demande.
    private func appliquer(_ geste: GesteNiveau) {
        let effet = GesteNiveau.effet(geste, bulle: bulle)
        bulle = effet.bulle
        if effet.navigue { ouvrir(.courses) }
    }

    // MARK: - En-tête

    /// « Niveau (VDOT) », le VDOT en grand, et à droite « Il y a un an » avec la valeur et l'écart en pastille (N1).
    private func enTete(_ enTete: ModeleNiveau.EnTete) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            TitreSection(titre: enTete.titre)
            if let valeur = enTete.valeur {
                HStack(alignment: .top, spacing: 12) {
                    Text(valeur)
                        .font(.largeTitle.weight(.heavy))
                        .monospacedDigit()
                        .foregroundStyle(.encre)
                        .fixedSize(horizontal: true, vertical: false)
                    Spacer(minLength: 8)
                    if let ilYAUnAn = enTete.ilYAUnAn {
                        VStack(alignment: .trailing, spacing: 4) {
                            Text("Il y a un an")
                                .font(.caption)
                                .foregroundStyle(.encre3)
                            HStack(spacing: 6) {
                                Text(ilYAUnAn)
                                    .font(.subheadline)
                                    .monospacedDigit()
                                    .foregroundStyle(.encre2)
                                if let ecart = enTete.ecart {
                                    Pastille(texte: ecart, ton: enTete.ton)
                                }
                            }
                        }
                    }
                }
            }
            if let sousTitre = enTete.sousTitre {
                Text(sousTitre)
                    .font(.caption)
                    .foregroundStyle(.encre3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - Radar

    /// Rayon effectif de l'anneau extérieur : le rayon mis à l'échelle, réduit si les étiquettes des côtés (sur l'ancre, à
    /// `largeur` de large) sortiraient de la largeur du radar. Le polygone et les étiquettes suivent ce même rayon.
    static func rayonEffectif(rayon: CGFloat, ecart: CGFloat, largeur: CGFloat, largeurRadar: CGFloat, nombre: Int) -> CGFloat {
        let dxMax = (0..<max(nombre, 0)).map { abs(ModeleNiveau.direction($0, sur: nombre).dx) }.max() ?? 0
        guard dxMax > 0.3 else { return rayon }
        let plafond = (largeurRadar / 2 - largeur) / dxMax - ecart
        return max(0, min(rayon, plafond))
    }

    /// Cadres des étiquettes des `nombre` axes (position et taille), dans un radar de `largeurRadar` × `hauteurRadar` dont le
    /// centre est au milieu. Côté droit, le bord gauche de l'étiquette est sur l'ancre ; côté gauche, son bord droit ; au-dessus,
    /// son bord bas ; au-dessous, son bord haut ; sinon centrée. Fonction pure : la vue n'y met aucun calcul.
    static func cadresEtiquettes(
        rayon: CGFloat, ecart: CGFloat, largeur: CGFloat, hauteur: CGFloat,
        largeurRadar: CGFloat, hauteurRadar: CGFloat, nombre: Int
    ) -> [CGRect] {
        let centre = CGPoint(x: largeurRadar / 2, y: hauteurRadar / 2)
        return (0..<max(nombre, 0)).map { i in
            let direction = ModeleNiveau.direction(i, sur: nombre)
            let distance = rayon + ecart
            let ancre = CGPoint(x: centre.x + distance * direction.dx, y: centre.y + distance * direction.dy)
            let x: CGFloat = direction.dx > 0.3 ? ancre.x : direction.dx < -0.3 ? ancre.x - largeur : ancre.x - largeur / 2
            let y: CGFloat = direction.dy < -0.9 ? ancre.y - hauteur : direction.dy > 0.9 ? ancre.y : ancre.y - hauteur / 2
            return CGRect(x: x, y: y, width: largeur, height: hauteur)
        }
    }

    /// Le radar : anneaux à 25, 50, 75 et 100 % (l'anneau du milieu, l'an dernier, en `ink-2`), rayons, polygone actuel en
    /// accent à aire teinte, étiquettes des axes (boutons) et, au-dessus, la bulle de la qualité touchée.
    private func radar(_ axes: [ModeleNiveau.Axe]) -> some View {
        GeometryReader { geometrie in
            let centre = CGPoint(x: geometrie.size.width / 2, y: geometrie.size.height / 2)
            let rayonRadar = Self.rayonEffectif(
                rayon: rayon, ecart: ecartEtiquette, largeur: largeurEtiquette,
                largeurRadar: geometrie.size.width, nombre: axes.count
            )
            let cadres = Self.cadresEtiquettes(
                rayon: rayonRadar, ecart: ecartEtiquette, largeur: largeurEtiquette, hauteur: hauteurEtiquette,
                largeurRadar: geometrie.size.width, hauteurRadar: hauteurRadar, nombre: axes.count
            )
            ZStack {
                Canvas { contexte, _ in
                    dessinerRadar(axes, centre: centre, rayon: rayonRadar, contexte: contexte)
                }
                .accessibilityHidden(true)

                ForEach(Array(axes.enumerated()), id: \.element.id) { index, axe in
                    EtiquetteAxe(axe: axe, actif: bulle == axe.id, largeur: largeurEtiquette) {
                        appliquer(.toucheQualite(axe.id))
                    }
                    .frame(height: hauteurEtiquette)
                    .position(x: cadres[index].midX, y: cadres[index].midY)
                }

                if let ouverte = axes.first(where: { $0.id == bulle }) {
                    // La zone de toucher de la bulle est la bulle elle-même : le cadre plein du radar ne capte rien.
                    BulleNiveauView(axe: ouverte) { appliquer(.fermeBulle) }
                        .contentShape(Rectangle())
                        .onTapGesture { appliquer(.toucheBulle) }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                        .padding(.bottom, 2)
                        .transition(.opacity)
                }
            }
            .frame(width: geometrie.size.width, height: geometrie.size.height)
        }
        .frame(height: hauteurRadar)
        .animation(.easeOut(duration: 0.15), value: bulle)
    }

    private func dessinerRadar(_ axes: [ModeleNiveau.Axe], centre: CGPoint, rayon: CGFloat, contexte: GraphicsContext) {
        func polygone(_ points: [CGPoint]) -> Path {
            var chemin = Path()
            guard let premier = points.first else { return chemin }
            chemin.move(to: premier)
            points.dropFirst().forEach { chemin.addLine(to: $0) }
            chemin.closeSubpath()
            return chemin
        }
        let nombre = axes.count
        for fraction in [0.25, 0.5, 0.75, 1.0] {
            let anneau = ModeleNiveau.anneau(fraction, centre: centre, rayon: rayon, nombre: nombre)
            if fraction == 1.0 {
                contexte.fill(polygone(anneau), with: .color(Color.bande))
            }
            let trait = fraction == 0.5 ? Color.encre2 : Color.grille
            contexte.stroke(polygone(anneau), with: .color(trait), lineWidth: fraction == 0.5 ? 1.4 : 1)
        }
        for i in 0..<nombre {
            var segment = Path()
            segment.move(to: centre)
            segment.addLine(to: ModeleNiveau.anneau(1.0, centre: centre, rayon: rayon, nombre: nombre)[i])
            contexte.stroke(segment, with: .color(Color.grille), lineWidth: 1)
        }
        let actuel = ModeleNiveau.sommets(axes, centre: centre, rayon: rayon)
        contexte.fill(polygone(actuel), with: .color(Color.accentFjord.opacity(0.22)))
        contexte.stroke(polygone(actuel), with: .color(Color.accentFjord), style: StrokeStyle(lineWidth: 2, lineJoin: .round))
        for sommet in actuel {
            contexte.fill(Path(ellipseIn: CGRect(x: sommet.x - 2.6, y: sommet.y - 2.6, width: 5.2, height: 5.2)),
                          with: .color(Color.accentFjord))
        }
    }

    /// Légende : « Il y a un an » (ligne `ink-2`) et « Maintenant » (accent).
    private var legende: some View {
        HStack(spacing: 16) {
            Label {
                Text("Il y a un an")
            } icon: {
                Capsule().fill(Color.encre2).frame(width: 14, height: 3)
            }
            Label {
                Text("Maintenant")
            } icon: {
                Capsule().fill(Color.accentFjord).frame(width: 14, height: 3)
            }
        }
        .font(.caption)
        .foregroundStyle(.encre2)
        .accessibilityHidden(true)
    }
}

/// Étiquette d'un axe : nom et écart dans son unité, en bouton. Le nom touché (ou bulle ouverte) passe en accent.
/// Sa hauteur est fixée par la carte (`CarteNiveauView`) : ici, seule la largeur est imposée, la hauteur rendue reste celle du texte.
struct EtiquetteAxe: View {
    let axe: ModeleNiveau.Axe
    let actif: Bool
    let largeur: CGFloat
    let toucher: () -> Void

    /// Ce que VoiceOver lit de l'axe : son accessibilité du lot 15.
    static func lecture(_ axe: ModeleNiveau.Axe) -> String {
        axe.accessibilite
    }

    var body: some View {
        Button(action: toucher) {
            VStack(spacing: 1) {
                Text(axe.nom)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(actif ? Color.accentFjord : Color.encre)
                    .fixedSize(horizontal: false, vertical: true)
                Text(axe.ecart)
                    .font(.caption2.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(axe.ton.couleur)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .multilineTextAlignment(.center)
            .frame(width: largeur)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Self.lecture(axe))
        .accessibilityHint("Ouvre la bulle de la qualité")
        .accessibilityAddTraits(actif ? .isSelected : [])
    }
}

/// Bulle d'une qualité (maquette `tip`) : fond encre, texte inversé. Nom, mesure, écart face à il y a un an, et ✕.
struct BulleNiveauView: View {
    let axe: ModeleNiveau.Axe
    let ferme: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(axe.nom)
                    .font(.subheadline.weight(.bold))
                Spacer(minLength: 8)
                Button(action: ferme) {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Fermer")
            }
            Text(axe.mesure)
                .font(.caption)
                .fixedSize(horizontal: false, vertical: true)
            Text(axe.comparaison)
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(Color.fond)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.encre))
        .accessibilityElement(children: .contain)
    }
}

#Preview("Niveau (maquette)") {
    let vue = (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-30")
    ScrollView {
        CarteNiveauView(calculs: CacheNiveau().calculs(vue), ouvrir: { _ in })
            .padding(16)
    }
    .background(Color.fond)
}
