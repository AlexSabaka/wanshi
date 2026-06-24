import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readExif, readC2pa, formatExifDateTaken } from "./imageMetadata";
import { stubLogger } from "../../../../__tests__/helpers";

describe("readExif", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgexif-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("returns undefined (no throw) for a file with no parseable EXIF", async () => {
    const p = path.join(tmp, "not-an-image.txt");
    fs.writeFileSync(p, "plain text, definitely not a JPEG with EXIF");
    await expect(readExif(p, stubLogger())).resolves.toBeUndefined();
  });

  it("returns undefined (no throw) for a missing file", async () => {
    await expect(readExif(path.join(tmp, "ghost.jpg"), stubLogger())).resolves.toBeUndefined();
  });
});

// WS-20: EXIF capture time must not round-trip a local-time Date through
// toISOString() (which shifts by the host UTC offset and falsely labels UTC).
describe("formatExifDateTaken (WS-20)", () => {
  it("anchors the offset from OffsetTimeOriginal instead of shifting the clock", () => {
    // A photo taken at 10:30 local in UTC+2 stays 10:30, now zone-anchored.
    expect(formatExifDateTaken("2026:06:19 10:30:00", "+02:00")).toBe("2026-06-19T10:30:00+02:00");
  });

  it("keeps a floating local time (no Z) when no offset tag is present", () => {
    const out = formatExifDateTaken("2026:06:19 10:30:00");
    expect(out).toBe("2026-06-19T10:30:00");
    expect(out).not.toMatch(/Z$/); // never fabricates UTC
    expect(out).not.toMatch(/[+-]\d{2}:\d{2}$/); // and never fabricates an offset
  });

  it("renders a Date as local wall-clock without a UTC round-trip", () => {
    // Build a Date at a known LOCAL wall-clock; the output must echo that clock,
    // regardless of the host zone — unlike toISOString() which would shift it.
    const d = new Date(2026, 5, 19, 10, 30, 0); // local 2026-06-19 10:30:00
    expect(formatExifDateTaken(d)).toBe("2026-06-19T10:30:00");
  });

  it("ignores a malformed offset rather than appending garbage", () => {
    expect(formatExifDateTaken("2026:06:19 10:30:00", "bogus")).toBe("2026-06-19T10:30:00");
  });

  it("returns undefined for a nullish datetime", () => {
    expect(formatExifDateTaken(undefined)).toBeUndefined();
    expect(formatExifDateTaken(null)).toBeUndefined();
  });
});

describe("readC2pa", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgc2pa-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("reports unavailable (no throw) when the c2patool binary is missing", async () => {
    const p = path.join(tmp, "img.jpg");
    fs.writeFileSync(p, "not really an image");
    const res = await readC2pa(p, "kg-gen-no-such-c2patool-bin", stubLogger());
    expect(res.present).toBe(false);
    expect(res.unavailable).toBe(true);
  });
});
