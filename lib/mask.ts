import "server-only";

// Golden rule 3 (JBALLIN): full usernames must never leave the server. Mask
// before putting a username in any payload sent to the browser.
//
//   length > 4   → first 2 + '*'×(len-4) + last 2
//   length 3–4   → first 1 + '*'×(len-2) + last 1
//   length ≤ 2   → '*'×len   (reveal nothing)
//
// The 2–3 char case is the one that gets forgotten and leaks a near-complete
// username — it is handled explicitly.
export function maskUsername(username: string): string {
  const length = username.length;

  if (length <= 2) {
    return "*".repeat(length);
  }
  if (length <= 4) {
    return username[0] + "*".repeat(length - 2) + username[length - 1];
  }
  return username.slice(0, 2) + "*".repeat(length - 4) + username.slice(length - 2);
}
