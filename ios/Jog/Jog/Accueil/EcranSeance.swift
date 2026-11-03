// Écran Séance (S3 ; 03 S3 ; D-020 pour le marquage ; D-033 pour le rechargement ; D-034 pour la mise en page éditoriale).
// Un récit à lire de haut en bas : surtitre et verdict, chiffre héros, phrase, puis des blocs du type ouverts par un filet,
// et la source. Le résumé (Vue) s'affiche tout de suite ; le détail (courbes, tours) vient du flux relu dans Santé.
// Tracé et cadence viennent aussi du flux relu ; sans GPS ou sans pas, leur bloc disparaît.
import Charts
import SwiftUI
import JogCore

struct EcranSeance: View {
    let vue: Vue
    let cleSource: String
    /// Marquage d'une séance (D-020) : clé source, puis marquage à enregistrer (nil pour retirer le marquage saisi).
    let surMarquage: (String, MarquageUtilisateur?) -> Void
    /// Cartes de l'app : la carte de la séance s'y lit, sans reconstruire l'historique.
    let cartes: CacheCartes
    @State private var memo = Memo<CleEcran, Contenu?>()
    @Environment(ModeleApp.self) private var modele
    /// Rechargement de cette séance en cours : le récit est estompé (D-033).
    @State private var rechargement = false
    @State private var detail: DetailSeance?

    private struct CleEcran: Equatable {
        let vue: Vue
        let cleSource: String
    }

    /// Ce que l'écran lit de la Vue : séance, écran S3, niveau de la veille et record de la distance (course).
    private struct Contenu {
        let seance: SeanceVue
        let ecran: ModeleSeances.Ecran
        let params: ParamsDates
        let niveau: Double?
        /// Meilleur temps (s) de la distance, et vrai si c'est cette course.
        let record: (temps_s: Double, nouveau: Bool)?
        /// Part (0–1) du temps de la semaine passée en sous-seuil (séances à répétitions).
        var partSemaine: Double?
    }

    var body: some View {
        if let c = memo.valeur(pour: CleEcran(vue: vue, cleSource: cleSource), calcul: calcul) {
            let famille = ModeleRecit.famille(c.seance.type)
            let recit = ModeleRecit.recit(c.seance, c.params, niveau: c.niveau, moities: detail?.moities)
            VStack(alignment: .leading, spacing: 0) {
                entete(recit, c.ecran.carte)
                    .opacity(rechargement ? 0.4 : 1)
                if let d = detail, d.trace.count > 1 {
                    TraceView(points: d.trace, enRepetition: famille == .repetitions ? enRepetition(c.seance) : nil)
                        .padding(.top, 18)
                }
                Group {
                    switch famille {
                    case .footing: footing(c)
                    case .repetitions: repetitions(c)
                    case .course: course(c)
                    case .sortieLongue: sortieLongue(c)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                source(c.ecran)
            }
            .task(id: CleEcran(vue: vue, cleSource: cleSource)) {
                detail = await modele.detail(cleSource: cleSource, type: c.seance.type)
            }
            .toolbar { menu(c.seance, titre: c.ecran.carte.titre) }
        } else {
            ContentUnavailableView("Séance introuvable", systemImage: "questionmark.circle")
        }
    }

    // MARK: - Tronc commun

    private func entete(_ r: ModeleRecit.Recit, _ carte: ModeleSeances.Carte) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(r.surtitre)
                    .font(.footnote.weight(.semibold)).textCase(.uppercase).tracking(1).foregroundStyle(.encre2)
                Spacer(minLength: 8)
                Pastille(texte: carte.verdict, ton: carte.ton)
            }
            ViewThatFits(in: .horizontal) {
                ForEach([104.0, 88, 72], id: \.self) { taille in
                    heros(r, taille: r.heros.count > 5 ? min(taille, 88) : taille)
                }
            }
            Text(LocalizedStringKey(r.phrase))
                .font(.system(size: 19, weight: .medium)).foregroundStyle(.encre2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func heros(_ r: ModeleRecit.Recit, taille: CGFloat) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(r.heros).font(.system(size: taille, weight: .heavy, design: .rounded)).tracking(-0.06 * taille)
            if let u = r.unite { Text(u).font(.system(size: 30, weight: .semibold)).foregroundStyle(.encre3) }
        }
        .foregroundStyle(.encre).monospacedDigit().lineLimit(1).fixedSize()
        .accessibilityElement(children: .combine)
    }

