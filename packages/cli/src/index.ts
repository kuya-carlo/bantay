#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { scanCommand } from "./commands/scan";
import { initCommand } from "./commands/init";
import { loginCommand } from "./commands/login";

const program = new Command();

program
  .name("bantay")
  .description("Security-first secret detection with Auth0 Human-in-the-Loop")
  .version("0.1.0");

program
  .command("scan")
  .description("Scan for secrets and assess risk")
  .option("--staged", "Scan only staged changes")
  .option("--ci", "Scan full branch diff against origin/main (for CI environments)")
  .option("--pre-push", "Scan changes about to be pushed (handles stdin from git)")
  .option("--all-files", "Scan all files in the working tree")
  .option("--all", "Everything — all files AND all commits from the beginning")
  .action(async (options) => {
    try {
      await scanCommand(options);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

program
  .command("init [directory]")
  .description("Initialize Bantay and install pre-push hook")
  .action(async (directory) => {
    try {
      await initCommand(directory);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

program
  .command("login")
  .description("Authenticate with Auth0 via GitHub")
  .option("--tenant <name>", "Specify tenant name for authentication", "default")
  .action(async (options) => {
    try {
      await loginCommand(options);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

program.parse();
