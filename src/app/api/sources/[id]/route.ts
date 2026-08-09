import { NextRequest } from 'next/server';
import prisma from '@/pipeline/database/prisma-client';
import { authenticate, requireEditorOrAbove, handleApiError, apiResponse } from '@/pipeline/middleware/auth.middleware';
import { z } from 'zod';
const schema=z.object({name:z.string().min(1).optional(),status:z.enum(['ACTIVE','INACTIVE','ERROR','PAUSED']).optional(),crawlIntervalMin:z.number().int().min(5).max(10080).optional(),config:z.record(z.string(),z.unknown()).optional()});
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{await authenticate(req);const {id}=await params;const x=await prisma.scholarshipSource.findUnique({where:{id}});if(!x)throw new Error('Source not found');return apiResponse(x)}catch(e){return handleApiError(e)}}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{await requireEditorOrAbove(req);const {id}=await params;const body=schema.parse(await req.json());const x=await prisma.scholarshipSource.update({where:{id},data:{...body,config:body.config as object|undefined}});return apiResponse(x)}catch(e){return handleApiError(e)}}
