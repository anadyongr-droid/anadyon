#!/usr/bin/env node
import { readFileSync } from "node:fs";

/**
 * Prints a text file as GitHub check-run annotations, so an agent can read it.
 *
 * **Why this exists.** A workflow's step summary is not in the REST API, and
 * logs and artifacts are served from a storage domain an agent container cannot
 * reach — proven on 4 October 2026, when the nightly check found differences at
 * `high` and the only fact obtainable through the API was that the job had
 * failed (W51). Check-run annotations *are* served by the API.
 *
 * **Chunked, because GitHub shows at most ten annotations of each level per
 * step.** Output is split into at most that many pieces and the last one says
 * how much was dropped, rather than ending mid-sentence and looking complete.
 *
 * usage: annotate-text.mjs <file> [title]
 */

export const MAX_ANNOTATIONS = 10;
export const MAX_CHARACTERS = 3000;

/** Workflow commands take `%`, carriage returns and newlines escaped. */
const escapeData = (text) =>
  String(text).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

/**
 * Splits text into annotation-sized pieces, preferring line boundaries so a
 * row of query output is never cut in half.
 *
 * @param {string} text
 * @param {{ limit?: number, pieces?: number }} [options]
 * @returns {{ chunks: string[], omitted: number }}
 */
export function chunk(text, { limit = MAX_CHARACTERS, pieces = MAX_ANNOTATIONS } = {}) {
  const lines = String(text).split("\n");
  /** @type {string[]} */
  const chunks = [];
  let current = "";
  let index = 0;

  for (; index < lines.length; index += 1) {
    const line = lines[index].length > limit ? `${lines[index].slice(0, limit - 1)}…` : lines[index];
    if (current.length + line.length + 1 > limit) {
      if (chunks.length + 1 >= pieces) break;
      chunks.push(current);
      current = line;
      continue;
    }
    current = current === "" ? line : `${current}\n${line}`;
  }
  if (current !== "") chunks.push(current);
  return { chunks, omitted: lines.length - index };
}

/** @param {string[]} argv */
export function main(argv) {
  const [path, title = "output"] = argv;
  if (!path) {
    process.stderr.write("usage: annotate-text.mjs <file> [title]\n");
    return 1;
  }
  const { chunks, omitted } = chunk(readFileSync(path, "utf8"));
  chunks.forEach((piece, index) => {
    const label = `${title} (${index + 1}/${chunks.length})`;
    const tail =
      index === chunks.length - 1 && omitted > 0
        ? `\n… ${omitted} further line(s) not shown — the whole output is the run artifact`
        : "";
    process.stdout.write(`::notice title=${label}::${escapeData(piece + tail)}\n`);
  });
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("annotate-text.mjs")) {
  process.exitCode = main(process.argv.slice(2));
}
