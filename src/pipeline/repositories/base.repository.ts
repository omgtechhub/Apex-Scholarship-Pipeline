import prisma from "../database/prisma-client";

export abstract class BaseRepository<T = unknown> {
  protected abstract readonly delegate: any;
  async findById(id: string): Promise<T | null> { return this.delegate.findUnique({ where: { id } }); }
  async findByIdOrThrow(id: string): Promise<T> { const v=await this.findById(id); if(!v) throw new Error(`${this.constructor.name}: record ${id} not found`); return v; }
  async findMany(args: any = {}): Promise<T[]> { return this.delegate.findMany(args); }
  async create(data: any): Promise<T> { return this.delegate.create({ data }); }
  async update(id: string, data: any): Promise<T> { return this.delegate.update({ where:{id}, data }); }
  async delete(id: string): Promise<void> { await this.delegate.delete({ where:{id} }); }
  async exists(id: string): Promise<boolean> { return !!(await this.delegate.findUnique({where:{id}, select:{id:true}})); }
  async count(where?: any): Promise<number> { return this.delegate.count({where}); }
}
export { prisma };
