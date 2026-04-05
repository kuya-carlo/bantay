import { ScannerService } from "../services/scanner";
import { scoreRisk } from "./nodes/score";
import { decide } from "./nodes/decide";

export async function buildGraph() {
  return {
    invoke: async (input: { diff: string; approved: null }) => {
      const scanner = new ScannerService();
      const findings = await scanner.scanDiff(input.diff);
      const riskAssessment = await scoreRisk({ findings });
      const decision = await decide({ riskAssessment, approved: null });
      return { findings, riskAssessment, ...decision };
    }
  };
}
