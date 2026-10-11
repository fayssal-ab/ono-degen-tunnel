# Rapport d'implémentation rewards/events

Date : 11 octobre 2026. Suite de `REWARDS-COMPETITOR-AUDIT.md` / `PROMPT-COMPLETE-REWARDS.md`. Rien n'a été déployé ; aucune base existante n'a été migrée ni réinitialisée.

## Ce qui est livré

| Module | Admin | Public |
| --- | --- | --- |
| Races | `/admin/races` : création, édition avant départ, suppression (upcoming), aperçu des gains, baseline/échantillon/dernier calcul, joueurs « baseline inconnue », finalisation forcée sur données périmées | `/races` (upcoming/live/finalizing, countdown début ou fin, règles, barème, fraîcheur, top 10, archives paginées), `/races/[id]` (classement complet paginé), pseudos masqués côté serveur |
| Tournaments | `/admin/tournaments` : brouillon, 8 seeds uniques (autocomplete slot.report), lancement (un seul live), saisie des multiplicateurs, égalité refusée (replay), correction interdite si le tour suivant est joué, finale → terminé et figé | `/tournaments` : live > upcoming > dernier terminé, bracket desktop, tours empilés sur mobile, règles, archives (`?id=`) |
| Bonus Hunt | `/admin/bonus-hunt` : un seul hunt actif, bonus éditables/réordonnables jusqu'au premier payout, payout 0 accepté, correction, fin refusée tant qu'un bonus n'est pas ouvert, archive | Libellés explicites (start balance, sum of bets, payouts / final balance = somme des payouts, profit), opened/remaining, break-even, multiplicateurs, historique avec final balance |
| Guess the Balance | `/admin/guess-the-balance` : brouillon, lien hunt optionnel, deadline optionnelle, ouverture (une seule), fermeture, aperçu du gagnant, settlement transactionnel, statut de collecte Kick, derniers guesses | Règles, prix, vrai nombre de joueurs (COUNT), countdown deadline, classement trié en SQL avant pagination, gagnant + écart, archives |
| Challenges | `/admin/challenges` : création/édition (sans claim), expiration, saisie d'une preuve reçue hors site, contrôle décimal, acceptation (une seule, verrou + index unique) / rejet | Procédure de claim (Discord), expiration, gagnant validé masqué uniquement, archives |
| Intégration | Sidebar sans SOON + menu mobile, dashboard (stats événements, revues en attente, santé des crons), périodes durcies, import CSV manual avec aperçu et erreurs par ligne | Hall of Fame : gagnants de races, champions de tournois, gagnants GB ; big hits limités aux hunts terminés ; état « temporarily unavailable » distinct de l'état vide |

## Décisions et règles importantes

