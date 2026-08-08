import { NextRequest } from 'next/server';
import { requireEditorOrAbove, handleApiError, apiResponse } from '@/pipeline/middleware/auth.middleware';
import { QueueManager } from '@/pipeline/queue/queue-manager';
import { QUEUES, JOB_NAMES } from '@/pipeline/queue/queue-names';
import prisma from '@/pipeline/database/prisma-client';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{await requireEditorOrAbove(req);const {id}=await params;const x=await prisma.scholarship.findUnique({where:{id}});if(!x)throw new Error('Scholarship not found');const job=await QueueManager.add(QUEUES.AI,JOB_NAMES.GENERATE_ARTICLE,{scholarshipId:id});return apiResponse({jobId:job.id,scholarshipId:id},202)}catch(e){return handleApiError(e)}}
