# Prompt à donner à l'agent qui complète le projet

Copie tout le bloc ci-dessous dans Codex/Claude avec le dossier `ONO DEGEN TUNNEL` ouvert. L'analyse de référence est `REWARDS-COMPETITOR-AUDIT.md`.

```text
Tu travailles directement dans le projet existant ONO DEGEN TUNNEL. Ta mission est d'implémenter et vérifier les fonctionnalités incomplètes de rewards/events, particulièrement les cinq rubriques SOON de l'administration. Travaille jusqu'à obtenir des parcours complets, pas seulement un plan ou des pages décoratives.

CONTEXTE ET LIMITES
- Lis AGENTS.md, README.md, NOTES-FROM-JBALLIN.md, les migrations, l'audit REWARDS-COMPETITOR-AUDIT.md et les conventions existantes. Les anciens PLAN.md/PROMPT.md donnent du contexte ; constate le code réel avant de reprendre leurs affirmations.
- Respecte AGENTS.md : consulte la documentation locale de la version Next installée avant d'écrire du code Next.
- Conserve Next/App Router, React, TypeScript strict, MySQL/mysql2, Zod, decimal.js, Tailwind, composants et identité ONO. Préserve les changements locaux existants.
- Le site est un rewards hub, pas un casino : aucune prise de dépôt, aucun moteur de jeu d'argent à ajouter. Les tournaments sont des brackets d'événements stream avec scores saisis par un admin.
- Les références produit sont BEANTWITCH (standings/bonus hunts/predictions/ledger) et JustinGambles (podium/archives/giveaways/brackets). Inspire-toi de leurs parcours, conserve notre branding et nos règles.
- Ne remplace pas l'excellent module giveaways : conserve HMAC, seed commitment, snapshot, reveal, verify, rerolls et répétition possible des gagnants.
- Pas de faux gagnants, prize pools ou statistiques de production. Les fixtures sont réservées aux tests et à un mode demo explicite.
- Implémente localement ; ne déploie pas et ne réinitialise pas une DB existante. Les credentials manquants doivent être signalés exactement. Avance sur tout ce qui ne dépend pas d'eux.

ÉTAPE 1 — INVENTAIRE ET FONDATIONS
Vérifie les fichiers concernés : components/admin/AdminShell.tsx ; lib/{races,tournaments,bonusHunt,guessBalance,challenges,periods,sync,admin,origin,audit,auditLog,money}.ts ; app/(site) ; app/admin ; app/api ; db/migrations ; .github/workflows/cron-sync.yml.
Reprends les patterns d'authentification et validation existants ; choisis actions serveur ou endpoints cohérents avec le repo. Chaque mutation doit vérifier la session admin au niveau de l'action/endpoint, pas seulement du layout. Pour les routes HTTP, applique la protection origin existante. SQL paramétré, Zod, bornes des ids/textes/dates/decimals, transactions, row locks et transitions d'état autorisées. Audit durable sans secrets. Garde les secrets côté serveur.
Ajoute uniquement des migrations incrémentales compatibles avec les données existantes. Les résultats finaux sont figés ; les requêtes simultanées ou rejouées ne doivent pas attribuer deux prix ni modifier un event terminé.

ÉTAPE 2 — RACES
Crée /admin/races : liste, création, édition avant lancement, preview de distribution, état et détails. Configure nom, kind 24h/7d, période source, début/fin UTC, prize pool et répartition valide (rangs uniques, pas de surallocation ; politique explicite pour part non distribuée). La fenêtre doit tenir dans la période source pour le MVP.
Réutilise lib/races.ts, rank_snapshots et le cron protégé. Définit précisément le score comme différence de wager cumulé sur la fenêtre, avec tie-break déterministe et blacklist. Vérifie la garantie du provider avant de considérer un utilisateur sans baseline comme nouveau. Une baseline inconnue ne doit jamais ajouter silencieusement le cumul antérieur : bloque/fais attendre le classement concerné ou utilise une source permettant la vraie fenêtre. Documente l'échantillonnage et les limitations.
Ajoute démarrage/fermeture sûrs, coordination sync/recompute, gestion données périmées et course terminée sans données fraîches. Le retry est idempotent et les résultats figés ne sont pas recomputés. Ne prétends pas connaître des wagers entre snapshots.
Public : upcoming/live/closed, countdown vers le début ou la fin selon état, métrique, règle, prize distribution, dernière mise à jour, liste complète paginée, détails par course et archives. Masque les identités avant de les envoyer au client public. Corrige les liens CTA existants si trompeurs.

ÉTAPE 3 — TOURNAMENTS
Crée /admin/tournaments : brouillon/upcoming, 8 slots, ordre/seeds uniques 1..8, slot/provider/image, titre/prize, aperçu bracket, lancement, saisie multiplicateurs, résultat et archive. Réutilise la recherche slots existante si pertinente.
Crée 4 quarter-finals, 2 semi-finals, 1 finale. À chaque résultat, compare les scores décimaux, valide que le gagnant appartient au match et propage vers le bon slot du round suivant dans la même transaction. Aucun match n'est scoré avant ses participants. Une égalité impose un replay/tie-break annoncé ; ne choisis pas arbitrairement le gagnant.
Interdis une correction qui invaliderait des matches descendants déjà joués ; explique l'erreur dans l'UI. Finalise automatiquement après une finale valide ; protège un tournoi terminé. Pas de simulateur blackjack.
Public : upcoming/live/finished, bracket desktop lisible et rounds adaptés au mobile, scores, champion, règles et archives. Corrige la sélection actuelle qui ignore upcoming et peut privilégier un finished récent sur un live.

ÉTAPE 4 — BONUS HUNT
Crée /admin/bonus-hunt : création, start balance, slots/mises strictement positives, ordre, modification avant ouverture, saisie payout incluant zéro, état et clôture/archive. Définis une règle unique d'active hunt et protège sa concurrence.
Réutilise computeHuntStats avec calcul décimal. Distingue somme des bets, coût du hunt/bankroll de référence, payouts, final balance et profit dans les labels. Pour le MVP, explicite la convention actuelle où final balance = somme payouts ; n'invente pas des coûts depuis les mises. Si un solde restant est requis, ajoute un champ explicite et adapte les formules et migrations.
Public : opened/remaining, multiplier par slot, return cumulé, break-even, résultats/historique. Finalisation refusée tant que des bonuses restent non ouverts.

ÉTAPE 5 — GUESS THE BALANCE
Crée /admin/guess-the-balance : créer round et prize, liaison optionnelle hunt, ouvrir, fermer, saisie final balance, preview du gagnant, settlement transactionnel et historique. Un round fermé rejette les nouvelles entrées et les edits ; un round settled est immuable. Contrôle qu'une seule round est ouverte.
Lorsque liée à un hunt, ferme la round avant la première ouverture de bonus dans la même transaction. Settlement seulement après un résultat définitif ; prends automatiquement la final balance du hunt selon notre convention.
Conserve la participation !gb <amount> en chat et latest guess wins avant cutoff. Vérifie la documentation officielle Kick pour le payload, broadcaster, identité stable, timestamp signé et abonnement aux événements ; ne fais pas confiance à un id d'utilisateur envoyé par un client public. Utilise le kick_user_id quand fiable et une politique de fallback documentée. Vérifie que l'événement provient du broadcaster configuré. Fournis dans l'admin le statut collecte/configuration ; aucune clé exposée.
Corrige GB_COMMAND_RE : commande complète, decimal non négatif valide, bornes DECIMAL(20,8), rejet d'infini/exposants/suffixes/overflow. Utilise decimal.js ou arithmétique DECIMAL SQL, jamais Number pour la distance ou le choix du gagnant.
Calcule le winner sur TOUS les guesses éligibles. Trie en base par ABS(amount-actual_balance) AVANT LIMIT ; ajoute pagination et COUNT total indépendant. En cas d'égalité : distance, timestamp du dernier guess accepté puis id stable ; stocke ce timestamp si nécessaire et affiche la règle avant ouverture. Décide et documente la politique de messages reçus après cutoff ; ne rouvre pas une round settled pour une livraison tardive. Empêche les messages rejoués de changer le guess via la déduplication existante.
Public : règles, prize, état, vrai nombre de participants, compte à rebours si deadline configurée, standings corrects, gagnant/écart et archives.

ÉTAPE 6 — CHALLENGES
Crée /admin/challenges : slot/provider/image, multiplicateur cible, min bet, prize, expiration et classement des cartes ; édition avant claim, expiration, review preuve puis validation/rejet.
Choisis pour le MVP un traitement par admin des preuves reçues hors site ; expose clairement cette procédure sans ajouter de faux formulaire public non connecté. Enregistre replay URL ou référence de preuve, pseudo/identité du claimant, actual bet/multiplier et timestamps. Valide les seuils en decimal. Un seul claim accepté par challenge, transaction et row lock ; refuse claim expiré ou déjà attribué. N'effectue pas d'autoverification imaginaire de l'historique casino.
Public : conditions, expiry, preuve/procédure de claim, résultat masqué et archives. N'affiche jamais claimed sans gagnant validé.

ÉTAPE 7 — INTÉGRATION
- Remplace les cinq SOON de AdminShell par des liens utilisables uniquement quand les parcours sont terminés. Ajoute navigation admin mobile réellement accessible ; l'aside actuel est caché sur mobile.
- Ajoute stats réelles et raccourcis au dashboard, respects page_visibility, refresh des vues publiques actives avec mécanisme existant ou polling raisonnable, et états loading/error/empty distincts. Une panne DB ne doit pas être présentée comme « no event ».
- Étends Hall of Fame aux résultats finalisés de races/tournaments/GB ; aligne la requête big hits sur la politique de publication choisie.
- Vérifie le scheduler existant, l'ordre sync puis races, l'auth cron et le dernier succès visible. Pas de cadence « realtime » si le provider ne la garantit pas.
- Termine l'import manual annoncé par le provider : CSV validé, scope de période explicite, preview, erreurs par ligne, aucune ingestion de données non validées. Ne mélange pas les données de différentes périodes.
- Durcis les actions periods : dates valides, distribution, transitions et activation atomiques ; ne rouvre pas des résultats fermés. Le MVP conserve la règle d'une période active. Weekly/monthly simultanées seraient une évolution séparée, documentée.
- Corrige README/setup pour le vrai besoin de MySQL et de la configuration Kick. Aucun secret dans docs/logs/réponses publiques.
- Ledger paiements, comptes viewers/OAuth, liaison casino et raffle à tickets sont hors périmètre MVP. Liste-les séparément comme propositions, sans élargir le chantier.

VALIDATION ET LIVRABLES
Baseline de l'audit : typecheck OK, 13 tests OK. Exécute typecheck, lint, tests et build après tes modifications ; distingue toute limitation d'environnement d'une réussite réelle.
Ajoute des tests utiles pour : course baseline absente/fenêtre finie/late sync/precision ; propagation bracket/égalité/correction interdite ; GB winner après la 100e entrée/distance exacte/tie/latest guess/cutoff/settle concurrent ; hunt payout zero/first bonus closure ; claim concurrent et expiré ; accès admin refusé et validation des mutations.
Exerce les requêtes et migrations importantes sur une DB MySQL de test isolée lorsque disponible : les mocks seuls ne valident pas la syntaxe SQL ou les locks. Ne lance pas de migrations sur une DB de production ou reset global.
Vérifie chaque parcours admin création → live → résultat → archive et sa page publique, dont mobile, refresh, erreurs et masquage. En absence d'un navigateur ou DB de test, fournis une procédure de vérification exacte et marque ces checks non exécutés.
Livre le code, migrations, documentation de configuration, checklist de réception et rapport concis avec fichiers modifiés, vérifications réalisées, limites et travail restant réel. Ne déclare pas « terminé » simplement parce que les tags SOON ont disparu.
```