- **Races** : score = croissance du wager cumulé de période entre la baseline (dernier sync ≤ 20 min avant le départ, sinon premier sync après) et le dernier sync avant la fin. Précision = un intervalle de sync (~10 min), affichée publiquement. Un joueur absent de la baseline n'est classé à partir de 0 que si le provider garantit des listes complètes (`demo` oui, `manual` non, `rainbet` seulement avec `RAINBET_LISTS_ALL_WAGERERS=true` après confirmation de Rainbet) ; sinon il est compté « baseline inconnue » et non classé. Égalités départagées par casino_id. Les parts non attribuées ne sont pas versées. Fermeture uniquement après un sync postérieur à la fin (ou période close) avec un échantillon ≤ 20 min avant la fin ; sinon `finalizing` jusqu'à confirmation admin. Une course close n'est jamais recalculée.
- **GB** : identité = `kick_user_id` (payload Kick `sender.user_id`), repli sur le pseudo en minuscules. « Latest » = horodatage Kick signé (`created_at`, sinon l'en-tête `Kick-Event-Message-Timestamp`), donc une livraison tardive d'un ancien message n'écrase pas un guess plus récent. Un guess compte s'il est envoyé après l'ouverture, avant la deadline, et traité avant la fermeture ; les messages arrivant après la fermeture sont ignorés et une round n'est jamais rouverte. Les événements d'un autre broadcaster sont ignorés (`KICK_BROADCASTER_USER_ID`, sinon slug du canal). Égalité : distance, puis guess final le plus ancien, puis id.
- **Hunt** : convention MVP explicite, final balance = somme des payouts ; aucun coût n'est déduit des mises.
- **Périodes** : une seule période live ; activation atomique refusée tant qu'une autre est live (plus de rétrogradation silencieuse) ; l'activation automatique du cron attend désormais la date de début ; création refusée si chevauchement avec une période non close ; suppression limitée aux périodes upcoming sans race.
- **Manual** : imports stockés par période (`manual_period_wagers`) ; les anciennes lignes `manual_wagers` sont copiées vers la période live au moment de la migration ; l'ancienne table reste intacte et n'est plus lue.
- **Concurrence** : verrous de ligne + table `app_locks` pour les règles « un seul actif » (sans supposer que les données existantes sont propres), index unique sur le claim accepté. Les sessions MySQL sont forcées en UTC.

## Fichiers

- Migration : `db/migrations/0007_event_lifecycle.sql` (incrémentale).
- Lib : `lib/races.ts`, `lib/tournaments.ts`, `lib/bonusHunt.ts`, `lib/guessBalance.ts`, `lib/challenges.ts`, `lib/periodAdmin.ts`, `lib/kickEvents.ts`, `lib/adminAction.ts`, `lib/events/{common,messages}.ts`, `lib/hallOfFame.ts`, `lib/periods.ts`, `lib/sync.ts`, `lib/db.ts`, `lib/providers/*`.
- Admin : `app/admin/{races,tournaments,bonus-hunt,guess-the-balance,challenges}/page.tsx`, `app/admin/periods/page.tsx`, `app/admin/page.tsx`, `components/admin/{AdminShell,ui,client,ManualImport}.tsx`.
- Public : `app/(site)/{races,races/[id],tournaments,bonus-hunt,guess-the-balance,challenges,hall-of-fame}/page.tsx`, `components/events/*`, `components/ui/Countdown.tsx`.
- Routes : `app/api/webhooks/kick/chat/route.ts`, `app/api/cron/{sync,races}/route.ts` (suivi `job_runs`).
- Tests : `tests/events.test.ts`, `tests/events.db.test.ts`, `tests/adminAccess.test.ts` ; `tests/races.test.ts` supprimé (mock lié à l'ancien SQL, couvert par les nouveaux tests).
- Docs : `README.md`, `.env.example`.

## Vérifications réalisées

- `npm run typecheck` OK ; `npm run lint` 0 erreur (12 warnings préexistants hors périmètre) ; `next build` OK.
- `npm test` : 26 tests unitaires OK ; 11 tests d'intégration exécutés sur un MySQL 8.0.46 jetable local (`TEST_DB_*`) : 37/37 OK. Couverts : baseline absente, fenêtre finie, sync tardif/périmé, précision décimale, résultat figé ; propagation du bracket, égalité, correction interdite, finale ; gagnant GB au-delà de la 100e entrée, distance exacte, égalité, latest guess hors ordre, deadline/fermeture, settle concurrent ; payout zéro et fermeture GB au premier bonus ; claims concurrents/expirés/sous le seuil ; activation concurrente de périodes ; import manual scopé.
- Migration 0007 appliquée sur une base à l'état 0006 contenant des données héritées (guesses, manual_wagers, hunt ouvert) : OK.
- Parcours navigateur (Chrome headless, build de production, base de test) : tournoi (création → seeds → lancement → égalité refusée → scores → correction refusée → champion public), hunt + GB lié (ouverture → payout 0 ferme la round → fin refusée puis acceptée → aperçu → settle), race (sur-allocation refusée, fenêtre hors période refusée, création, countdown public), challenge (claim → acceptation → public masqué), menu admin mobile, absence de débordement horizontal à 390 px, pages publiques avec base coupée → état « indisponible ».
- Non exécuté : événement Kick réel, endpoint Rainbet réel, migration sur la base Aiven de production, exécution réelle du workflow GitHub Actions.

## Checklist de réception (à faire sur l'environnement cible)

1. Sauvegarder la base, puis `npm run migrate` (applique 0007 uniquement). Vérifier `schema_migrations`.
2. Renseigner `KICK_BROADCASTER_USER_ID` ; vérifier dans Admin → Guess the Balance « Last webhook event » après un message de chat.
3. Décider `RAINBET_LISTS_ALL_WAGERERS` avec Rainbet (laisser `false` sans confirmation écrite).
4. Créer une période live, une race courte ; après deux syncs, vérifier baseline/échantillon dans `/admin/races` et le classement public ; après la fin, vérifier le passage `finalizing` → `closed`.
5. Tournoi complet sur stream de test ; hunt + round GB liée avec quelques `!gb` réels ; challenge avec claim Discord.
6. Contrôler le dashboard : « Scheduled jobs » doit montrer sync et races en succès.

## Travail restant réel

- Aucune action de « réouverture » volontaire n'existe (choix délibéré : résultats figés).
- Pas de test e2e automatisé versionné (le script Playwright utilisé est resté hors dépôt).
- Le parcours giveaways (préservé tel quel) passe aussi par le filtre broadcaster du webhook : à vérifier avec un vrai événement.

## Propositions hors périmètre MVP

Ledger de paiements (gagnant → attribué → payé), comptes viewers / OAuth Kick, liaison et vérification de compte casino, raffle à tickets pondérés, boards weekly + monthly simultanés (sync par période).
