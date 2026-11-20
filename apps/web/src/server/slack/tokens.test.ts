import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./tokens";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe("bot token encryption", () => {
  it("round-trips and never stores the token in the clear", async () => {
    const stored = await encryptToken("xoxb-123-secret", key);
    expect(stored).not.toContain("xoxb");
    expect(await decryptToken(stored, key)).toBe("xoxb-123-secret");
  });

  it("uses a fresh IV each time", async () => {
    expect(await encryptToken("xoxb-1", key)).not.toBe(await encryptToken("xoxb-1", key));
  });

  it("fails with the wrong key", async () => {
    const other = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
    await expect(decryptToken(await encryptToken("xoxb-1", key), other)).rejects.toThrow();
  });
});
