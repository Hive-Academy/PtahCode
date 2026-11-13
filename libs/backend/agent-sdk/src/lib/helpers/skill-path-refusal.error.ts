/** Refusal for a phase skill that resolves outside the session workspace. */
export class SkillPathRefusalError extends Error {
  constructor() {
    super('Skill path is outside the session workspace');
    this.name = 'SkillPathRefusalError';
  }
}
