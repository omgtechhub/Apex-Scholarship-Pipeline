import { NextRequest } from 'next/server';
import prisma from '@/pipeline/database/prisma-client';
import { apiResponse, handleApiError } from '@/pipeline/middleware/auth.middleware';
import { ArticleStatus } from '../../../../../../generated/prisma';


export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Find by ID or by article slug / scholarship slug
    const scholarship = await prisma.scholarship.findFirst({
      where: {
        OR: [
          { id },
          { articles: { some: { OR: [{ slug: id }, { id }] } } },
        ],
      },
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
            seo: true,
          },
          take: 1,
        },
      },
    });

    if (!scholarship || scholarship.articles.length === 0) {
      throw new Error('Published scholarship not found');
    }

    const s = scholarship;
    const data = {
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
      eligibility: s.eligibility,
      requirements: s.requirements,
      documents: s.documents,
      deadline: s.deadline,
      officialUrl: s.officialUrl,
      applicationUrl: s.applicationUrl,
      applicationInstructions: s.applicationInstructions,
      article: s.articles[0],
      updatedAt: s.updatedAt,
    };

    return apiResponse(data);
  } catch (e) {
    return handleApiError(e);
  }
}
