import { prisma } from '../src/pipeline/database/prisma-client';
import { passwordService } from '../src/pipeline/auth/password.service';

async function seed() {
  console.log('[SEED] Starting database seeding...');

  // 1. Seed Admin User safely if ADMIN_EMAIL & ADMIN_PASSWORD are provided
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existingAdmin) {
      const passwordHash = await passwordService.hash(adminPassword);
      await prisma.user.create({
        data: {
          email: adminEmail,
          name: 'System Admin',
          passwordHash,
          role: 'ADMIN',
          active: true,
        },
      });
      console.log(`[SEED] Admin user seeded successfully for email: ${adminEmail}`);
    } else {
      console.log(`[SEED] Admin user already exists for email: ${adminEmail}`);
    }
  } else {
    console.log('[SEED WARNING] ADMIN_EMAIL or ADMIN_PASSWORD not set in environment. Skipping admin user creation.');
  }

  // 2. Seed Default Sources
  const defaultSources = [
    {
      name: 'Chevening Scholarships',
      slug: 'chevening',
      url: 'https://www.chevening.org/scholarships/',
      adapterKey: 'chevening',
      status: 'ACTIVE' as const,
      crawlIntervalMin: 30,
    },
    {
      name: 'Commonwealth Scholarships',
      slug: 'commonwealth',
      url: 'https://cscuk.fcdo.gov.uk/scholarships/',
      adapterKey: 'commonwealth',
      status: 'ACTIVE' as const,
      crawlIntervalMin: 30,
    },
    {
      name: 'DAAD Scholarships',
      slug: 'daad',
      url: 'https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/',
      adapterKey: 'daad',
      status: 'ACTIVE' as const,
      crawlIntervalMin: 30,
    },
    {
      name: 'Erasmus+ Scholarships',
      slug: 'erasmus',
      url: 'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters',
      adapterKey: 'erasmus',
      status: 'ACTIVE' as const,
      crawlIntervalMin: 30,
    },
    {
      name: 'Opportunities For Africans',
      slug: 'opportunities-for-africans',
      url: 'https://opportunitiesforafricans.com/scholarships/',
      adapterKey: 'opportunities-for-africans',
      status: 'ACTIVE' as const,
      crawlIntervalMin: 30,
    },
  ];

  for (const src of defaultSources) {
    await prisma.scholarshipSource.upsert({
      where: { slug: src.slug },
      update: { url: src.url, status: src.status, crawlIntervalMin: src.crawlIntervalMin },
      create: src,
    });
  }
  console.log(`[SEED] ${defaultSources.length} default sources configured.`);

  // 3. Seed Default Prompt Template
  const promptName = 'scholarship-article-generation';
  const prompt = await prisma.prompt.upsert({
    where: { name: promptName },
    update: {},
    create: {
      name: promptName,
      description: 'Standard prompt for generating structured SEO articles from normalized scholarship data',
      active: true,
    },
  });

  const existingVersion = await prisma.promptVersion.findFirst({
    where: { promptId: prompt.id, version: 1 },
  });

  if (!existingVersion) {
    await prisma.promptVersion.create({
      data: {
        promptId: prompt.id,
        version: 1,
        active: true,
        variables: ['title', 'organization', 'description', 'officialUrl', 'country', 'degreeLevel', 'fundingType'],
        content: `You are an expert academic writer. Create a comprehensive, factual, and engaging article for the scholarship titled "{{title}}" offered by {{organization}}. Detail eligibility, benefits, requirements, and application procedures based on official data at {{officialUrl}}.`,
      },
    });
    console.log('[SEED] Default prompt version 1 created.');
  }

  // 4. Seed Default System Settings
  const settings = [
    { key: 'pipeline.schedulerIntervalMin', value: 30 },
    { key: 'quality.passThreshold', value: 0.7 },
    { key: 'publishing.autoPublishOnPass', value: true },
  ];

  for (const s of settings) {
    await prisma.systemSettings.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }

  console.log('[SEED] Database seeding complete!');
}

seed()
  .catch((e) => {
    console.error('[SEED ERROR]:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
