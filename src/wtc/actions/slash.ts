export interface TriggerSlashArgs {
  command: string;
}

export interface TriggerSlashResult {
  result: string;
}

export async function triggerSlashAction({ command }: TriggerSlashArgs): Promise<TriggerSlashResult> {
  const result = await triggerSlash(command);
  return { result };
}
