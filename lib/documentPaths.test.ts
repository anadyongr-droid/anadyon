import { describe, it, expect } from "vitest";
import {
  documentDisplayName,
  isAllowedMime,
  isReservationId,
  parseDocumentPath,
  safeFileName,
} from "@/lib/documentPaths";

/**
 * These rules guard a bucket of customers' driving licences and identity
 * documents. Before them, `?path=` was an instruction the caller wrote and the
 * server obeyed — a signed URL needs no credential once issued.
 */
describe("document paths", () => {
  const RES = "7d1381e8-ddb4-482b-8fc9-3005d522c874";

  it("accepts a real reservation id and rejects anything else", () => {
    expect(isReservationId(RES)).toBe(true);
    for (const bad of ["", "abc", "../../etc", RES + "x", null, 42]) {
      expect(isReservationId(bad)).toBe(false);
    }
  });

  it("strips directory structure out of a filename", () => {
    expect(safeFileName("../../secrets.pdf")).toBe("secrets.pdf");
    expect(safeFileName("/etc/passwd")).toBe("passwd");
    expect(safeFileName("a\\b\\licence.jpg")).toBe("licence.jpg");
  });

  it("refuses names that are only traversal or hidden files", () => {
    expect(safeFileName("..")).toBeNull();
    expect(safeFileName(".")).toBeNull();
    expect(safeFileName(".ssh")).toBe("ssh");
    expect(safeFileName("")).toBeNull();
  });

  it("only accepts a path shaped exactly <uuid>/<filename>", () => {
    expect(parseDocumentPath(`${RES}/licence.jpg`)).toEqual({
      reservationId: RES, fileName: "licence.jpg",
    });
    for (const bad of [
      `${RES}/../other/licence.jpg`,   // traversal
      `${RES}/sub/dir/licence.jpg`,    // nested
      "licence.jpg",                   // no reservation
      `/${RES}/licence.jpg`,           // absolute
      `not-a-uuid/licence.jpg`,        // unverifiable owner
      `${RES}/`,                       // no filename
    ]) {
      expect(parseDocumentPath(bad), `should reject ${bad}`).toBeNull();
    }
  });

  it("allows only image and PDF types, never SVG", () => {
    expect(isAllowedMime("image/jpeg")).toBe(true);
    expect(isAllowedMime("application/pdf")).toBe(true);
    // SVG is script execution wearing an image's clothes.
    expect(isAllowedMime("image/svg+xml")).toBe(false);
    expect(isAllowedMime("text/html")).toBe(false);
    expect(isAllowedMime("application/zip")).toBe(false);
  });

  it("keeps the storage timestamp out of the staff-facing filename", () => {
    expect(documentDisplayName("1788198882523-driving licence.pdf"))
      .toBe("driving licence.pdf");
    // Only the exact Date.now()-prefix shape is internal. A genuine filename
    // starting with another number remains untouched.
    expect(documentDisplayName("2026-rental-agreement.pdf"))
      .toBe("2026-rental-agreement.pdf");
  });
});
