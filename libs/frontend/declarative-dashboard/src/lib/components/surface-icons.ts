import {
  Bot, Brain, ChartBar, Clock, Cpu, FileText, Folder, Gauge, Info, Server,
  Sparkle, Sparkles, Terminal, User, Wrench, Zap, type LucideIconData,
} from 'lucide-angular';
import type { SurfaceIconToken } from '@ptah-extension/shared';

const ICONS: Record<SurfaceIconToken, LucideIconData> = {
  skill: Sparkle,
  agent: Bot,
  server: Server,
  tool: Wrench,
  file: FileText,
  memory: Brain,
  chart: ChartBar,
  clock: Clock,
  bolt: Zap,
  info: Info,
  terminal: Terminal,
  folder: Folder,
  cpu: Cpu,
  gauge: Gauge,
  user: User,
  sparkles: Sparkles,
};

export function surfaceIcon(token: unknown): LucideIconData | null {
  return typeof token === 'string' && Object.hasOwn(ICONS, token)
    ? ICONS[token as SurfaceIconToken]
    : null;
}
