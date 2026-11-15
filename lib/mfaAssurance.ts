/** Protected administrative requests require a verified second factor. */
export function hasVerifiedMfaAssurance(currentLevel: string | null | undefined): boolean {
  return currentLevel === "aal2";
}
