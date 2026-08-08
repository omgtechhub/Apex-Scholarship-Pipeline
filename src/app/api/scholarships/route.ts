import { NextRequest } from 'next/server';
import prisma from '@/pipeline/database/prisma-client';
import { authenticate, handleApiError, apiResponse } from '@/pipeline/middleware/auth.middleware';
export async function GET(req:NextRequest){try{await authenticate(req);const u=new URL(req.url);const page=Math.max(1,Number(u.searchParams.get('page')??1));const limit=Math.min(100,Math.max(1,Number(u.searchParams.get('limit')??20)));const [data,total]=await Promise.all([prisma.scholarship.findMany({skip:(page-1)*limit,take:limit,orderBy:{updatedAt:'desc'},include:{organization:true,source:true}}),prisma.scholarship.count()]);return apiResponse({data,total,page,limit,totalPages:Math.ceil(total/limit)})}catch(e){return handleApiError(e)}}
