import prisma from "../database/prisma-client";
export const scholarshipVersionRepository={
 findByScholarshipId:(scholarshipId:string)=>prisma.scholarshipVersion.findMany({where:{scholarshipId},orderBy:{version:"desc"}}),
 findLatestVersion:async(scholarshipId:string)=>prisma.scholarshipVersion.findFirst({where:{scholarshipId},orderBy:{version:"desc"}}),
 getNextVersionNumber:async(scholarshipId:string)=>{const v=await prisma.scholarshipVersion.findFirst({where:{scholarshipId},orderBy:{version:"desc"}});return (v?.version??0)+1;},
 createVersion:(data:any)=>prisma.scholarshipVersion.create({data}),
 countVersions:(scholarshipId:string)=>prisma.scholarshipVersion.count({where:{scholarshipId}}),
};
