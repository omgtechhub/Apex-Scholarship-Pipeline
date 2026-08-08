import prisma from "../database/prisma-client";
export const organizationRepository={
 findById:(id:string)=>prisma.organization.findUnique({where:{id}}),
 findByName:(name:string)=>prisma.organization.findUnique({where:{name}}),
 findMany:(args:any={})=>prisma.organization.findMany(args),
 findOrCreate:(name:string)=>prisma.organization.upsert({where:{name},create:{name},update:{}}),
};
