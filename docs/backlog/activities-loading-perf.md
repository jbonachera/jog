Le chargement des activitées passées est lent et sequentiel: on doit le paraléliser et rendre lisible sur l'UI sa progression. On doit aussi permettre de recharger une activité depuis sa vue (et donc recalculer les métriques, gap, etc, associées).
Lors de la modification de parametres comme fcmax, on doit rendre visible la progression du rechargement de l'historique.

Maquette retenue : `docs/design/maquette/chargement.html`. iOS 26 minimum (accessoire `tabViewBottomAccessory`). Pendant un recalcul, les Paramètres et le marquage des séances sont verrouillés.
