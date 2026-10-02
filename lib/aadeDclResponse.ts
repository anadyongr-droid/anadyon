import { SaxesParser } from "saxes";

/** DCL v1.1 section 6: transport success alone does not establish acceptance. */
export function readDclSubmissionId(xml: string): string {
  if (xml.length > 1_000_000) throw new Error("AADE response is too large");
  const parser = new SaxesParser({ xmlns: true });
  const path: string[] = [];
  const values: Record<string, string[]> = {};
  let responses = 0;
  let text = "";
  let hasErrors = false;
  parser.on("doctype", () => { throw new Error("AADE response contains a document type"); });
  parser.on("opentag", (tag) => {
    path.push(tag.local);
    if (path.length === 1 && tag.local !== "ResponseDoc") throw new Error("Unexpected AADE response");
    if (path.join("/") === "ResponseDoc/response") responses++;
    if (tag.local === "errors") hasErrors = true;
    text = "";
  });
  parser.on("text", (value) => { text += value; });
  parser.on("cdata", (value) => { text += value; });
  parser.on("closetag", () => {
    if (path.length === 3 && path[0] === "ResponseDoc" && path[1] === "response") {
      (values[path[2]] ??= []).push(text.trim());
    }
    path.pop(); text = "";
  });
  parser.write(xml).close();
  const status = values.statusCode;
  const ids = values.newClientDclID;
  if (responses !== 1 || status?.length !== 1 || status[0] !== "Success" || hasErrors) {
    throw new Error("AADE did not confirm this client-list submission");
  }
  if (ids?.length !== 1 || !/^[1-9][0-9]*$/.test(ids[0])) {
    throw new Error("AADE did not return a valid client-list reference");
  }
  // Preserve xs:long values exactly; JavaScript numbers can lose digits.
  return ids[0];
}
