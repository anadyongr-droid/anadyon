/**
 * A regex-free shape check. The obvious `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` is
 * polynomial-time on adversarial input, because "." belongs to both the
 * character class before it and the one after it, so a string like
 * "!.!.!.!.!" forces repeated backtracking. Splitting on fixed characters
 * runs in linear time and accepts/rejects exactly the same shapes.
 */
export function looksLikeEmail(value: string): boolean {
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (/\s/.test(local) || /\s/.test(domain)) return false;
  const dot = domain.indexOf(".");
  return dot > 0 && dot < domain.length - 1;
}
