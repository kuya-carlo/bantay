#!/usr/bin/env node
import { Command } from "commander";
import { scanCommand } from "./commands/scan";

const program = new Command();

program
  .name("git-guardian")
  .description("Security-first secret detection with Auth0 Human-in-the-Loop")
  .version("0.1.0");

program
  .command("scan")
  .description("Scan staged changes for secrets and assess risk")
  .action(async () => {
    try {
      await scanCommand();
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Initialize Git Guardian and install pre-push hook")
  .action(async () => {
    // This will be implemented in Phase 4
    console.log("Initializing Git Guardian...");
    console.log("Tip: Pre-push hook installation coming in Phase 4.");
  });

program.parse();
