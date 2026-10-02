# WikiMaster

Un jeu de cartes à collectionner où chaque carte est un vrai article de Wikipédia en français.

## Jouer

Ouvre `index.html` dans un navigateur, ou publie le dépôt avec GitHub Pages (Settings → Pages → branche `main`, dossier `/`). Aucune installation ni serveur nécessaire : les cartes viennent de l'API publique de `fr.wikipedia.org` et la partie est sauvegardée dans le navigateur.

## Règles

- **Boosters** : 5 cartes par booster. Tu en gagnes un toutes les 10 minutes (10 en stock maximum), ou tu peux en acheter pour 25 wikibidous (₩).
- **Rareté** : elle dépend du nombre de vues de la page sur les 30 derniers jours.

  | Rareté      | Vues / 30 jours | Revente |
  |-------------|-----------------|---------|
  | Commune     | 0 – 49          | ₩1      |
  | Peu commune | 50 – 199        | ₩3      |
  | Rare        | 200 – 999       | ₩8      |
  | Super rare  | 1 000 – 4 999   | ₩25     |
  | Ultra rare  | 5 000 – 19 999  | ₩80     |
  | Légendaire  | 20 000 et plus  | ₩300    |

- **Album** : filtre, trie, consulte et revends tes cartes (ou tous tes doublons d'un coup).
- **Duel** : choisis 3 cartes et affronte l'IA. À chaque manche, une question est tirée de la page Wikipédia de ta carte (deviner la page, mot manquant, page la plus consultée). Une bonne réponse inflige des dégâts selon ton ATK, une mauvaise te blesse.
- **Marché** : achète des cartes à des marchands. Les offres changent toutes les 30 minutes.
- **Profil** : statistiques, succès, export/import de la sauvegarde.

Inspiré de [WikiMasters](https://www.wiki-masters.com).
