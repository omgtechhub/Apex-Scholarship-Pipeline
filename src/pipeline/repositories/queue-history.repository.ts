import prisma from "../database/prisma-client";
export const queueHistoryRepository={
 findMany:(args:any={})=>prisma.queueHistory.findMany(args),
 recordEnqueue:(data:any)=>prisma.queueHistory.create({data}),
 markStarted:(jobId:string,queue:string)=>prisma.queueHistory.updateMany({where:{jobId,queue},data:{status:"ACTIVE",startedAt:new Date()}}),
 markCompleted:(jobId:string,queue:string,result?:any)=>prisma.queueHistory.updateMany({where:{jobId,queue},data:{status:"COMPLETED",completedAt:new Date(),output:result}}),
 markFailed:(jobId:string,queue:string,error:string)=>prisma.queueHistory.updateMany({where:{jobId,queue},data:{status:"FAILED",error,completedAt:new Date()}}),
 deleteOlderThan:(date:Date)=>prisma.queueHistory.deleteMany({where:{createdAt:{lt:date}}}),
};
