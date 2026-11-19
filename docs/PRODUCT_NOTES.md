# Product notes

Detailed choices behind polis. The [README](../README.md) has the overview; this file has the details.

## Profile and personalised feed

- `/bienvenue` (onboarding): name, "can you vote in France?", habits (follows the news, voted, registered), an optional 3-question level test, topics, a 3-screen tutorial, result. Every step can be skipped ("Passer" / "Tout passer"). The account email is optional and saved in `accounts` through `/api/account`.
- Level = right answers in the test + how often they follow the news → débutant / intermédiaire / avancé. Beginners get the "bases" cards first; advanced players go straight to the news. Not registered (or not sure) → the registration card comes first.
- Feed rule (`lib/feed.ts`, `pickNext`, since 2026-11-19, decision D2). Two promises, checked by `npm test` (`lib/feed.test.ts`, 300 simulated swipes):
  1. **Theme preference.** The feed learns which *topics* the player likes, never which camp. Each topic has a score kept on the phone (`p27.topicScores`): swipe right / 👍 +1, swipe left / 👎 −1 (changing your mind undoes the first one), opening "Ce que dit chaque camp" +0.5; topics chosen at onboarding start at +2. The next topic is picked at random, weighted by score (`1 + score/2`, between 0.2 and 10), so liked topics come up more often (a player who likes only energy gets about half energy cards). Guard rails: never more than 3 cards in a row on the same topic, and at least 1 card in 4 from outside the player's top 3 topics. The random draw is seeded by the phone's id and the card's position, so a reload gives the same order.
  2. **Camp balance.** Inside the chosen topic, the camp shown least on that topic so far comes next; ties go to the camp shown least overall; never the same camp twice in a row when there is a choice. If the topic has no card left from that camp, that camp's card comes from the best-liked other topic. A neutral card (the basics first) comes after every 2 or 3 camp cards. Likes never move a camp: a player who likes only left-wing cards still gets each camp at 25 % ± 5 of camp cards.
- "Pourquoi ces actus ?" explains both rules, shows the player's top 3 topics and has a "Remettre à zéro" button (clears `p27.topicScores`; the onboarding topics stay).
- The left–right slider was removed (D2): the feed doesn't need it, and it was the most sensitive data in the app. Phones that stored a position have it deleted the next time the app loads (`lib/profile.ts`).
- Topics (`content/topics.json`): 13, including **Énergie** (fuel taxes, electricity, nuclear). "Emploi" became "Emploi et retraites". Every card is filed under the topic its substance is about (e.g. the fuel-tax cards under Énergie, not Pouvoir d'achat).

## Challenges

- **Answers always explained**: after every answer, the player sees right/wrong, the right answer, why, and the source, then taps "Question suivante".
- **Difficulty**: every question has `difficulty` 1 (easy), 2 (medium) or 3 (hard). The player picks Progressif (default: starts easy, +1 level after 2 right answers in a row, −1 after a mistake), Facile, Moyen or Difficile. Logic in `lib/difficulty.ts`.
- A friend's link replays exactly the same questions (`item_ids` in `challenges`). Team matches use the same questions for everybody (easiest first).
- "Joue avec un ami" explains the 3 steps in the challenges page, the share sheet and the friend's landing page.

## International players and English

- Players who can't vote at the presidential election (EU / non-EU / not sure) get the "qui peut voter / pourquoi ça te concerne / élections étudiantes" cards (`audience: "intl"` in `feed.json`) and no registration reminders.
- FR/EN switch in the top bar and in the profile; default = browser language. UI strings are written inline as `t("français", "English")` (`lib/i18n.ts`). Content translations live in `content/en/overlay.json`, matched by id; anything missing falls back to French.

## Privacy

- The app never asks for a political position. The server still strips `position`, `ideas`, `leaning`, `opinion`, `side`, `pour` and `contre` from every event, as a safety net.
- `feed_reaction` has no session id (anonymous) and carries `cardId`, `camp`, `topic`, `reaction`. `/stats` shows likes per camp and per topic, to check the balance; topic scores themselves never leave the phone.
- The Pour / Contre answer in "Défends l'autre camp" stays in the component state: never stored, never sent.
- Feed 👍 / 👎 (`feed_reaction`) are stored **without session id or tester tag**: likes per camp can be counted, but never linked to a player.
- The account has an email and no password (one row per email, linked to the last session that used it). It is never used to write to players: the "prochains défis" emails (`emails` table) need the consent box ticked. First name optional.
- No cookies, no third-party trackers (only `localStorage`).

## Implementation choices not written in the spec

- `challenges` and `match_players` have an extra `total` column (to show "6/8").
- "Your team wins a match" (+50 voix) is granted when both teams have at least 2 finished players and your team's average is strictly higher, once per match.
- "A friend plays your challenge" (+50 voix) is checked each time the app opens.
- If a page is reloaded, the last result is kept for the tab only (`sessionStorage`).
