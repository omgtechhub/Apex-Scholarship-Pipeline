import prisma from "../database/prisma-client";
export const crawlerLogRepository={
 findMany:(args:any={})=>prisma.crawlerLog.findMany(args),
 appendLog:(data:any)=>prisma.crawlerLog.create({data}),
 appendBulk:(data:any[])=>prisma.crawlerLog.createMany({data}),
 deleteByJob:(jobId:string)=>prisma.crawlerLog.deleteMany({where:{jobId}}),
 deleteOlderThan:(date:Date)=>prisma.crawlerLog.deleteMany({where:{createdAt:{lt:date}}}),
};
