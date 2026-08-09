import prisma from "../database/prisma-client";
export const scholarshipRepository={
 findById:(id:string)=>prisma.scholarship.findUnique({where:{id},include:{source:true,organization:true,versions:true,articles:true}}),
 findByOfficialUrl:(officialUrl:string)=>prisma.scholarship.findFirst({where:{officialUrl}}),
 findBySlug:(slug:string)=>prisma.scholarship.findUnique({where:{slug}}),
 findByContentHash:(contentHash:string)=>prisma.scholarship.findFirst({where:{contentHash}}),
 findMany:(args:any={})=>prisma.scholarship.findMany(args),
 count:(where?:any)=>prisma.scholarship.count({where}),
 updateStatus:(id:string,status:any)=>prisma.scholarship.update({where:{id},data:{status}}),
 incrementViewCount:async(_id:string)=>undefined,
};
