import { NextRequest } from 'next/server';
import prisma from '@/pipeline/database/prisma-client';
import { authenticate, handleApiError, apiResponse } from '@/pipeline/middleware/auth.middleware';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{await authenticate(req);const {id}=await params;const x=await prisma.article.findUnique({where:{id},include:{scholarship:true,versions:true,seo:true,qualityChecks:true,publications:true}});if(!x)throw new Error('Article not found');return apiResponse(x)}catch(e){return handleApiError(e)}}
