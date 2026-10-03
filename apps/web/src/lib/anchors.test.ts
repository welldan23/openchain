import { describe, expect, it } from "vitest";
import { evidenceAnchorId, findingAnchorId } from "./anchors";
import { MOCK_TOKENS } from "./mock/tokens";

describe("anchor halaman token", () => {
  it("membuat id yang stabil dan aman dipakai di URL", () => {
    expect(findingAnchorId("nbla-owner-tax")).toBe("temuan-nbla-owner-tax");
    expect(evidenceAnchorId("0x870f72f8abcdef0123456789")).toBe("bukti-0x870f72f8abcdef01");
    expect(evidenceAnchorId("0x870f72f8abcdef0123456789")).toMatch(/^[\w-]+$/);
  });

  it("tidak bentrok antarbukti maupun antartemuan dalam satu token", () => {
    for (const item of MOCK_TOKENS) {
      const evidenceIds = item.evidence.map((entry) => evidenceAnchorId(entry.txHash));
      expect(new Set(evidenceIds).size, item.token.symbol).toBe(evidenceIds.length);
      const findingIds = item.risk.findings.map((finding) => findingAnchorId(finding.id));
      expect(new Set(findingIds).size, item.token.symbol).toBe(findingIds.length);
    }
  });
});
