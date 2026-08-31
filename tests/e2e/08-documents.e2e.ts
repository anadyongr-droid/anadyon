import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, db, req } from "./helpers";

const { GET: listDocuments, POST: createUpload, DELETE: deleteDocument } =
  await import("@/app/api/admin/documents/route");
const { GET: createDownload } =
  await import("@/app/api/admin/documents/download/route");

const BUCKET = "reservation-documents";
const RESERVATION_ID = "30000000-0000-4000-8000-000000000002";
const ORIGINAL_NAME = "ZZTEST driving licence.pdf";
const CONTENT_TYPE = "application/pdf";
const CONTENT = new TextEncoder().encode(
  "%PDF-1.4\n% synthetic staging acceptance document — no personal data\n",
);

let path = "";
let signedDownloadUrl = "";

async function removeSyntheticDocuments() {
  const { data, error } = await db.storage.from(BUCKET).list(RESERVATION_ID);
  expect(error).toBeNull();
  const paths = (data ?? [])
    .filter((object) => object.name.includes("ZZTEST"))
    .map((object) => `${RESERVATION_ID}/${object.name}`);
  if (paths.length) {
    const removed = await db.storage.from(BUCKET).remove(paths);
    expect(removed.error).toBeNull();
  }
}

describe("phase 8 — private reservation documents", () => {
  beforeAll(async () => {
    await removeSyntheticDocuments();
  });

  afterAll(async () => {
    await removeSyntheticDocuments();
  });

  it("keeps the bucket private and enforces its upload contract", async () => {
    const { data, error } = await db.storage.getBucket(BUCKET);
    expect(error, error?.message).toBeNull();
    expect(data?.public).toBe(false);
    expect(data?.file_size_limit).toBe(10 * 1024 * 1024);
    expect(data?.allowed_mime_types).toEqual([
      "image/jpeg",
      "image/png",
      "image/heic",
      "image/webp",
      "application/pdf",
    ]);
  });

  it("uploads synthetic evidence through a signed URL", async () => {
    const response = await createUpload(
      req("/api/admin/documents", "POST", {
        reservation_id: RESERVATION_ID,
        file_name: ORIGINAL_NAME,
        content_type: CONTENT_TYPE,
      }),
    );
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.path).toMatch(
      new RegExp(`^${RESERVATION_ID}/\\d{13}-${ORIGINAL_NAME.replace(".", "\\.")}$`),
    );
    expect(body.token).toBeTruthy();
    path = body.path;

    const upload = await anon.storage
      .from(BUCKET)
      .uploadToSignedUrl(path, body.token, CONTENT, { contentType: CONTENT_TYPE });
    expect(upload.error, upload.error?.message).toBeNull();
  });

  it("keeps the object private from the anonymous client", async () => {
    const download = await anon.storage.from(BUCKET).download(path);
    expect(download.data).toBeNull();
    expect(download.error).not.toBeNull();
  });

  it("lists the original staff-facing filename, not its storage prefix", async () => {
    const response = await listDocuments(
      req(`/api/admin/documents?reservation_id=${RESERVATION_ID}`, "GET"),
    );
    const rows = await response.json();
    const uploaded = rows.find((row: { path: string }) => row.path === path);

    expect(response.status).toBe(200);
    expect(uploaded).toBeTruthy();
    expect(uploaded.name).toBe(ORIGINAL_NAME);
    expect(uploaded.size).toBe(CONTENT.byteLength);
  });

  it("downloads the exact bytes only through a short-lived signed URL", async () => {
    const response = await createDownload(
      req(`/api/admin/documents/download?path=${encodeURIComponent(path)}`, "GET"),
    );
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.url).toContain("/storage/v1/object/sign/");
    signedDownloadUrl = body.url;

    const downloaded = await fetch(signedDownloadUrl);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("content-type")).toContain(CONTENT_TYPE);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(CONTENT);
  });

  it("deletes the object and leaves no staging evidence behind", async () => {
    const response = await deleteDocument(
      req("/api/admin/documents", "DELETE", { path }),
    );
    expect(response.status).toBe(200);

    const { data, error } = await db.storage.from(BUCKET).list(RESERVATION_ID);
    expect(error).toBeNull();
    expect(data?.some((object) => `${RESERVATION_ID}/${object.name}` === path)).toBe(false);

    // A signed URL only grants time-bounded access to an existing object. It
    // must not keep a deleted identity document alive until token expiry.
    const staleDownload = await fetch(signedDownloadUrl);
    expect(staleDownload.ok).toBe(false);
    path = "";
  });
});
