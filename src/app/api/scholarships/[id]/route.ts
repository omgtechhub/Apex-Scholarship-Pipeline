import { NextRequest } from 'next/server';
import prisma from '@/pipeline/database/prisma-client';
import { authenticate, handleApiError, apiResponse } from '@/pipeline/middleware/auth.middleware';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{await authenticate(req);const {id}=await params;const x=await prisma.scholarship.findUnique({where:{id},include:{organization:true,source:true,versions:true,articles:true}});if(!x)throw new Error('Scholarship not found');return apiResponse(x)}catch(e){return handleApiError(e)}}
