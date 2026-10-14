import { describe, expect, it } from "vitest";
import { MOCK_SETTINGS } from "../mock/settings";
import { getAccountSettings } from "./settings";

describe("api pengaturan", () => {
  it("mengembalikan salinan supaya data tiruan tidak berubah oleh pemakai", async () => {
    const settings = await getAccountSettings();
    expect(settings).toEqual(MOCK_SETTINGS);
    settings.profile.displayName = "Diubah";
    expect(MOCK_SETTINGS.profile.displayName).toBe("Rina Analis");
  });
});