    private func jauges(_ c: Contenu, contexte: String = "face à ton habitude") -> some View {
        Group {
            Filet(titre: "Jauges", contexte: contexte)
            ForEach(c.ecran.carte.jauges) { ligne in
                LigneJaugeView(ligne: ligne).padding(.vertical, 12)
                    .overlay(alignment: .bottom) { Rectangle().fill(.ligne).frame(height: 1) }
            }
        }
    }

    private func source(_ e: ModeleSeances.Ecran) -> some View {
        Group {
            Filet(titre: "Source")
            VStack(alignment: .leading, spacing: 8) {
                LabeledContent("Lue dans Santé", value: rechargement ? "en cours…" : lueLe)
                if let fcMax = e.fcMax { LabeledContent("Calculée avec", value: "FC max \(fcMax)") }
            }
            .font(.subheadline).foregroundStyle(.encre).padding(.top, 8)
        }
    }

    // MARK: - Footing

    @ViewBuilder private func footing(_ c: Contenu) -> some View {
        let s = c.seance, cap = c.params.easyCap
        jauges(c)
        if let d = detail {
            Filet(titre: "Plafond facile", contexte: "FC au fil de la distance")
            CourbeDistance(
                series: [.init(nom: "FC", valeurs: serie(d, \.fc))], repere: (cap, "plafond \(Int(cap))"), hauteur: 110,
                description: "FC au fil de la distance, plafond facile à \(Int(cap)) bpm"
            )
            if let part = d.partSousPlafond {
                BarreEmpilee(parts: [("Sous le plafond", Zone.facile.couleur, part), ("Au-dessus", Zone.marathon.couleur, 1 - part)])
                    .padding(.top, 12)
            }
        }
        Filet(titre: "Les chiffres")
        Duo(cases: chiffres(s, ajustee: detail.flatMap(ajusteeMoyenne), cadence: detail?.cadence))
        if let d = detail {
            Filet(titre: "Allure", contexte: "stable si la ligne est plate")
            CourbeDistance(series: [.init(nom: "Allure", valeurs: serie(d, \.allure_skm))], allure: true, hauteur: 90,
                           description: "Allure au fil de la distance")
            Filet(titre: "Les tours")
            TableauTours(entetes: ["km", "Allure", "FC", "D+"], lignes: d.tours.map { t in
                [.init(texte: km(t.km)), .init(texte: formatAllure(t.allure_skm)),
                 .init(texte: t.fc.map { "\(Int($0.rounded()))" } ?? "—", ton: (t.fc ?? 0) > cap ? .attention : nil),
                 .init(texte: t.dPlus_m.map { "\(Int($0.rounded()))" } ?? "—")]
            })
        }
    }

    // MARK: - Sous-seuil et séance qualité

