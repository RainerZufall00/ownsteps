import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMultipart, TMP_DIR } from "@/lib/multipart";

function request(form: FormData) {
  return new Request("http://localhost/upload", { method: "POST", body: form });
}

function filesInTmp() {
  return fs.existsSync(TMP_DIR) ? fs.readdirSync(TMP_DIR) : [];
}

describe("parseMultipart", () => {
  it("streams files to disk and keeps text fields", async () => {
    const form = new FormData();
    form.set("stepId", "7");
    form.set("file", new File(["hello video"], "Müller Ü.mp4", { type: "video/mp4" }));

    const parsed = await parseMultipart(request(form), () => 1000);
    const file = parsed.file("file")!;

    expect(parsed.fields.get("stepId")).toBe("7");
    expect(file).toMatchObject({ name: "Müller Ü.mp4", type: "video/mp4", size: 11 });
    expect(fs.readFileSync(file.path, "utf8")).toBe("hello video");

    await parsed.dispose();
    expect(fs.existsSync(file.path)).toBe(false);
  });

  it("stops writing a file at its limit but reports its real size", async () => {
    const form = new FormData();
    form.set("small", new File(["x".repeat(10)], "a.jpg", { type: "image/jpeg" }));
    form.set("big", new File(["y".repeat(5000)], "b.mp4", { type: "video/mp4" }));

    const parsed = await parseMultipart(request(form), (type) =>
      type.startsWith("video/") ? 100 : 1000,
    );

    const big = parsed.file("big")!;
    expect(big.size).toBe(5000);
    expect(fs.statSync(big.path).size).toBeLessThanOrEqual(100);
    expect(parsed.file("small")!.size).toBe(10);
    await parsed.dispose();
  });

  it("refuses bodies that aren't multipart and leaves nothing behind", async () => {
    const before = filesInTmp().length;
    await expect(
      parseMultipart(
        new Request("http://localhost/upload", { method: "POST", body: "{}" }),
        () => 1000,
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });

    const broken = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=xyz" },
      body: '--xyz\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\n\r\nunfinished',
    });
    await expect(parseMultipart(broken, () => 1000)).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(filesInTmp().length).toBe(before);
  });
});
