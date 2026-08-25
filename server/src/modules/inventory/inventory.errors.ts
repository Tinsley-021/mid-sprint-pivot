export class InventoryError extends Error {
  code: string;
  httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = 'InventoryError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class InventoryNotFoundError extends InventoryError {
  constructor(productId: string, branchId: string) {
    super(
      'INVENTORY_NOT_FOUND',
      `No inventory record for product ${productId} at branch ${branchId}`,
      404,
    );
  }
}

export class InsufficientStockError extends InventoryError {
  requested: number;
  available: number;

  constructor(requested: number, available: number) {
    super(
      'INSUFFICIENT_STOCK',
      `Only ${available} unit(s) available, ${requested} requested`,
      409,
    );
    this.requested = requested;
    this.available = available;
  }
}

export class InvalidQuantityError extends InventoryError {
  constructor(message = 'Quantity must be a positive integer') {
    super('INVALID_QUANTITY', message, 400);
  }
}