    @ViewBuilder private func repetitions(_ c: Contenu) -> some View {
        let s = c.seance, p = c.params
        let reps = s.repetitions.filter { $0.fcFin.isFinite }
        if !reps.isEmpty {
            Filet(titre: "FC de fin de répétition", contexte: "bande de sous-seuil \(Int(p.subtHrLo))–\(Int(p.subtHrHi))")
            Chart {
                RectangleMark(yStart: .value("bas", p.subtHrLo), yEnd: .value("haut", p.subtHrHi)).foregroundStyle(.bande)
                RuleMark(y: .value("seuil", p.lt2Hr))
                    .foregroundStyle(Ton.mauvais.couleur).lineStyle(StrokeStyle(lineWidth: 1.2, dash: [4, 3]))
                    .annotation(position: .top, alignment: .trailing) {
                        Text("seuil \(Int(p.lt2Hr))").font(.caption2).foregroundStyle(.encre2)
                    }
                ForEach(reps, id: \.n) { r in
                    let dans = (p.subtHrLo...p.subtHrHi).contains(r.fcFin)
                    RuleMark(x: .value("rép", "R\(Int(r.n))"), yStart: .value("bas", p.subtHrLo - 10), yEnd: .value("FC", r.fcFin))
                        .foregroundStyle(.ligne).lineStyle(StrokeStyle(lineWidth: 2))
                    PointMark(x: .value("rép", "R\(Int(r.n))"), y: .value("FC", r.fcFin))
                        .foregroundStyle(dans ? Color.accentFjord : Ton.attention.couleur).symbolSize(120)
                        .annotation(position: .top) { Text("\(Int(r.fcFin))").font(.caption2.monospacedDigit()).foregroundStyle(.encre) }
                }
            }
            .chartYScale(domain: .automatic(includesZero: false))
            .frame(height: 150)
            .accessibilityLabel("FC de fin de chaque répétition")
        }
        jauges(c)
        if let tableau = c.ecran.tableau {
            Filet(titre: "Les répétitions")
            TableauVue(tableau: tableau)
        }
        if let d = detail {
            let plages = s.repetitions.compactMap { r in kmPlage(d, s, r) }
            Filet(titre: "Allure et FC", contexte: "répétitions en bande")
            CourbeDistance(series: [.init(nom: "Allure", valeurs: serie(d, \.allure_skm))], allure: true, plages: plages,
                           description: "Allure au fil de la distance, répétitions surlignées")
            CourbeDistance(series: [.init(nom: "FC", valeurs: serie(d, \.fc))], repere: (p.lt2Hr, "seuil \(Int(p.lt2Hr))"),
                           plages: plages, description: "FC au fil de la distance, seuil à \(Int(p.lt2Hr)) bpm")
                .padding(.top, 12)
        }
        Filet(titre: "Les chiffres")
        let cases: [Duo.Case?] = [
            .init(libelle: "Total", valeur: "\(km(s.km)) km", detail: ModeleSeances.duree(s.duree_min)),
            .init(libelle: "Sous-seuil", valeur: "\(Int(s.minutes.subt.rounded()))′"),
            .init(libelle: "Charge", valeur: "\(Int(s.charge.rounded()))"),
            c.partSemaine.map { .init(libelle: "Part de la semaine", valeur: "\(Int(($0 * 100).rounded())) %", detail: "du temps en sous-seuil") },
        ]
        Duo(cases: cases.compactMap { $0 })
    }

    // MARK: - Course et test

