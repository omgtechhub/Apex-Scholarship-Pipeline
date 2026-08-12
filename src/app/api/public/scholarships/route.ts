import { NextRequest } from 'next/server';
import prisma from '@/pipeline/database/prisma-client';
import { apiResponse, handleApiError } from '@/pipeline/middleware/auth.middleware';
import { ScholarshipStatus, ArticleStatus } from '../../../../../generated/prisma';



export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
    const search = url.searchParams.get('search')?.trim();
    const country = url.searchParams.get('country')?.trim();
    const degreeLevel = url.searchParams.get('degreeLevel')?.trim();
    const fundingType = url.searchParams.get('fundingType')?.trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      status: ScholarshipStatus.ACTIVE,
      articles: {
        some: {
          status: ArticleStatus.PUBLISHED,
        },
      },
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { organization: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (country) {
      where.country = { equals: country, mode: 'insensitive' };
    }

    if (degreeLevel) {
      where.degreeLevel = degreeLevel;
    }

    if (fundingType) {
      where.fundingType = fundingType;
    }

    const [scholarships, total] = await Promise.all([
      prisma.scholarship.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { deadline: 'asc' },
        include: {
          organization: {
            select: { name: true, website: true, country: true, description: true },
          },
          articles: {
            where: { status: ArticleStatus.PUBLISHED },
            select: {
              id: true,
              title: true,
              slug: true,
              content: true,
              wordCount: true,
              readingTime: true,
              publishedAt: true,
              seo: {
                select: {
                  seoTitle: true,
                  metaDescription: true,
                  keywords: true,
                  canonicalUrl: true,
                  ogTitle: true,
                  ogDescription: true,
                  jsonLd: true,
                  faqSchema: true,
                  breadcrumbSchema: true,
                },
              },
            },
            take: 1,
          },
        },
      }),
      prisma.scholarship.count({ where }),
    ]);

    // Sanitize and shape response for Apex website
    const data = scholarships.map((s) => ({
      id: s.id,
      title: s.title,
      slug: s.articles[0]?.slug ?? s.id,
      description: s.description,
      organization: s.organization,
      country: s.country,
      eligibleCountries: s.eligibleCountries,
      degreeLevel: s.degreeLevel,
      fieldsOfStudy: s.fieldsOfStudy,
      fundingType: s.fundingType,
      fundingAmount: s.fundingAmount,
      currency: s.currency,
      benefits: s.benefits,
      deadline: s.deadline,
      officialUrl: s.officialUrl,
      applicationUrl: s.applicationUrl,
      article: s.articles[0] ?? null,
      updatedAt: s.updatedAt,
    }));

    return apiResponse({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
