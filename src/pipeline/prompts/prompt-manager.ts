import prisma from '../database/prisma-client';
import { createLogger } from '../logger/logger';
import { DEFAULT_ARTICLE_PROMPT, DEFAULT_SEO_PROMPT } from './default-prompts';
import { NotFoundError } from '../errors/base.error';

const logger = createLogger('prompt-manager');

export const PROMPT_NAMES = {
  ARTICLE_GENERATION: 'article-generation',
  SEO_GENERATION: 'seo-generation',
} as const;

export const PromptManager = {
  /**
   * Get the active prompt version for a given prompt name.
   * Falls back to defaults if none exists in the database.
   */
  async getActivePrompt(name: string): Promise<{
    id: string | null;
    promptId: string | null;
    version: number;
    content: string;
    variables: string[];
  }> {
    const activeVersion = await prisma.promptVersion.findFirst({
      where: {
        active: true,
        prompt: { name, active: true },
      },
      orderBy: { version: 'desc' },
      include: { prompt: true },
    });

    if (activeVersion) {
      return {
        id: activeVersion.id,
        promptId: activeVersion.promptId,
        version: activeVersion.version,
        content: activeVersion.content,
        variables: activeVersion.variables,
      };
    }

    // Return defaults
    const defaults: Record<string, string> = {
      [PROMPT_NAMES.ARTICLE_GENERATION]: DEFAULT_ARTICLE_PROMPT,
      [PROMPT_NAMES.SEO_GENERATION]: DEFAULT_SEO_PROMPT,
    };

    return {
      id: null,
      promptId: null,
      version: 0,
      content: defaults[name] ?? '',
      variables: [],
    };
  },

  /**
   * Render a prompt template with provided variables.
   */
  render(template: string, variables: Record<string, string>): string {
    return Object.entries(variables).reduce((text, [key, value]) => {
      return text.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }, template);
  },

  /**
   * Create or update a prompt with a new version.
   */
  async upsertPrompt(
    name: string,
    content: string,
    description?: string
  ): Promise<{ promptId: string; versionId: string; version: number }> {
    const prompt = await prisma.prompt.upsert({
      where: { name },
      update: { description, updatedAt: new Date() },
      create: { name, description, active: true },
    });

    // Deactivate current active versions
    await prisma.promptVersion.updateMany({
      where: { promptId: prompt.id, active: true },
      data: { active: false },
    });

    const versionCount = await prisma.promptVersion.count({
      where: { promptId: prompt.id },
    });

    const version = await prisma.promptVersion.create({
      data: {
        promptId: prompt.id,
        version: versionCount + 1,
        content,
        variables: PromptManager.extractVariables(content),
        active: true,
      },
    });

    logger.info({ name, version: version.version }, 'Prompt version created');
    return { promptId: prompt.id, versionId: version.id, version: version.version };
  },

  /**
   * List all prompts with their active versions.
   */
  async listPrompts() {
    return prisma.prompt.findMany({
      include: {
        versions: {
          where: { active: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Get prompt version history.
   */
  async getVersionHistory(promptId: string) {
    const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
    if (!prompt) throw new NotFoundError('Prompt', promptId);

    return prisma.promptVersion.findMany({
      where: { promptId },
      orderBy: { version: 'desc' },
    });
  },

  /**
   * Activate a specific prompt version.
   */
  async activateVersion(promptId: string, versionId: string): Promise<void> {
    const version = await prisma.promptVersion.findFirst({
      where: { id: versionId, promptId },
    });
    if (!version) throw new NotFoundError('PromptVersion', versionId);

    await prisma.promptVersion.updateMany({
      where: { promptId, active: true },
      data: { active: false },
    });

    await prisma.promptVersion.update({
      where: { id: versionId },
      data: { active: true },
    });

    logger.info({ promptId, versionId, version: version.version }, 'Prompt version activated');
  },

  /**
   * Extract template variables from content like {{variableName}}.
   */
  extractVariables(content: string): string[] {
    const matches = content.match(/{{(\w+)}}/g) ?? [];
    return [...new Set(matches.map((m) => m.slice(2, -2)))];
  },

  /**
   * Seed default prompts if they don't exist.
   */
  async seedDefaults(): Promise<void> {
    const defaults = [
      { name: PROMPT_NAMES.ARTICLE_GENERATION, content: DEFAULT_ARTICLE_PROMPT, description: 'Default article generation prompt' },
      { name: PROMPT_NAMES.SEO_GENERATION, content: DEFAULT_SEO_PROMPT, description: 'Default SEO generation prompt' },
    ];

    for (const def of defaults) {
      const existing = await prisma.prompt.findUnique({ where: { name: def.name } });
      if (!existing) {
        await PromptManager.upsertPrompt(def.name, def.content, def.description);
        logger.info({ name: def.name }, 'Default prompt seeded');
      }
    }
  },
};

export default PromptManager;
