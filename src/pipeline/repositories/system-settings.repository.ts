import prisma from "../database/prisma-client";
export const systemSettingsRepository={
 findByKey:(key:string)=>prisma.systemSettings.findUnique({where:{key}}),
 getValue:async(key:string,defaultValue?:unknown)=>{const s=await prisma.systemSettings.findUnique({where:{key}});return s?.value??defaultValue;},
 setValue:(key:string,value:unknown)=>prisma.systemSettings.upsert({where:{key},create:{key,value:value as any},update:{value:value as any}}),
 getAllSettings:()=>prisma.systemSettings.findMany({orderBy:{key:"asc"}}),
};
