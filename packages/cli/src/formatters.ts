import chalk from "chalk";

/**
 * Formats risk assessment results for the terminal
 */
export function formatAssessment(assessment: any) {
  const { tier, reason, suggestion } = assessment;
  
  const header = chalk.bold.underline("\n🛡️ Bantay Risk Assessment\n");
  
  let tierColor = chalk.green;
  let symbol = "✅";

  if (tier === "medium") {
    tierColor = chalk.yellow;
    symbol = "⚠️";
  } else if (tier === "high") {
    tierColor = chalk.red;
    symbol = "❌";
  }

  const output = [
    header,
    `${symbol}  Risk Tier: ${tierColor(tier.toUpperCase())}`,
    `📝 Reason: ${reason}`,
    `💡 Suggestion: ${suggestion}\n`
  ];

  return output.join("\n");
}

/**
 * Formats secret findings table
 */
export function formatFindings(findings: any[]) {
  if (findings.length === 0) return chalk.green("\nNo secrets detected.\n");

  const header = chalk.bold("\nPotential Secrets Found:\n");
  const table = findings.map(f => {
    return `${chalk.red("✖")} Line ${chalk.blue(f.line_number)}: ${chalk.yellow(f.type)}`;
  }).join("\n");

  return header + table + "\n";
}

/**
 * Formats the CIBA interrupt message
 */
export function formatInterrupt() {
  return chalk.bold.yellow("\n⏸️  Push Interrupted! Human Authorization Required.\n") +
         "A notification has been sent to your primary device.\n" +
         chalk.dim("Polling for approval... (Timeout: 60s)\n");
}
