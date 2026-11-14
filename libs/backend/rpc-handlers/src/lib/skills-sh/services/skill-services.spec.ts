import 'reflect-metadata';
import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Logger } from '@ptah-extension/vscode-core';
import type { SkillShEntry } from '@ptah-extension/shared';
import { SkillRecommendationService } from './skill-recommendation.service';
import { SkillSelectionService } from './skill-selection.service';
import { ProjectGuidanceService } from './project-guidance.service';
import { SkillConsentService } from './skill-consent.service';

const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Logger;

const entry = (skillId: string, installs = 10): SkillShEntry => ({
  source: 'o/r',
  skillId,
  name: skillId,
  description: '',
  installs,
  isInstalled: false,
});
const CATALOG = [
  entry('angular-patterns'),
  entry('nx-workspace'),
  entry('nestjs-best-practices'),
  entry('nestjs-best-practices'),
];
const search = async (q: string) =>
  CATALOG.filter((e) => e.skillId.includes(q));

const repoRoot = join(__dirname, '..', '..', '..', '..', '..', '..', '..');
const analysis = { projectType: 'x', frameworks: [] };

async function pick(deps: string[]) {
  const recs = await new SkillRecommendationService(logger).recommend({
    analysis,
    dependencies: deps,
    search,
  });
  return new SkillSelectionService(logger)
    .select(recs)
    .map((s) => s.skill.skillId);
}

it('limits 60 dependency keywords to 25 searches with at most four in flight', async () => {
  let active = 0;
  let peak = 0;
  const searched: string[] = [];
  await new SkillRecommendationService(logger).recommend({
    analysis,
    dependencies: Array.from({ length: 60 }, (_, i) => `dep${i}`),
    search: async (keyword) => {
      active++;
      peak = Math.max(peak, active);
      searched.push(keyword);
      await Promise.resolve();
      active--;
      return [];
    },
  });
  expect(searched).toHaveLength(25);
  expect(searched).toEqual(Array.from({ length: 25 }, (_, i) => `dep${i}`));
  expect(peak).toBeLessThanOrEqual(4);
});

describe('skill selection NestJS relevance gate', () => {
  it('negative: the first 25 real repo dependencies select Angular, not NestJS', async () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    );
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.some((d) => d.startsWith('@nestjs/'))).toBe(false);
    const ids = await pick(deps);
    expect(ids).toContain('angular-patterns');
    expect(ids).not.toContain('nestjs-best-practices');
  });

  it('positive: fixture with @nestjs/core selects NestJS', async () => {
    const fixture = JSON.parse('{"dependencies":{"@nestjs/core":"^10.0.0"}}');
    const ids = await pick(Object.keys(fixture.dependencies));
    expect(ids).toEqual(['nestjs-best-practices']);
  });
});

describe('SkillRecommendationService', () => {
  it('returns no duplicates, with evidence, sorted by rank', async () => {
    const recs = await new SkillRecommendationService(logger).recommend({
      analysis,
      dependencies: ['@nestjs/core', '@nestjs/common', '@angular/core'],
      search,
    });
    const ids = recs.map((r) => r.skill.skillId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(recs.every((r) => r.evidence.length > 0)).toBe(true);
    expect(recs.map((r) => r.score)).toEqual(
      [...recs.map((r) => r.score)].sort((a, b) => b - a),
    );
  });
});

describe('SkillSelectionService', () => {
  it('excludes non-recommended user selections and orders installs', () => {
    const sel = new SkillSelectionService(logger).select(
      [{ skill: entry('a'), evidence: 'e', score: 100 }],
      ['a', 'unknown'],
    );
    expect(sel.map((s) => s.installOrder)).toEqual([1]);
    expect(sel).toHaveLength(1);
  });
});

describe('ProjectGuidanceService', () => {
  it('returns labeled facts and owner decision text', async () => {
    const r = await new ProjectGuidanceService(logger).getGuidance({
      frameworks: ['angular'],
    });
    expect(r.facts[0].label).toBe('follow');
    expect(r.ownerDecisionPrompt.length).toBeGreaterThan(0);
  });
});

describe('SkillConsentService', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'skill-consent-'));

  it('detects scripts, install hooks and frontmatter hooks', () => {
    const svc = new SkillConsentService(logger);
    const clean = dir();
    writeFileSync(join(clean, 'SKILL.md'), '---\nname: a\n---\nbody');
    expect(svc.hasScripts(clean)).toBe(false);

    const sh = dir();
    mkdirSync(join(sh, 'bin'));
    writeFileSync(join(sh, 'bin', 'x.sh'), 'echo');
    expect(svc.hasScripts(sh)).toBe(true);

    const extensionless = dir();
    writeFileSync(
      join(extensionless, 'run'),
      '#!/usr/bin/env bash\necho hello',
    );
    expect(svc.hasScripts(extensionless)).toBe(true);

    const pkg = dir();
    writeFileSync(join(pkg, 'package.json'), '{"scripts":{"postinstall":"x"}}');
    expect(svc.hasScripts(pkg)).toBe(true);

    const hook = dir();
    writeFileSync(
      join(hook, 'SKILL.md'),
      '---\nname: a\nhooks:\n  x: y\n---\n',
    );
    expect(svc.hasScripts(hook)).toBe(true);
  });

  it('fails closed when the path is unreadable', () => {
    expect(
      new SkillConsentService(logger).hasScripts(join(dir(), 'missing')),
    ).toBe(true);
  });

  it('refuses a package larger than 10 MB', () => {
    const pkg = dir();
    writeFileSync(join(pkg, 'large.bin'), Buffer.alloc(10 * 1024 * 1024 + 1));
    expect(() => new SkillConsentService(logger).computeContentHash(pkg)).toThrow(
      'Skill package exceeds the file or size limit.',
    );
  });

  it('binds consent to the content hash', () => {
    const svc = new SkillConsentService(logger);
    svc.useStorePath(join(dir(), 'consents.json'));
    const pkg = dir();
    writeFileSync(join(pkg, 'a.sh'), 'one');
    const h1 = svc.computeContentHash(pkg);
    expect(svc.canInstall('s', h1)).toBe(false);
    svc.recordConsent('s', h1);
    expect(svc.canInstall('s', h1)).toBe(true);
    writeFileSync(join(pkg, 'a.sh'), 'two');
    expect(svc.canInstall('s', svc.computeContentHash(pkg))).toBe(false);
  });
});
