import { ScannerService } from "../services/scanner";
import { scoreRisk } from "./nodes/score";
import { decide } from "./nodes/decide";
import { BantayConfig } from "../services/config";

export async function buildGraph(config: BantayConfig) {
  return {
    invoke: async (input: {
      diff: string;
      repoMetadata: { repoVisibility: "public" | "private" };
      approved: null;
    }) => {
      const scanner = new ScannerService(config);
      const findings = await scanner.scanDiff(input.diff, input.repoMetadata.repoVisibility);

      const riskAssessment = await scoreRisk({ findings, repoMetadata: input.repoMetadata });
      const decision = await decide({ riskAssessment, approved: null });
      return { findings, repoMetadata: input.repoMetadata, riskAssessment, ...decision };
    },
  };
}
