// Calculs sur les dates civiles en arithmétique entière, sans objet Date ni fuseau (ADR 0007), traduits de
// src/core/dates.ts. Algorithme des jours civils (Howard Hinnant), grégorien proleptique. Pas de Foundation.Calendar.
// Les années hors de 0000–9999 n'ont pas de forme « AAAA-MM-JJ » : elles lèvent RangeError.

/// Erreur d'intervalle ou de format, équivalente au `RangeError` du TypeScript.
public struct RangeError: Error, Sendable, Equatable {
    public let message: String

    public init(_ message: String) {
        self.message = message
    }
}

/// Année, mois (1 à 12) et jour d'une date civile « AAAA-MM-JJ ».
public struct DecompositionDate: Codable, Sendable, Equatable {
    public var annee: Int
    public var mois: Int
    public var jour: Int

    public init(annee: Int, mois: Int, jour: Int) {
        self.annee = annee
        self.mois = mois
        self.jour = jour
    }
}

private let MS_PAR_JOUR = 86_400_000.0
private let MS_PAR_HEURE = 3_600_000.0
private let MS_PAR_MINUTE = 60_000.0
private let MS_PAR_SECONDE = 1_000.0

/// Numéro de jour (jours depuis 1970-01-01) d'une date civile « AAAA-MM-JJ ».
public func numeroJour(_ d: DateCivile) throws -> NumeroJour {
    numeroJourDepuis(try decomposerDate(d))
}

/// Numéro de jour d'une date déjà décomposée (et valide).
func numeroJourDepuis(_ dc: DecompositionDate) -> NumeroJour {
    let annee2 = dc.mois <= 2 ? dc.annee - 1 : dc.annee
    let ere = floorDiv(annee2, 400)
    let anneeDansEre = annee2 - ere * 400
    let moisDecale = (dc.mois + 9) % 12 // mars = 0
    let jourDansAnnee = (153 * moisDecale + 2) / 5 + dc.jour - 1
    let jourDansEre = anneeDansEre * 365 + anneeDansEre / 4 - anneeDansEre / 100 + jourDansAnnee
    return ere * 146_097 + jourDansEre - 719_468
}

/// Date civile « AAAA-MM-JJ » d'un numéro de jour entier.
public func dateDepuisNumero(_ n: NumeroJour) throws -> DateCivile {
    let z = n + 719_468
    let ere = floorDiv(z, 146_097)
    let jourDansEre = z - ere * 146_097
    let anneeDansEre = (jourDansEre - jourDansEre / 1460 + jourDansEre / 36524 - jourDansEre / 146_096) / 365
    let annee = anneeDansEre + ere * 400
    let jourDansAnnee = jourDansEre - (365 * anneeDansEre + anneeDansEre / 4 - anneeDansEre / 100)
    let moisDecale = (5 * jourDansAnnee + 2) / 153
    let jour = jourDansAnnee - (153 * moisDecale + 2) / 5 + 1
    let mois = moisDecale < 10 ? moisDecale + 3 : moisDecale - 9
    let anneeCivile = mois <= 2 ? annee + 1 : annee
    if anneeCivile < 0 || anneeCivile > 9999 {
        throw RangeError("année hors de 0000–9999 pour le jour \(n)")
    }
    return "\(chiffresPad(anneeCivile, 4))-\(chiffresPad(mois, 2))-\(chiffresPad(jour, 2))"
}

/// Ajoute n jours civils à une date (n entier, peut être négatif).
public func ajouterJours(_ d: DateCivile, _ n: Int) throws -> DateCivile {
    try dateDepuisNumero(try numeroJour(d) + n)
}

/// Jour de la semaine, lundi = 0 … dimanche = 6 (ISO).
public func jourDeSemaine(_ d: DateCivile) throws -> Int {
    jourDeSemaineDe(try numeroJour(d))
}

/// Lundi de la semaine ISO de d.
public func lundiISO(_ d: DateCivile) throws -> DateCivile {
    let n = try numeroJour(d)
    return try dateDepuisNumero(n - jourDeSemaineDe(n))
}

/// Date locale d'une activité : la date civile de son début UTC décalé de son décalage local (ADR 0007).
/// L'arithmétique est en UTC, sans fuseau. Lève RangeError si le résultat n'est pas un jour valide.
public func dateLocale(_ debutUtc_ms: Double, _ decalage_min: Double) throws -> DateCivile {
    let jours = ((debutUtc_ms + decalage_min * MS_PAR_MINUTE) / MS_PAR_JOUR).rounded(.down)
    guard jours.isFinite, abs(jours) < 1e15 else {
        throw RangeError("numéro de jour non entier : \(jours)")
    }
    return try dateDepuisNumero(Int(jours))
}

/// Une semaine (du lundi au dimanche) est terminée si son dimanche est ≤ J−1, c'est-à-dire strictement avant J
/// (ADR 0007). Lève RangeError si lundi n'est pas un lundi.
public func semaineTerminee(_ lundi: DateCivile, _ J: DateCivile) throws -> Bool {
    if try jourDeSemaine(lundi) != 0 {
        throw RangeError("pas un lundi : \(lundi)")
    }
    return try numeroJour(lundi) + 6 < numeroJour(J)
}

/// Année, mois (1 à 12) et jour d'une date civile « AAAA-MM-JJ » ; lève RangeError si elle n'existe pas.
public func decomposerDate(_ d: DateCivile) throws -> DecompositionDate {
    guard let resultat = analyserDate(d) else {
        throw RangeError("date civile invalide : \(d)")
    }
    return resultat
}

