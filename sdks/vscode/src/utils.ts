// Test utility functions for the vscode extension

export function formatMessage(message: string): string {
  return message.trim();
}

export function validateInput(input: string): boolean {
  return input.length > 0;
}

export function parseCommand(command: string): { action: string; args: string[] } {
  const parts = command.split(' ');
  return {
    action: parts[0] || '',
    args: parts.slice(1)
  };
}