import prisma from "../database/prisma-client";
export const userRepository={
 findById:(id:string)=>prisma.user.findUnique({where:{id}}),
 findByEmail:(email:string)=>prisma.user.findUnique({where:{email}}),
 findMany:(args:any={})=>prisma.user.findMany(args),
 update:(id:string,data:any)=>prisma.user.update({where:{id},data}),
};
