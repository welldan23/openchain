import { describe, expect, it } from "vitest";
import {
  evidenceAnchor,
  evidenceFromEdges,
  evidenceFromHops,
  evidenceFromTransfers,
  evidenceLink,
  parseEvidenceAnchor,
} from "./evidence";
import { MOCK_MAPS } from "./mock/maps";
import { MOCK_FLOWS } from "./mock/flows";
import { MOCK_TRACES } from "./mock/traces";

const evmHash = `0x${"ab".repeat(32)}`;
const solSig = "5".repeat(88);

describe("tautan bukti", () => {
  it("membuat dan membaca fragmen bukti", () => {
    expect(evidenceAnchor(evmHash)).toBe(`bukti-${evmHash}`);
    expect(parseEvidenceAnchor(`#bukti-${evmHash}`)).toBe(evmHash);
    expect(parseEvidenceAnchor(`bukti-${solSig}`)).toBe(solSig);
  });

  it("menolak fragmen yang bukan tautan bukti atau hash yang rusak", () => {
    expect(parseEvidenceAnchor("#transfer")).toBeNull();
    expect(parseEvidenceAnchor("#bukti-0x1234")).toBeNull();
    expect(parseEvidenceAnchor("#bukti-<script>")).toBeNull();
    expect(parseEvidenceAnchor("")).toBeNull();
  });

  it("mengganti fragmen lama di URL halaman", () => {
    expect(evidenceLink("https://x.test/flow/ethereum/0xa?rentang=7h#transfer", evmHash)).toBe(
      `https://x.test/flow/ethereum/0xa?rentang=7h#bukti-${evmHash}`,
    );
  });
});

describe("kumpulan bukti", () => {
  it("menggabungkan transfer dengan hash yang sama dan menyusun arah pengirim → penerima", () => {
    const deployer = MOCK_FLOWS.find((flow) => flow.label?.name === "Deployer NBLA")!;
    const evidence = evidenceFromTransfers(deployer.chain, { address: deployer.address, label: deployer.label }, deployer.transfers);
    expect(evidence).toHaveLength(4);
    const addLiquidity = evidence.find((item) => item.movements.length === 2)!;
    expect(addLiquidity.movements.map((item) => item.asset.symbol)).toEqual(["ETH", "NBLA"]);
    expect(addLiquidity.movements.every((item) => item.from === deployer.address)).toBe(true);
    const funding = evidence.find((item) => item.movements[0].to === deployer.address)!;
    expect(funding.movements[0].fromLabel?.type).toBe("exchange");
  });

  it("satu bukti per langkah jalur", () => {
    const [trace] = MOCK_TRACES;
    const evidence = evidenceFromHops(trace.chain, trace.hops);
    expect(evidence.map((item) => item.txHash)).toEqual(trace.hops.map((hop) => hop.txHash));
    expect(evidence[0].movements[0]).toMatchObject({ from: trace.from, amount: 12 });
  });
});

describe("bukti dari garis peta", () => {
  it("satu bukti per transaksi dengan label dari gelembung", () => {
    const [nbla] = MOCK_MAPS;
    const evidence = evidenceFromEdges(nbla.chain, nbla.edges, nbla.nodes);
    expect(evidence).toHaveLength(new Set(nbla.edges.map((edge) => edge.txHash)).size);
    const funding = evidence.find((item) => item.movements[0].fromLabel?.type === "exchange" && item.movements[0].amount === 12)!;
    expect(funding.movements[0].toLabel?.name).toBe("Pendana bersama 5 wallet");
  });
});
