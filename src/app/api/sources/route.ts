import { NextRequest } from 'next/server';
import prisma from '@/pipeline/database/prisma-client';
import { authenticate, requireEditorOrAbove, handleApiError, apiResponse } from '@/pipeline/middleware/auth.middleware';
import { z } from 'zod';

const schema=z.object({name:z.string().min(1),slug:z.string().regex(/^[a-z0-9-]+$/),url:z.string().url(),adapterKey:z.string().min(1),crawlIntervalMin:z.number().int().min(5).max(10080).optional(),config:z.record(z.string(),z.unknown()).optional()});

export async function GET(req:NextRequest){try{await authenticate(req);return apiResponse(await prisma.scholarshipSource.findMany({orderBy:{createdAt:'desc'}}));}catch(e){return handleApiError(e)}}
export async function POST(req:NextRequest){try{await requireEditorOrAbove(req);const body=schema.parse(await req.json());const source=await prisma.scholarshipSource.create({data:{...body,config:body.config as object|undefined}});return apiResponse(source,201)}catch(e){return handleApiError(e)}}
