// A leaderboard row as it is SENT TO THE CLIENT: username is already masked on
// the server (golden rule 3), casino_id is dropped. delta is the rank change
// since the previous sync (+up / −down / 0 same-or-new).
export interface DisplayRow {
  rank: number;
  maskedName: string;
  wagered: string;
  prize?: string;
  delta: number | null;
}
