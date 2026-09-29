import { supabaseAdmin } from "@/lib/supabase";

/**
 * When each rate import last *finished*.
 *
 * **This replaces deriving the answer from the data**, which was the original
 * design and was wrong in a way Tasos spotted from the screen: it reported an
 * import as happening today when it had run the day before.
 *
 * The old answer was `MAX(scraped_at)` over the source's rows. That is "when
 * was the newest row last written", which is not the same question. Rows are
 * upserted, so re-touching a row updates its `scraped_at` even when the price
 * has not moved; a pass that is resumed, or that re-fetches searches it already
 * had, drags the maximum forward without any new information arriving. The
 * figure was therefore true about the table and misleading about the import.
 *
 * One stored timestamp per source, written when a pass completes, answers the
 * question directly. It lives in `system_settings` — a key/value table that
 * already exists — so this needs no migration and no agent-applied schema
 * change.
 */

/** `system_settings` key for one source's last completed import. */
const KEY_PREFIX = "rate_import:";

export function importLogKey(source: string): string {
  return `${KEY_PREFIX}${source}`;
}

/**
 * Records that a source's import finished.
 *
 * Called on completion, never on starting or on a partial batch: a half-done
 * pass has not refreshed the prices, and recording it would reintroduce exactly
 * the overstatement this replaces.
 *
 * Failures are swallowed deliberately. This is bookkeeping about an import that
 * has already succeeded and whose data is already stored — losing the note is
 * worth less than failing the import that produced it.
 */
export async function recordImportCompleted(
  source: string,
  at: Date = new Date()
): Promise<void> {
  try {
    await supabaseAdmin.from("system_settings").upsert({
      key: importLogKey(source),
      value: at.toISOString(),
      updated_at: at.toISOString(),
    });
  } catch (err) {
    console.error(`[rateImport] could not record completion for ${source}:`, err);
  }
}

/**
 * The recorded completion time for each source, by source slug.
 *
 * Sources with no entry are absent rather than null, so a caller can tell
 * "never recorded" from "recorded as nothing".
 */
export async function readImportLog(): Promise<Map<string, string>> {
  const log = new Map<string, string>();
  try {
    const { data } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .like("key", `${KEY_PREFIX}%`);
    for (const row of data ?? []) {
      const key = row.key as string;
      const value = row.value as string | null;
      if (value) log.set(key.slice(KEY_PREFIX.length), value);
    }
  } catch (err) {
    console.error("[rateImport] could not read the import log:", err);
  }
  return log;
}
