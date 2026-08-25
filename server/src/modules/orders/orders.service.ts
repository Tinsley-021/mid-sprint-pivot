import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { InventoryError } from '../inventory/inventory.errors.js';
import { reserveStock, releaseReservation } from '../inventory/inventory.service.js';

export async function listOrders(organizationId: string) {
  const orders = await prisma.order.findMany({
    where: { organizationId },
    include: { branch: true, customer: true, items: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return orders.map((o) => ({
    id: o.orderNumber,
    customer: o.customer?.name ?? 'Walk-in customer',
    branch: o.branch.name,
    amount: Number(o.total),
    status: o.status,
    paymentStatus: o.paymentStatus,
    createdAt: o.createdAt.toISOString(),
    items: o.items.reduce((sum, item) => sum + item.quantity, 0),
  }));
}

export interface CreateOrderInput {
  organizationId: string;
  productId: string;
  branchId: string;
  customerName?: string;
  quantity?: number;
  performedBy?: string;
}

/**
 * Reserve → book → prompt-for-payment, in that order. The reservation is
 * taken first (its own locked transaction in the inventory core); if
 * anything after that fails we release it rather than leaving stock stuck
 * in limbo. commitSale (onHand actually decrementing) only happens later,
 * from a payment-success webhook — never here, and never from a
 * client-reported "payment succeeded".
 */
export async function createOrder(input: CreateOrderInput) {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));

  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) throw new InventoryError('PRODUCT_NOT_FOUND', 'Product not found', 404);

  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, organizationId: input.organizationId },
  });
  if (!branch) throw new InventoryError('BRANCH_NOT_FOUND', 'Branch not found', 404);

  const orderId = randomUUID();
  await reserveStock({
    organizationId: input.organizationId,
    productId: product.id,
    branchId: branch.id,
    quantity,
    referenceType: 'order',
    referenceId: orderId,
    performedBy: input.performedBy,
  });

  try {
    const total = Number(product.sellingPrice) * quantity;
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;

    let customerId: string | undefined;
    if (input.customerName?.trim()) {
      const customer = await prisma.customer.create({
        data: { organizationId: input.organizationId, name: input.customerName.trim() },
      });
      customerId = customer.id;
    }

    const order = await prisma.order.create({
      data: {
        id: orderId,
        organizationId: input.organizationId,
        branchId: branch.id,
        customerId,
        orderNumber,
        subtotal: total,
        total,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        createdBy: input.performedBy,
        items: {
          create: [{ productId: product.id, quantity, unitPrice: product.sellingPrice, subtotal: total }],
        },
      },
      include: { branch: true, customer: true },
    });

    const payment = await prisma.payment.create({
      data: {
        organizationId: input.organizationId,
        orderId: order.id,
        reference,
        amount: total,
        status: 'PENDING',
      },
    });

    return {
      order: {
        id: order.orderNumber,
        customer: order.customer?.name ?? 'Walk-in customer',
        branch: order.branch.name,
        amount: total,
        status: order.status,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt.toISOString(),
        items: quantity,
      },
      payment: {
        reference: payment.reference,
        amount: total,
        status: payment.status,
        message: `Payment prompt created for ${product.name}`,
      },
    };
  } catch (err) {
    await releaseReservation({
      organizationId: input.organizationId,
      productId: product.id,
      branchId: branch.id,
      quantity,
      referenceType: 'order-rollback',
      referenceId: orderId,
      performedBy: input.performedBy,
      reason: 'Order booking failed after reservation; releasing hold',
    }).catch(() => undefined);
    throw err;
  }
}
