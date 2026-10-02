import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// gmail.ts imports the admin client at module load, which refuses to construct
// without live credentials. None of these tests touch the database.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));

import {
  MAX_ATTACHMENT_BYTES,
  fetchAttachment,
  listAttachments,
  type EmailAttachment,
} from "./gmail";

const read = (p: string) => readFileSync(join(new URL("../", import.meta.url).pathname, p), "utf8");

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

/** A message shaped the way Gmail returns one: bodies inline, attachments by id. */
const payload = {
  mimeType: "multipart/mixed",
  parts: [
    { mimeType: "text/plain", body: { data: b64url("ΚΑΛΗΣΠΕΡΑ") } },
    { mimeType: "text/html", body: { data: b64url("<p>ΚΑΛΗΣΠΕΡΑ</p>") } },
    {
      mimeType: "application/pdf",
      filename: "ANADYON.pdf",
      body: { attachmentId: "att-1", size: 1_016_798 },
    },
  ],
};

describe("finding what is attached", () => {
  it("returns the attachment and not the body parts", () => {
    // text/plain and text/html carry no filename; treating every part with
    // bytes as an attachment would return the message body as a file.
    const found = listAttachments(payload);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      filename: "ANADYON.pdf",
      mimeType: "application/pdf",
      attachmentId: "att-1",
      sizeBytes: 1_016_798,
    });
  });

  it("reaches attachments nested inside a forwarded message", () => {
    // The broker's policy documents arrive this way. A scan of payload.parts
    // one level deep finds nothing here, and reports the message as having no
    // attachments rather than failing.
    const forwarded = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("---------- Forwarded message ---------") } },
        {
          mimeType: "message/rfc822",
          parts: [
            {
              mimeType: "multipart/mixed",
              parts: [
                { mimeType: "application/pdf", filename: "ΙΜΙ2840.pdf", body: { attachmentId: "att-9", size: 288_605 } },
              ],
            },
          ],
        },
      ],
    };
    expect(listAttachments(forwarded).map(a => a.filename)).toEqual(["ΙΜΙ2840.pdf"]);
  });

  it("keeps the bytes of a part Gmail inlined instead of giving an id", () => {
    // Both forms occur in the same mailbox. Handling only attachmentId loses
    // every small file without any error to notice.
    const inline = {
      mimeType: "multipart/mixed",
      parts: [{ mimeType: "text/csv", filename: "list.csv", body: { data: b64url("a,b\n1,2"), size: 7 } }],
    };
    const [a] = listAttachments(inline);
    expect(a.attachmentId).toBeNull();
    expect(a.inlineData).toBe(b64url("a,b\n1,2"));
  });

  it("is empty, not undefined, for a message with no payload", () => {
    expect(listAttachments(null)).toEqual([]);
    expect(listAttachments(undefined)).toEqual([]);
  });

  it("ignores a filename that is only whitespace", () => {
    const odd = { mimeType: "multipart/mixed", parts: [{ mimeType: "text/plain", filename: "   ", body: { data: b64url("x") } }] };
    expect(listAttachments(odd)).toEqual([]);
  });
});

function meta(over: Partial<EmailAttachment> = {}): EmailAttachment {
  return { filename: "p.pdf", mimeType: "application/pdf", attachmentId: "att-1", sizeBytes: 1000, inlineData: null, ...over };
}

describe("downloading the bytes", () => {
  const clientReturning = (data: string | null) => ({
    users: { messages: { attachments: { get: vi.fn(async () => ({ data: { data } })) } } },
  });

  it("decodes base64url, which is not the same as base64", async () => {
    // Gmail uses the URL-safe alphabet: - and _ where base64 has + and /.
    // Decoding as plain base64 corrupts any attachment containing those bytes,
    // and a PDF fails to parse rather than announcing why.
    const bytes = Buffer.from([0xfb, 0xff, 0xbf, 0x00, 0x10]);
    const client = clientReturning(bytes.toString("base64url"));
    const got = await fetchAttachment("m1", meta(), { client });
    expect(got).toEqual(bytes);
  });

  it("refuses an oversized attachment before making the request", async () => {
    const client = clientReturning("x");
    const got = await fetchAttachment("m1", meta({ sizeBytes: MAX_ATTACHMENT_BYTES + 1 }), { client });
    expect(got).toBeNull();
    expect(client.users.messages.attachments.get).not.toHaveBeenCalled();
  });

  it("discards a body that comes back larger than announced", async () => {
    // Gmail's size is advisory. Without this the pre-check is the only guard
    // and a understated size walks straight past it.
    const client = clientReturning(Buffer.alloc(200).toString("base64url"));
    const got = await fetchAttachment("m1", meta({ sizeBytes: 10 }), { client, maxBytes: 100 });
    expect(got).toBeNull();
  });

  it("uses inline bytes without calling Gmail at all", async () => {
    const client = clientReturning(null);
    const got = await fetchAttachment("m1", meta({ attachmentId: null, inlineData: b64url("hello") }), { client });
    expect(got?.toString("utf8")).toBe("hello");
    expect(client.users.messages.attachments.get).not.toHaveBeenCalled();
  });

  it("returns null rather than throwing when Gmail fails", async () => {
    // One unreadable attachment must not fail the message it came with, nor
    // the sync run around it.
    const client = { users: { messages: { attachments: { get: vi.fn(async () => { throw new Error("500"); }) } } } };
    await expect(fetchAttachment("m1", meta(), { client })).resolves.toBeNull();
  });

  it("returns null when there is no client configured", async () => {
    expect(await fetchAttachment("m1", meta(), { client: null })).toBeNull();
  });
});

describe("the sync exposes attachments without downloading them", () => {
  const src = read("lib/gmail.ts");

  it("every parsed email carries its attachment list", () => {
    expect(src).toMatch(/attachments:\s*listAttachments\(/);
  });

  it("the sync loop does not fetch bytes for every message", () => {
    // Downloading every attachment of every synced message would spend most of
    // a sync budget on files nobody asked for. The caller chooses.
    const loop = src.slice(src.indexOf("for (const msg of batch)"), src.indexOf("return { emails: parsed"));
    expect(loop.length).toBeGreaterThan(100);
    expect(loop).not.toContain("fetchAttachment");
  });

  it("reading attachments needs no new OAuth scope", () => {
    // attachments.get is covered by gmail.readonly. Adding a scope would force
    // every existing token through the consent screen again, and a sync that
    // silently stops because the token no longer matches the scope list is a
    // bad way to find that out.
    expect(src).toMatch(/const SCOPES = \["https:\/\/www\.googleapis\.com\/auth\/gmail\.readonly"\]/);
  });
});
