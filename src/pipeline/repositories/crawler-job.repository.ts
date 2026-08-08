import prisma from "../database/prisma-client";
export const crawlerJobRepository={
 findById:(id:string)=>prisma.crawlerJob.findUnique({where:{id},include:{logs:true,source:true}}),
 findMany:(args:any={})=>prisma.crawlerJob.findMany(args),
 create:(data:any)=>prisma.crawlerJob.create({data}),
 markRunning:(id:string)=>prisma.crawlerJob.update({where:{id},data:{status:"RUNNING",startedAt:new Date()}}),
 markCompleted:(id:string, data:any={})=>prisma.crawlerJob.update({where:{id},data:{status:"COMPLETED",completedAt:new Date(),...data}}),
 markFailed:(id:string,error:string)=>prisma.crawlerJob.update({where:{id},data:{status:"FAILED",completedAt:new Date(),errors:[error]}}),
};
