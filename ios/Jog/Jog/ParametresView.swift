import SwiftUI
import JogCore

/// Feuille des Paramètres (06), ouverte par le bouton de la barre du haut. Le formulaire édite les paramètres datés
/// (avec une date d'effet, D-006) et globaux ; « Enregistrer » est désactivé tant que la saisie est invalide. La logique
/// est dans `ModeleParametres.swift` ; les sections sont dans `Parametres/SectionsParametres.swift`.
struct ParametresView: View {
    @Bindable var modele: ModeleApp
    /// La Vue en cours : valeurs à J−1, suggestions (D-004, D-019) et dernière synchronisation.
    let vue: Vue?
    @Environment(\.dismiss) private var fermer
    @AppStorage(CLE_HRMAX_IGNOREE) private var hrMaxIgnoree = ""

    /// Paramètres stockés au chargement, puis au dernier enregistrement. nil tant qu'ils ne sont pas lus.
    @State private var base: Parametres?
    @State private var brouillon = Brouillon.parDefaut()
    @State private var dateEffet: DateCivile = dateCivile(de: Date())
    @State private var enregistrement = false
    @State private var statut: String?
    @State private var erreur: String?
    @State private var etat: EtatDonnees?
    @State private var confirmeDefauts = false
    @State private var confirmeSuppression = false

    /// Journée courante (J) : une date d'effet ne peut pas la dépasser (06).
    private var J: DateCivile { dateCivile(de: Date()) }

    /// Vérification de la saisie en cours, à chaque modification (06, « Validation, au moment d'enregistrer »).
    private var verification: Verification? {
        guard let base else { return nil }
        return verifierSaisie(brouillon, base: base, dateEffet: dateEffet, J: J, enregistreLe: maintenant())
    }

    var body: some View {
        NavigationStack {
            Form {
                if base == nil {
                    ProgressView("Lecture des paramètres")
                } else {
                    SectionsParametres(
                        brouillon: $brouillon,
                        dateEffet: liaisonDate,
                        vue: vue,
                        verification: verification,
                        hrMaxIgnoree: $hrMaxIgnoree,
                        historique: base.map(lignesHistorique) ?? [],
                        etat: etat,
                        statut: statut,
                        erreur: erreur,
                        actions: ActionsParametres(
                            defauts: { confirmeDefauts = true },
                            supprimer: { confirmeSuppression = true },
                            retirerModification: { id in Task { await retirer(id) } },
                            utiliserPaceHrK: { valeur in brouillon.definir(.globale(.paceHrK), texteNombre(valeur)) },
                            utiliserFCMax: { suggestion in
                                dateEffet = preremplirFCMax(suggestion, dans: &brouillon)
                            }
                        )
                    )
                }
                #if DEBUG
                Section("Développement") {
                    Toggle("Afficher la maquette", isOn: $modele.maquetteActive)
                    NavigationLink("Spike HealthKit") {
                        SpikeView()
                    }
                }
                #endif
            }
            .disabled(enregistrement)
            .navigationTitle("Paramètres")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { fermer() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if enregistrement {
                        ProgressView()
                            .accessibilityLabel("Enregistrement en cours")
                    } else {
                        Button("Enregistrer") {
                            Task { await enregistrerSaisie() }
                        }
                        .disabled(!(verification?.valide ?? false))
                    }
                }
            }
            .task {
                await charger()
            }
            .task(id: vue?.derniereSynchro) {
                etat = await modele.etatDonnees()
            }
            .alert("Revenir aux valeurs par défaut ?", isPresented: $confirmeDefauts) {
                Button("Revenir aux valeurs par défaut", role: .destructive) {
                    Task { await revenirAuxDefauts() }
                }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Les paramètres repartent de leurs valeurs de départ, datées d’aujourd’hui. L’historique est conservé.")
            }
            .alert("Supprimer toutes les données ?", isPresented: $confirmeSuppression) {
                Button("Supprimer", role: .destructive) {
                    Task { await supprimerTout() }
                }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Les séances, les paramètres, leur historique et les marquages sont effacés de cet iPhone. "
                    + "Les données Santé d’Apple ne sont pas touchées.")
            }
        }
    }

    /// Date d'effet vue par le sélecteur de date (midi local, jamais dans le futur).
    private var liaisonDate: Binding<Date> {
        Binding(
            get: { instantDe(dateEffet) ?? Date() },
            set: { dateEffet = dateCivile(de: $0) }
        )
    }

    private func maintenant() -> String {
        Date().formatted(Date.ISO8601FormatStyle())
    }

    private func charger() async {
        do {
            let lus = try await modele.lireParametres()
            base = lus
            reinitialiser(lus)
        } catch {
            erreur = error.localizedDescription
        }
        etat = await modele.etatDonnees()
    }

    /// Repart des valeurs en vigueur aujourd'hui, et d'une date d'effet d'aujourd'hui.
    private func reinitialiser(_ parametres: Parametres) {
        if let datees = try? parametresAuJour(parametres, J) {
            brouillon = Brouillon(datees: datees, globaux: parametres.globaux)
        }
        dateEffet = J
    }

    private func enregistrerSaisie() async {
        guard let nouveaux = verification?.parametres else { return }
        await appliquer(nouveaux)
    }

    /// Enregistre et recalcule (hors du fil principal). L'annonce VoiceOver suit la zone de statut de 06.
    private func appliquer(_ nouveaux: Parametres) async {
        enregistrement = true
        erreur = nil
        statut = nil
        defer { enregistrement = false }
        do {
            try await modele.enregistrerParametres(nouveaux)
            base = nouveaux
            reinitialiser(nouveaux)
            etat = await modele.etatDonnees()
            let message = "Enregistré. Tableau de bord recalculé."
            statut = message
            AccessibilityNotification.Announcement(message).post()
        } catch {
            erreur = error.localizedDescription
        }
    }

    private func retirer(_ id: String) async {
        guard let base else { return }
        let nouveaux = sansModification(id, de: base)
        if case let .echec(_, message) = validerParametres(nouveaux, J) {
            erreur = message
            return
        }
        await appliquer(nouveaux)
    }

    private func revenirAuxDefauts() async {
        guard let base else { return }
        await appliquer(parametresParDefaut(base: base, J: J, enregistreLe: maintenant()))
    }

    private func supprimerTout() async {
        do {
            try await modele.supprimerToutesLesDonnees()
            fermer()
        } catch {
            erreur = error.localizedDescription
        }
    }
}

#Preview {
    ParametresView(modele: ModeleApp(), vue: nil)
}
