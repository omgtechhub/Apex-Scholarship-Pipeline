import prisma from "../database/prisma-client";
export const scholarshipSourceRepository={
 findById:(id:string)=>prisma.scholarshipSource.findUnique({where:{id}}),
 findBySlug:(slug:string)=>prisma.scholarshipSource.findUnique({where:{slug}}),
 findActive:()=>prisma.scholarshipSource.findMany({where:{status:"ACTIVE"},orderBy:{nextCrawlAt:"asc"}}),
 findDueForCrawl:()=>prisma.scholarshipSource.findMany({where:{status:"ACTIVE",OR:[{nextCrawlAt:null},{nextCrawlAt:{lte:new Date()}}]}}),
 updateCrawlTimestamps:(id:string,lastCrawledAt:Date,nextCrawlAt:Date)=>prisma.scholarshipSource.update({where:{id},data:{lastCrawledAt,nextCrawlAt}}),
 incrementStats:async(id:string,success:boolean)=>prisma.scholarshipSource.update({where:{id},data:{consecutiveFails:success?0:{increment:1}}}),
};
