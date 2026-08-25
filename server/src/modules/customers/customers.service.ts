import { prisma } from '../../lib/prisma.js';

export async function listCustomers(organizationId: string) {
  const customers = await prisma.customer.findMany({
    where: { organizationId },
    include: { orders: { select: { total: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return customers.map((c) => {
    const totalSpent = c.orders.reduce((sum, o) => sum + Number(o.total), 0);
    const lastOrderAt = c.orders.reduce<Date | null>(
      (latest, o) => (!latest || o.createdAt > latest ? o.createdAt : latest),
      null,
    );
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      orderCount: c.orders.length,
      totalSpent,
      lastOrderAt: lastOrderAt ? lastOrderAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    };
  });
}
