#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { scanCommand } from "./commands/scan.js";
import { initCommand } from "./commands/init.js";

const program = new Command();

program
  .name("bantay")
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
  .description("Initialize Bantay and install pre-push hook")
  .action(async () => {
    try {
      await initCommand();
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

program.parse();