/// Vrai si d est une date civile « AAAA-MM-JJ » qui existe (29 février compris).
public func estDateCivile(_ d: DateCivile) -> Bool {
    analyserDate(d) != nil
}

/// Instant UTC d'un enregistrement, en millisecondes depuis l'époque, à partir d'une date-heure ISO 8601 terminée
/// par Z (« 2026-04-10T18:00:00Z », fraction de seconde facultative, 1 à 3 chiffres). Lève RangeError si le format
/// diffère (contrat de types.ts).
public func instantUtc(_ iso: String) throws -> Double {
    var texte = iso
    let decompose: (dc: DecompositionDate, heure: Int, minute: Int, seconde: Int, millisecondes: Int)? = texte.withUTF8 { b in
        // AAAA-MM-JJThh:mm:ss, puis une fraction facultative « .f{1,3} », puis Z, et rien d'autre.
        guard b.count >= 20, b[10] == UInt8(ascii: "T"), b[13] == UInt8(ascii: ":"), b[16] == UInt8(ascii: ":"),
              b[b.count - 1] == UInt8(ascii: "Z")
        else { return nil }
        let fin = b.count - 1
        var millisecondes = 0
        var position = 19
        if position < fin {
            guard b[position] == UInt8(ascii: "."), fin - position - 1 >= 1, fin - position - 1 <= 3 else { return nil }
            var chiffresFraction = 0
            var i = position + 1
            while i < fin {
                guard let c = chiffreAscii(b[i]) else { return nil }
                millisecondes = millisecondes * 10 + c
                chiffresFraction += 1
                i += 1
            }
            // « .5 » vaut 500 ms, « .05 » vaut 50 ms : on complète à droite jusqu'à trois chiffres.
            for _ in chiffresFraction..<3 { millisecondes *= 10 }
            position = fin
        }
        guard position == fin,
              let annee = nombreAscii(b, 0, 4), let mois = nombreAscii(b, 5, 2), let jour = nombreAscii(b, 8, 2),
              let heure = nombreAscii(b, 11, 2), let minute = nombreAscii(b, 14, 2), let seconde = nombreAscii(b, 17, 2),
              b[4] == UInt8(ascii: "-"), b[7] == UInt8(ascii: "-"),
              let dc = analyserDate(annee: annee, mois: mois, jour: jour)
        else { return nil }
        return (dc, heure, minute, seconde, millisecondes)
    }
    guard let decomposition = decompose else {
        throw RangeError("instant UTC invalide, attendu AAAA-MM-JJThh:mm:ss[.fff]Z : \(iso)")
    }
    if decomposition.heure > 23 || decomposition.minute > 59 || decomposition.seconde > 59 {
        throw RangeError("heure hors bornes : \(iso)")
    }
    let jours = Double(numeroJourDepuis(decomposition.dc))
    return jours * MS_PAR_JOUR + Double(decomposition.heure) * MS_PAR_HEURE + Double(decomposition.minute) * MS_PAR_MINUTE
        + Double(decomposition.seconde) * MS_PAR_SECONDE + Double(decomposition.millisecondes)
}

// MARK: - Analyse

private func analyserDate(_ d: DateCivile) -> DecompositionDate? {
    var texte = d
    return texte.withUTF8 { b -> DecompositionDate? in
        guard b.count == 10, b[4] == UInt8(ascii: "-"), b[7] == UInt8(ascii: "-"),
              let annee = nombreAscii(b, 0, 4), let mois = nombreAscii(b, 5, 2), let jour = nombreAscii(b, 8, 2)
        else { return nil }
        return analyserDate(annee: annee, mois: mois, jour: jour)
    }
}

private func analyserDate(annee: Int, mois: Int, jour: Int) -> DecompositionDate? {
    guard mois >= 1, mois <= 12, jour >= 1, jour <= joursDuMois(annee, mois) else { return nil }
    return DecompositionDate(annee: annee, mois: mois, jour: jour)
}

/// Lit `longueur` chiffres ASCII à partir de `debut`.
private func nombreAscii(_ b: UnsafeBufferPointer<UInt8>, _ debut: Int, _ longueur: Int) -> Int? {
    var valeur = 0
    for i in debut..<(debut + longueur) {
        guard let c = chiffreAscii(b[i]) else { return nil }
        valeur = valeur * 10 + c
    }
    return valeur
}

private func chiffreAscii(_ octet: UInt8) -> Int? {
    octet >= 0x30 && octet <= 0x39 ? Int(octet - 0x30) : nil
}

private func joursDuMois(_ annee: Int, _ mois: Int) -> Int {
    if mois == 2 {
        return estBissextile(annee) ? 29 : 28
    }
    return mois == 4 || mois == 6 || mois == 9 || mois == 11 ? 30 : 31
}

private func estBissextile(_ annee: Int) -> Bool {
    (annee % 4 == 0 && annee % 100 != 0) || annee % 400 == 0
}

/// Jour de la semaine (lundi = 0) d'un numéro de jour. 1970-01-01 est un jeudi.
private func jourDeSemaineDe(_ n: NumeroJour) -> Int {
    (((n + 3) % 7) + 7) % 7
}

/// Division entière arrondie vers −∞ (Math.floor(a / b) pour b > 0).
private func floorDiv(_ a: Int, _ b: Int) -> Int {
    let q = a / b
    return (a % b != 0 && (a < 0) != (b < 0)) ? q - 1 : q
}

/// Écrit `valeur` sur au moins `largeur` chiffres, avec des zéros à gauche.
func chiffresPad(_ valeur: Int, _ largeur: Int) -> String {
    let texte = String(valeur)
    return texte.count >= largeur ? texte : String(repeating: "0", count: largeur - texte.count) + texte
}
