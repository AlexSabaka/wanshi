import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readExif, readC2pa } from "./imageMetadata";
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
