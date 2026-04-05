import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { saveSecrets, loadSecrets } from "../secrets";

vi.mock("node:fs/promises");
vi.mock("node:crypto");

describe("secrets service", () => {
  const mockMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 32 bytes hex
  const mockPayload = { BANTAY_LLM_API_KEY: "test-key" };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("saveSecrets", () => {
    it("should encrypt and write to ~/.bantay/secrets when BANTAY_MASTER_KEY is set", async () => {
      vi.stubEnv("BANTAY_MASTER_KEY", mockMasterKey);

      const mockCipher = {
        update: vi.fn().mockReturnValue("abc"),
        final: vi.fn().mockReturnValue("def"),
        getAuthTag: vi.fn().mockReturnValue(Buffer.from("tag-hex")),
      };
      vi.mocked(crypto.createCipheriv).mockReturnValue(mockCipher as any);
      vi.mocked(crypto.randomBytes).mockReturnValue(Buffer.from("iv-data-16bytes-long") as any);

      await saveSecrets(mockPayload);

      // Verify directory creation
      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining(".bantay"), {
        recursive: true,
      });

      // Verify written content
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("secrets"),
        expect.stringContaining('"iv":"'),
        "utf8"
      );

      const writtenData = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0][1] as string);
      expect(writtenData).toHaveProperty("iv");
      expect(writtenData).toHaveProperty("tag");
      expect(writtenData).toHaveProperty("data");

      // Verify permissions
      expect(fs.chmod).toHaveBeenCalledWith(expect.stringContaining("secrets"), 0o600);
    });

    it("should throw if BANTAY_MASTER_KEY is not set", async () => {
      vi.stubEnv("BANTAY_MASTER_KEY", "");
      await expect(saveSecrets(mockPayload)).rejects.toThrow("BANTAY_MASTER_KEY is not set.");
    });
  });

  describe("loadSecrets", () => {
    it("should return {} when BANTAY_MASTER_KEY is not set", async () => {
      vi.stubEnv("BANTAY_MASTER_KEY", "");
      const secrets = await loadSecrets();
      expect(secrets).toEqual({});
    });

    it("should return {} when secrets file does not exist", async () => {
      vi.stubEnv("BANTAY_MASTER_KEY", mockMasterKey);
      vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });

      const secrets = await loadSecrets();
      expect(secrets).toEqual({});
    });

    it("should return {} and warn when file contains invalid JSON", async () => {
      vi.stubEnv("BANTAY_MASTER_KEY", mockMasterKey);
      vi.mocked(fs.readFile).mockResolvedValue("invalid-json");
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const secrets = await loadSecrets();
      expect(secrets).toEqual({});
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should return {} and warn when decryption fails", async () => {
      vi.stubEnv("BANTAY_MASTER_KEY", mockMasterKey);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ iv: "a", tag: "b", data: "c" }));

      const mockDecipher = {
        setAuthTag: vi.fn(),
        update: vi.fn().mockReturnValue(""),
        final: vi.fn().mockImplementation(() => {
          throw new Error("Decryption failed");
        }),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(mockDecipher as any);
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const secrets = await loadSecrets();
      expect(secrets).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to load secrets"));
    });

    it("should return decrypted payload when file exists and key is correct", async () => {
      vi.stubEnv("BANTAY_MASTER_KEY", mockMasterKey);

      const encryptedBlob = JSON.stringify({
        iv: "ivhex",
        tag: "taghex",
        data: "datahex",
      });
      vi.mocked(fs.readFile).mockResolvedValue(encryptedBlob);

      const mockDecipher = {
        setAuthTag: vi.fn(),
        update: vi.fn().mockReturnValue(JSON.stringify(mockPayload)),
        final: vi.fn().mockReturnValue(""),
      };
      vi.mocked(crypto.createDecipheriv).mockReturnValue(mockDecipher as any);

      const secrets = await loadSecrets();
      expect(secrets).toEqual(mockPayload);
    });
  });
});