    @ViewBuilder private func course(_ c: Contenu) -> some View {
        let s = c.seance
        jauges(c, contexte: "face à ton niveau la veille")
        if let d = detail, !d.tours.isEmpty {
            let moyenne = (s.temps_s ?? s.duree_min * 60) / s.km
            Filet(titre: "Gestion de course", contexte: "allure par km")
            Chart {
                ForEach(d.tours, id: \.km) { t in
                    BarMark(x: .value("km", km(t.km)), y: .value("allure", t.allure_skm))
                        .foregroundStyle(t.allure_skm < moyenne ? Color.accentFjord : Zone.facile.couleur)
                }
                RuleMark(y: .value("moyenne", moyenne))
                    .foregroundStyle(.encre2).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .annotation(position: .top, alignment: .trailing) {
                        Text("moyenne \(formatAllure(moyenne))").font(.caption2).foregroundStyle(.encre2)
                    }
            }
            .chartYScale(domain: .automatic(includesZero: false))
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { v in
                    AxisGridLine().foregroundStyle(.grille)
                    AxisValueLabel { if let x = v.as(Double.self) { Text(formatAllure(x)) } }
                }
            }
            .frame(height: 150)
            .accessibilityLabel("Allure par kilomètre")
            if let m = d.moities {
                Duo(cases: [
                    .init(libelle: "1re moitié", valeur: formatTempsCourse(m.s1), detail: "\(formatAllure(m.s1 / (s.km / 2)))/km"),
                    .init(libelle: "2de moitié", valeur: formatTempsCourse(m.s2),
                          detail: "\(formatAllure(m.s2 / (s.km / 2)))/km\(m.s2 < m.s1 ? " · négatif" : "")", bon: m.s2 < m.s1),
                ])
            }
        }
        if let ref = s.distanceRef_km, let temps = s.temps_s {
            Filet(titre: "Équivalences", contexte: "de cette course")
            Duo(cases: ModeleRecit.equivalences(km: ref, temps_s: temps).map { .init(libelle: $0.0, valeur: $0.1) }
                + (c.record.map { r in
                    [.init(libelle: "Record \(km(ref)) km", valeur: formatTempsCourse(r.temps_s),
                           detail: r.nouveau ? "nouveau" : nil, bon: r.nouveau)]
                } ?? []))
        }
        if let d = detail {
            Filet(titre: "FC", contexte: "au fil de la course")
            CourbeDistance(series: [.init(nom: "FC", valeurs: serie(d, \.fc))], description: "FC au fil de la course")
        }
    }

    // MARK: - Sortie longue

    @ViewBuilder private func sortieLongue(_ c: Contenu) -> some View {
        let s = c.seance
        jauges(c)
        Filet(titre: "Découplage", contexte: "efficacité lissée sur 5 min, allure ajustée")
        if let e = detail?.efficacite {
            courbeEfficacite(e, decouplage: s.decouplage?.valeur)
            Duo(cases: [
                .init(libelle: "1re moitié", valeur: ModeleApercu.nombre(e.ef1, 2), detail: "EF"),
                .init(libelle: "2de moitié", valeur: ModeleApercu.nombre(e.ef2, 2), detail: "EF"),
            ])
        } else if detail != nil {
            Text("Découplage non mesurable").font(.subheadline).foregroundStyle(.encre2).padding(.top, 8)
        }
        if let d = detail {
            Filet(titre: "Profil", contexte: "altitude, puis allure brute et ajustée")
            let alt = serie(d, \.alt_m)
            if !alt.isEmpty {
                CourbeDistance(series: [.init(nom: "Altitude", valeurs: alt, couleur: .encre3)], aire: true, hauteur: 80,
                               description: "Altitude au fil de la distance")
            }
            CourbeDistance(
                series: [.init(nom: "Allure", valeurs: serie(d, \.allure_skm)),
                         .init(nom: "Ajustée", valeurs: serie(d, \.ajustee_skm), pointille: true, couleur: .encre3)],
                allure: true, description: "Allure brute et allure ajustée à la pente au fil de la distance"
            )
            .padding(.top, 12)
        }
        Filet(titre: "Intensité")
        let parts = ModeleSeances.partsTemps(s.minutes)
        BarreEmpilee(parts: zip(["Facile", "Marathon", "Sous-seuil", "Au-dessus"], [Zone.facile, .marathon, .sousSeuil, .auDessus])
            .enumerated().map { ($1.0, $1.1.couleur, parts[$0]) })
            .padding(.top, 8)
        if let d = detail {
            let meilleure = d.tours.map(\.ajustee_skm).min()
            Filet(titre: "Les tours", contexte: "allure ajustée la plus rapide en bleu")
            TableauTours(entetes: ["km", "Allure", "Ajustée", "FC", "D+"], lignes: d.tours.map { t in
                [.init(texte: km(t.km)), .init(texte: formatAllure(t.allure_skm)),
                 .init(texte: formatAllure(t.ajustee_skm), ton: t.ajustee_skm == meilleure ? .accent : nil),
                 .init(texte: t.fc.map { "\(Int($0.rounded()))" } ?? "—"),
                 .init(texte: t.dPlus_m.map { "\(Int($0.rounded()))" } ?? "—")]
            })
        }
        Filet(titre: "Les chiffres")
        Duo(cases: [
            .init(libelle: "Efficacité (EF)", valeur: s.ef.map { ModeleApercu.nombre($0, 2) } ?? "—"),
            .init(libelle: "Charge", valeur: "\(Int(s.charge.rounded()))"),
        ])
    }

    /// Courbe d'efficacité (04) : échauffement grisé, filet des moitiés, paliers EF1 et EF2, découplage libellé.
    private func courbeEfficacite(_ e: CourbeEfficacite, decouplage: Double?) -> some View {
        let fin = e.points.last?.km ?? e.kmMoitie
        return Chart {
            RectangleMark(xStart: .value("km", 0), xEnd: .value("km", e.kmFinEchauffement)).foregroundStyle(.grille)
            RuleMark(x: .value("moitié", e.kmMoitie)).foregroundStyle(.ligne)
            ForEach(e.points.indices, id: \.self) { i in
                LineMark(x: .value("km", e.points[i].km), y: .value("EF", e.points[i].ef), series: .value("s", "EF"))
                    .foregroundStyle(.accentFjord).lineStyle(StrokeStyle(lineWidth: 2))
            }
            ForEach([(e.kmFinEchauffement, e.kmMoitie, e.ef1), (e.kmMoitie, fin, e.ef2)], id: \.0) { a, b, v in
                LineMark(x: .value("km", a), y: .value("EF", v), series: .value("s", "palier \(a)"))
                    .foregroundStyle(.encre2).lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 3]))
                LineMark(x: .value("km", b), y: .value("EF", v), series: .value("s", "palier \(a)"))
                    .foregroundStyle(.encre2).lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 3]))
            }
            if let decouplage {
                RuleMark(x: .value("km", (e.kmMoitie + fin) / 2), yStart: .value("EF", e.ef1), yEnd: .value("EF", e.ef2))
                    .foregroundStyle(.encre)
                    .annotation(position: .trailing) {
                        Text("−\(ModeleApercu.nombre(decouplage, 1)) %").font(.caption2.weight(.semibold)).foregroundStyle(.encre)
                    }
            }
        }
        .chartYScale(domain: .automatic(includesZero: false))
        .frame(height: 140)
        .accessibilityLabel("Efficacité de course au fil de la sortie" + (decouplage.map { ", découplage de \(ModeleApercu.nombre($0, 1)) % entre les deux moitiés" } ?? ""))
    }

    // MARK: - Aides

    private func serie(_ d: DetailSeance, _ k: KeyPath<PointDetail, Double?>) -> [(km: Double, v: Double)] {
        d.points.compactMap { p in p[keyPath: k].map { (p.km, $0) } }
    }

    /// Allure ajustée moyenne : moyenne des tours pondérée par leur longueur.
    private func ajusteeMoyenne(_ d: DetailSeance) -> Double? {
        var precedent = 0.0, somme = 0.0
        for t in d.tours { somme += t.ajustee_skm * (t.km - precedent); precedent = t.km }
        return precedent > 0 ? somme / precedent : nil
    }

    private func chiffres(_ s: SeanceVue, ajustee: Double?, cadence: Double?) -> [Duo.Case] {
        [
            .init(libelle: "Allure", valeur: s.allureMoy_skm.map(formatAllure) ?? "—", detail: ajustee.map { "ajustée \(formatAllure($0))" }),
            cadence.map { .init(libelle: "Cadence", valeur: "\(Int($0.rounded()))", detail: "pas/min") },
            s.dPlus_m.map { .init(libelle: "D+", valeur: "\(Int($0)) m") },
            .init(libelle: "Charge", valeur: "\(Int(s.charge.rounded()))"),
        ].compactMap { $0 }
    }

    /// Vrai si l'instant (s depuis le début) tombe dans une répétition.
    private func enRepetition(_ s: SeanceVue) -> (Double) -> Bool {
        let plages = s.repetitions.filter { $0.debut_s.isFinite && $0.duree_s > 0 }.map { $0.debut_s...($0.debut_s + $0.duree_s) }
        return { t in plages.contains { $0.contains(t) } }
    }

    /// Plage en km d'une répétition, depuis son début et sa durée.
    private func kmPlage(_ d: DetailSeance, _ s: SeanceVue, _ r: Repetition) -> ClosedRange<Double>? {
        guard r.debut_s.isFinite, r.duree_s > 0, s.duree_min > 0, let total = d.points.last?.km else { return nil }
        // Les points sont équirépartis dans le temps : la position temporelle donne l'indice.
        let n = d.points.count, duree = s.duree_min * 60
        let a = d.points[min(n - 1, Int(r.debut_s / duree * Double(n)))].km
        let b = d.points[min(n - 1, Int((r.debut_s + r.duree_s) / duree * Double(n)))].km
        return a < b ? a...min(b, total) : nil
    }

    private func km(_ v: Double) -> String { ModeleApercu.nombre(v, v.rounded() == v ? 0 : 1) }

    private func menu(_ seance: SeanceVue, titre: String) -> some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Text(ModeleSeances.libelleMarquageActuel(seance.marquage))
                Section {
                    ForEach(ModeleSeances.menuMarquage(cleSource: seance.cleSource, courant: seance.marquage, surMarquage: surMarquage), id: \.titre) { option in
                        Button(option.titre, action: option.action)
                    }
                    Button("Recharger depuis Santé", systemImage: "arrow.clockwise") {
                        Task {
                            rechargement = true
                            await modele.recharger(cleSource: cleSource, titre: titre)
                            rechargement = false
                        }
                    }
                }
                .disabled(modele.verrouille)
                if modele.verrouille {
                    Text("Disponible à la fin du recalcul de l’historique.")
                }
            } label: {
                Label("Actions", systemImage: "ellipsis")
            }
        }
    }

    /// « il y a 3 jours » : date de la dernière synchronisation avec Santé.
    private var lueLe: String {
        guard let iso = vue.derniereSynchro, let date = try? Date(iso, strategy: .iso8601) else { return "—" }
        return date.formatted(.relative(presentation: .named))
    }

    /// Séance, écran S3 (carte lue dans le cache de l'app, paramètres de sa date, D-006), niveau de la veille et record.
    private func calcul() -> Contenu? {
        guard
            let seance = vue.seances.first(where: { $0.cleSource == cleSource }),
            let paramsAuJour = try? paramsAuJourDe(vue),
            let carte = cartes.cartes(vue)?[cleSource]
        else { return nil }
        let ecran = ModeleSeances.ecran(seance, carte, paramsAuJour, J: vue.J, fuseau: .current)
        var niveau: Double?, record: (Double, Bool)?
        if ModeleRecit.famille(seance.type) == .course {
            niveau = ModeleApercu.veille(seance.date).flatMap { try? niveauAu(vue, $0)?.vdot }
            let courses = (try? coursesEtTests(vue)) ?? []
            // Une distance « autre » n'a pas de record (point de décision 14).
            if let moi = courses.first(where: { $0.cleSource == cleSource }), recordsParDistance([moi]).contains(cleSource) {
                let memes = courses.filter { $0.distance == moi.distance }
                record = memes.map(\.temps_s).min().map { ($0, recordsParDistance(memes).contains(cleSource)) }
            }
        }
        var partSemaine: Double?
        if ModeleRecit.famille(seance.type) == .repetitions, let lundi = try? lundiISO(seance.date) {
            let semaine = vue.seances.filter { (try? lundiISO($0.date)) == lundi }
            let total = semaine.reduce(0.0) { $0 + $1.duree_min }
            if total > 0 { partSemaine = semaine.reduce(0.0) { $0 + $1.minutes.subt } / total }
        }
        return Contenu(
            seance: seance, ecran: ecran, params: paramsAuJour(seance.date), niveau: niveau, record: record, partSemaine: partSemaine
        )
    }
}

#Preview("Séance (maquette)") {
    NavigationStack {
        EcranSeance(
            vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-30"),
            cleSource: (try? chargerMaquette())?.seances.last?.cleSource ?? "",
            surMarquage: { _, _ in },
            cartes: CacheCartes()
        )
    }
    .environment(ModeleApp.apercu(.chargement))
}
