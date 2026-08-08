import prisma from "../database/prisma-client";
export const executionLogRepository={
 findMany:(args:any={})=>prisma.executionLog.findMany(args),
 record:(data:any)=>prisma.executionLog.create({data}),
 deleteOlderThan:(date:Date)=>prisma.executionLog.deleteMany({where:{createdAt:{lt:date}}}),
};
