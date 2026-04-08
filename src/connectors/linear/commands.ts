import { LINEAR_MENTION_ALIASES } from "../../branding.ts";

export interface FelizCommand {
  command: string;
  extraText: string;
}

const VALID_COMMANDS = [
  "start",
  "plan",
  "retry",
  "status",
  "approve",
  "cancel",
  "decompose",
];

export function parseCommand(text: string): FelizCommand | null {
  if (!text) return null;

  const mentionPattern = new RegExp(
    `@(?:${LINEAR_MENTION_ALIASES.map((alias) => alias.replace(/-/g, "\\-")).join("|")})\\s+(\\w+)(.*)?`,
    "i"
  );
  const match = text.match(mentionPattern);
  if (!match) return null;

  const command = match[1]!.toLowerCase();
  if (!VALID_COMMANDS.includes(command)) return null;

  const extraText = (match[2] ?? "").trim();

  return { command, extraText };
}
