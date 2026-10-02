# WikiZizi

Un jeu de cartes à collectionner où chaque carte est un vrai article de Wikipédia en français.

## Jouer

On commence avec 500 wikizgeg (Ƶ), la monnaie du jeu.

Ouvre `index.html` dans un navigateur, ou publie le dépôt avec GitHub Pages (Settings → Pages → branche `main`, dossier `/`). Aucune installation ni serveur nécessaire : les cartes viennent de l'API publique de `fr.wikipedia.org` et la partie est sauvegardée dans le navigateur.

## Règles

- **Boosters** : 5 cartes par booster.
  - **Classique** : tout Wikipédia. Un gratuit toutes les 10 minutes (10 en stock max), « Tout ouvrir » d'un coup, ou Ƶ25.
  - **Premium** (Ƶ100) : beaucoup plus de pages célèbres, une page connue garantie.
  - **Thématiques** (Ƶ40) : Histoire, Sciences, Géographie, Sport, Arts, Musique, Jeu vidéo.
  - Bouton « Tout révéler », cartes rares qui brillent avant d'être retournées, confettis pour les Ultra rares et Légendaires, historique des derniers tirages.
- **Rareté** : elle dépend du nombre de vues de la page sur les 30 derniers jours.

  | Rareté      | Vues / 30 jours | Revente |
  |-------------|-----------------|---------|
  | Commune     | 0 – 49          | Ƶ1      |
  | Peu commune | 50 – 199        | Ƶ2      |
  | Rare        | 200 – 999       | Ƶ5      |
  | Super rare  | 1 000 – 4 999   | Ƶ15     |
  | Ultra rare  | 5 000 – 19 999  | Ƶ40     |
  | Légendaire  | 20 000 et plus  | Ƶ120    |

- **Images** : chaque carte a l'image de son article (les pages sans image ne sont jamais tirées).
- **Album** : filtre, trie, consulte et revends tes cartes (ou tous tes doublons d'un coup).
- **Marché** : achète des cartes à des marchands. Les offres changent toutes les 30 minutes.
- **Profil** : statistiques, succès, export/import de la sauvegarde.

## Codes secrets

Tape-les n'importe où dans le jeu (sur téléphone : 5 tapes sur le logo). La liste des codes déjà découverts est dans le Profil… les autres sont à trouver !

Inspiré de [WikiMasters](https://www.wiki-masters.com).
