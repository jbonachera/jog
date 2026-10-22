// Pic soutenu de la FC (D-019, ADR 0013). Traduit de src/core/seance/pic.ts : la plus haute FC tenue au moins
// DUREE_PIC_FC_S s d'affilée, hors des DEBUT_PIC_FC_S premières secondes. Minimum glissant de fc_bpm (D-013) par une
// file monotone : une seule passe, O(n), sans allocation dans la boucle.

/// Pas de la grille : le mode des écarts entre mesures consécutives, positifs et au plus ECART_MAX_GRILLE_S
/// (1 s pour un flux à 1 Hz, 5 s pour un flux à 5 s). Un écart plus grand qu'un pas est une coupure.
private func pasGrille(_ t: [Double], _ n: Int) -> Double {
    let maximum = Int(ECART_MAX_GRILLE_S)
    var compte = [Int](repeating: 0, count: maximum + 1)
    if n > 1 {
        for j in 0..<(n - 1) {
            let ecart = mathRoundJS(t[j + 1] - t[j])
            if ecart >= 1 && ecart <= ECART_MAX_GRILLE_S { compte[Int(ecart)] += 1 }
        }
    }
    var pas = 1
    var meilleur = 0
    for e in 1...maximum where compte[e] > meilleur {
        meilleur = compte[e]
        pas = e
    }
    return Double(pas)
}

/// Écart entre la mesure j et la suivante, plus grand qu'un pas (faux pour la dernière mesure : pas d'écart suivant).
private func coupure(_ t: [Double], _ n: Int, _ j: Int, _ pas: Double) -> Bool {
    j + 1 < n && t[j + 1] - t[j] > pas
}

/// Pic soutenu : le plus haut minimum des fenêtres valides, brut. Une fenêtre commence à l'échantillon i et couvre les
/// échantillons d'instant dans [t_i, t_i + 15 s). Elle est valide si aucun de ses échantillons n'est NaN, si t_i ≥ 300 s,
/// si aucun écart entre mesures consécutives, y compris celui vers la mesure qui suit la fenêtre, ne dépasse le pas
/// de la grille, et si, à la fin du flux, la dernière mesure est à un pas au plus de la fin de la fenêtre.
func calculerFcPic(_ g: GrilleSeance) -> Double? {
    let n = g.n
    let t = g.t_s
    let fc = g.fc_bpm
    let pas = pasGrille(t, n)
    // File des indices de la fenêtre, FC croissante de la tête à la queue : la tête est le minimum de la fenêtre.
    var file = [Int](repeating: 0, count: n)
    var tete = 0
    var queue = 0
    // Nombre de NaN dans la fenêtre courante, qui n'entrent pas dans la file.
    var nbNaN = 0
    // Nombre de coupures entre mesures consécutives de la fenêtre.
    var nbCoupures = 0
    // Dernier indice entré dans la fenêtre (instant < t_i + 15 s).
    var dernier = -1
    var pic = Double.nan

    for i in 0..<n {
        let debut = t[i]
        let fin = debut + DUREE_PIC_FC_S
        if i > 0 {
            if fc[i - 1].isNaN { nbNaN -= 1 }
            if coupure(t, n, i - 1, pas) { nbCoupures -= 1 }
        }

        while dernier + 1 < n && t[dernier + 1] < fin {
            dernier += 1
            if coupure(t, n, dernier, pas) { nbCoupures += 1 }
            let v = fc[dernier]
            if v.isNaN {
                nbNaN += 1
                continue
            }
            while queue > tete && fc[file[queue - 1]] >= v { queue -= 1 }
            file[queue] = dernier
            queue += 1
        }
        while tete < queue && file[tete] < i { tete += 1 }

        // Fin de flux : la fenêtre n'est couverte que si sa dernière mesure est à un pas au plus de sa fin.
        let finDeFlux = dernier + 1 >= n
        let couverte = !finDeFlux || fin - t[dernier] <= pas
        let valide = debut >= DEBUT_PIC_FC_S && nbNaN == 0 && nbCoupures == 0 && couverte
        if valide {
            let minimum = fc[file[tete]]
            if pic.isNaN || minimum > pic { pic = minimum }
        }
    }

    return pic.isNaN ? nil : pic
}
