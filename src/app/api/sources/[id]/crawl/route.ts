import { NextRequest } from 'next/server';
import { requireEditorOrAbove, handleApiError, apiResponse } from '@/pipeline/middleware/auth.middleware';
import { scheduler } from '@/pipeline/scheduler/scheduler';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{await requireEditorOrAbove(req);const {id}=await params;const jobId=await scheduler.triggerSource(id);return apiResponse({jobId},202)}catch(e){return handleApiError(e)}}
