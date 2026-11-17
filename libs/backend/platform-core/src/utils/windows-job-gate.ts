export const WINDOWS_JOB_SETTING_KEY = 'agentOrchestration.windowsJobs';
export const WINDOWS_JOB_ENV_KEY = 'PTAH_WINDOWS_JOBS';

export interface WindowsJobGateInput {
  policy?: 'job' | 'no-job';
  settingEnabled: boolean;
  env?: string;
  platform: NodeJS.Platform;
  arch: string;
}

export function shouldUseWindowsJob(input: WindowsJobGateInput): boolean {
  return input.platform === 'win32' && input.arch === 'x64' &&
    input.policy === 'job' && (input.settingEnabled || input.env === '1');
}
