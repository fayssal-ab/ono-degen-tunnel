# Analyse rewards hubs et audit ONO DEGEN TUNNEL

Date : 11 octobre 2026. Audit du code local et des pages publiques accessibles. Aucun changement fonctionnel effectué. Les observations publiques ne prouvent ni le fonctionnement du backend des concurrents ni leurs paiements réels. Aucun accès à leur administration ou parcours connecté.

## 1. Benchmark public

| Référence | Fonctionnement observé | À retenir pour ONO |
| --- | --- | --- |
| [BEANTWITCH — leaderboard](https://www.beantwitch.com/leaderboard) | Classement par **weighted wager**, montant du pool, 50 places rémunérées sur la page consultée, countdown, dernière mise à jour, pseudonymes masqués. | Montrer immédiatement la métrique, la période, le barème et la fraîcheur des données. Ne pas confondre wager, dépôts et bénéfice. |
| [BEANTWITCH — bonus hunts](https://www.beantwitch.com/bonus-hunts) | Bonuses ouverts/restants, mises, retour cumulé, break-even et multiplicateur moyen nécessaire. Prediction liée au hunt, clôturée au premier bonus ouvert ; connexion Discord ; trois places primées sur la page consultée. | Relier hunt et prediction avec un verrouillage automatique, puis un résultat vérifiable et archivé. |
| [BEANTWITCH — raffle](https://www.beantwitch.com/raffle) | Un ticket gratuit par round pour les joueurs sous son code, tickets additionnels par tranche de weighted wager, tirage hebdomadaire, historique. Une raffle à tickets n'a pas les mêmes probabilités qu'un giveaway à une entrée par personne. | Expliquer les probabilités et le périmètre des données. Raffle distincte, optionnelle après le MVP. |
| [BEANTWITCH — payout ledger](https://www.beantwitch.com/payouts?kind=twitchGiveaway) | Ledger public ; distingue notamment les récompenses sponsorisées et précise qu'une date de claim n'est pas nécessairement une date de transfert. | Distinguer gagnant, prix attribué, claim et paiement confirmé. Ne pas afficher tous les gains comme « paid ». |
| [JustinGambles — leaderboards](https://justingambles.com/leaderboards) | Weekly/monthly, podium top 3, tableau top 15, pool et archives par période. | Podium + tableau + archives ; laisser le pool configurable. |
| [JustinGambles — giveaways](https://justingambles.com/giveaways) | Community/VIP ; compte, Rainbet UID lié et vérifié ; éventuels liens Discord/Kick et minimum wager annoncés sur la carte ; probabilités égales entre entrées éligibles ; anciens gagnants. | Afficher les critères avant participation. Ne pas prétendre vérifier un compte casino sans mécanisme de vérification. |
| [JustinGambles — présentation des tournaments](https://justingambles.com/) | La FAQ décrit des lobbies blackjack à stack identique et des brackets slots où le meilleur multiplicateur avance, avec critères d'accès propres à l'événement. | Le bracket slots d'ONO est cohérent pour le MVP. Le moteur blackjack serait un chantier indépendant. |

Les pages dédiées `/tournaments`, `/blackjack` et `/slot-tournaments` de JustinGambles n'ont pas pu être récupérées. Les conclusions sur leurs tournois viennent de leur FAQ publique, pas d'une inspection du jeu.

[Snutzy](https://snutzy.gg/) et [Mikhailis](https://www.mikhailis.com/) ont aussi été consultés ; les pages retournées exigent JavaScript. Les extraits de recherche évoquent monthly race/guess balance pour Snutzy et leaderboard/guess balance pour Mikhailis, mais cela ne suffit pas à valider les règles détaillées. Ils restent des pistes, pas des références fonctionnelles vérifiées dans cet audit. Ce benchmark est un échantillon ciblé, pas un classement mondial exhaustif.

### Lecture produit

Le parcours utile est : découvrir l'événement → comprendre les critères → participer → suivre → voir le résultat → connaître le statut de la récompense. Les effets visuels viennent ensuite. ONO possède déjà son identité ; le besoin principal est de rendre les événements administrables et les résultats fiables.

Les montants visibles chez les concurrents changent. Ne pas les copier dans la configuration ONO. Les règles, prize pools et critères doivent venir des événements enregistrés.

## 2. État réel du projet

Projet identifié : `ONO DEGEN TUNNEL`, Next.js/App Router, React, TypeScript, MySQL, decimal.js, Zod. Le dossier `Projects/Portfolio-cinematic` ne correspond pas au rewards hub.

| Module | Déjà présent dans le code | Ce qui manque ou reste à vérifier |
| --- | --- | --- |
| Leaderboard | Provider Rainbet/manual/demo, sync, snapshots, masquage, podium/tableau, archives, gestion admin des périodes. | Validation admin des dates et distributions ; activation transactionnelle ; interface d'import manual absente dans les fichiers inspectés ; politique weekly/monthly simultanées à décider car `runSync()` traite une période active. |
| Races | Tables, `lib/races.ts`, classement par différence de snapshots, transaction, cron protégé, page publique. | Aucun admin de création/édition ; pas d'archive publique ; seulement top 5 rendu ; baseline manquante remplacée par zéro ; fraîcheur/finalisation à encadrer. |
| Tournaments | Tables des 8 slots et matches, lecture du bracket et rendu public. | Création, seeding, lancement, saisie scores, propagation des gagnants, ties, finalisation et archive absents. Les événements `upcoming` ne sont pas sélectionnés par `getLiveTournament()`. |
| Bonus Hunt | Tables, lecture des slots, stats decimal, historique. | Gestion hunt/slots/payouts/ordre/finalisation absente. Définition du bankroll et du coût à rendre explicite. |
| Guess the Balance | Tables, ingestion `!gb` via webhook signé, déduplication des messages, dernier guess par pseudo, page publique/historique. | Aucun admin open/close/settle ; pas de calcul de gagnant. Parser accepte des suffixes ; ranking via `Number` ; `LIMIT` appliqué avant tri ; compteur UI limité à la liste chargée. |
| Challenges | Tables, cartes publiques, lecture des gagnants. | Création, preuve, validation/rejet, claim atomique, expiration et admin absents. |
| Giveaways | Dashboard, endpoints admin, ingestion chat, filtres, snapshots, HMAC/seed commitment, rerolls, reveal et verify, overlay. | Préserver ce module ; contrôler le déploiement et la collecte. Ne pas remplacer le tirage par `Math.random()`. |
| VIP / Stream / Settings / Audit | Pages admin déjà présentes. | VIP tiers ne constituent pas automatiquement un compte utilisateur vérifié. Vérifier les garanties de chaque action en étendant le modèle existant. |
| Hall of Fame | Agrégation de champions, big hits, giveaway/challenge winners. | Courses, tournaments et predictions à intégrer ; la requête big hits ne filtre pas actuellement aux hunts archivés contrairement au commentaire général. |

Preuve centrale : `components/admin/AdminShell.tsx` liste explicitement **Races, Tournaments, Challenges, Bonus Hunt, Guess the Balance** dans `SOON`. Ces modules possèdent des données et des vues, mais pas la gestion de leur cycle de vie.

Un empty state « No event live » reste légitime lorsque la base est vide. Le supprimer ou injecter des données fictives ne termine pas une fonctionnalité. « Leaderboard coming soon » peut aussi provenir du setting `leaderboard_enabled` ou de l'absence de période active.

## 3. Défauts et risques concrets

1. **GB : tri après limitation.** `getRoundGuesses()` charge les 100 plus anciens puis calcule la proximité. Exemple : le guess parfait numéro 101 n'apparaît pas dans ce classement. Trier l'ensemble côté SQL avant pagination ; settlement sur tous les guesses éligibles.
2. **GB : precision et parsing.** `Number(amount)` peut perdre la précision `DECIMAL(20,8)` ; regex non ancrée à la fin ; pas de validation explicite des bornes décimales. Utiliser decimal.js et une commande entière valide.
3. **GB : identité et timing.** Le webhook ne fournit actuellement au recorder que le pseudo, bien que la table ait un `kick_user_id`. Vérifier le payload officiel et l'identité stable. Un événement livré tard doit suivre une politique de cutoff explicite.
4. **Races : baseline zéro.** Sans snapshot avant le début, un utilisateur déjà actif peut recevoir son cumul de période comme score de course. On ne peut pas déduire son vrai wager de course des snapshots absents. Séparer nouvel entrant vérifié et baseline inconnue ; ne pas promettre une précision temporelle inexistante.
5. **Races : fermeture et fraîcheur.** Le classement est limité aux snapshots dans la fenêtre, mais la course peut se fermer avec un dernier snapshot antérieur à sa fin. Formaliser la politique de sampling, afficher le dernier sync et gérer l'attente d'une finalisation fiable. Vérifier l'ordre entre cron sync et cron races.
6. **Tournaments : lecture uniquement.** Le winner path affiché ne prouve pas une propagation cohérente. Il faut un moteur transactionnel qui empêche de scorer un match avant ses participants et protège les descendants contre une correction tardive.
7. **Hunts : sémantique.** `totalCost` est la somme des mises de bonus, pas le coût d'achat du hunt. `finalBalance` est la somme des payouts quand tous sont ouverts, pas le profit. Documenter la convention et ajouter une balance restante/coût séparé seulement si le produit en a besoin.
8. **Disponibilité DB.** Plusieurs lecteurs transforment toute erreur DB en « aucun événement » ; races peut lancer l'erreur. Séparer panne de configuration/base et vraie absence d'événement. Le provider demo remplace la source de wagers, pas MySQL : README « sans credentials DB » ne garantit pas un parcours complet.
9. **Manual import et périodes.** Le provider manual ignore les dates ; ne pas ajouter des courses indépendantes sans scoper les imports à leur période. Le commentaire qui annonce un upload CSV n'est pas une UI d'upload implémentée.

## 4. Priorités

- **P0 :** admin des cinq sections SOON ; lifecycle transactionnel ; validation ; fixation GB et baseline races ; erreurs visibles ; conserver giveaways et design.
- **P1 :** détails publics, archives, refresh pendant les événements, audit, import manual exploitable, Hall of Fame cohérent.
- **P2 optionnel :** comptes viewers/OAuth, liaison casino vérifiée, raffle à tickets, ledger de paiement. À spécifier séparément ; pas nécessaires pour retirer les cinq SOON.

## 5. Vérification locale

`npm run typecheck` : réussi. `npm test` : 13 tests réussis (giveaways 5, origin 3, races 1, rules 4).

Ces tests utilisent notamment des mocks. Aucun build production, test navigateur, migration sur DB réelle, événement réel Kick, endpoint Rainbet ou paiement n'a été validé dans cet audit. Le prompt compagnon `PROMPT-COMPLETE-REWARDS.md` décrit la mise en œuvre et ses critères de réception.
