/** Escape LIKE metacharacters while retaining valid literal underscores. */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export function isExactPromoMatch(stored: string, entered: string): boolean {
  return stored.trim().toLowerCase() === entered.trim().toLowerCase();
}
