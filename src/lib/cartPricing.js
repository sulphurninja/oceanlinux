import IPStock from '@/models/ipStockModel';
import SlotIPPackage from '@/models/slotIpPackageModel';

/**
 * Server-side pricing + availability validator for cart line items.
 *
 * Handed a single cart subdoc (or cart-shaped object), returns:
 *   {
 *     valid: boolean,
 *     reason?: string,   // populated when valid === false
 *     productName: string,
 *     unitOriginalPrice: number,
 *     unitDiscount: number,
 *     unitPrice: number,
 *     quantity: number,
 *     lineSubtotal: number,    // unitOriginalPrice * quantity
 *     lineDiscount: number,    // unitDiscount * quantity
 *     lineTotal: number,       // unitPrice * quantity
 *     stock?: object,          // populated IPStock or SlotIPPackage doc (lean-ish)
 *     promoApplied?: string,
 *   }
 *
 * This helper is the *only* place that computes cart prices — both
 * GET /api/cart and the checkout-initiate path call it so client and
 * server can never disagree on numbers.
 */
export async function priceCartLine(item) {
  const quantity = Math.max(1, Math.min(10, Number(item?.quantity) || 1));

  if (!item || !item.kind) {
    return { valid: false, reason: 'Invalid cart item' };
  }

  if (item.kind === 'ipstock') {
    if (!item.ipStockId) {
      return { valid: false, reason: 'Missing ipStockId' };
    }
    const stock = await IPStock.findById(item.ipStockId);
    if (!stock) {
      return { valid: false, reason: 'Product no longer exists' };
    }
    if (!stock.available) {
      return { valid: false, reason: 'Product is currently unavailable', stock };
    }
    const memory = item.memory;
    if (!memory) {
      return { valid: false, reason: 'Memory option is required', stock };
    }
    const memoryOption = stock.memoryOptions?.get?.(memory) || stock.memoryOptions?.[memory];
    if (!memoryOption || !memoryOption.price) {
      return { valid: false, reason: `Memory option "${memory}" is not available`, stock };
    }

    const unitOriginalPrice = Number(memoryOption.price);
    let unitDiscount = 0;
    let promoApplied;
    if (item.promoCode) {
      const validPromo = (stock.promoCodes || []).find(
        p => p.code?.toUpperCase() === item.promoCode.toUpperCase() && p.isActive
      );
      if (validPromo) {
        unitDiscount = validPromo.discountType === 'percentage'
          ? Math.round((unitOriginalPrice * validPromo.discount) / 100)
          : validPromo.discount;
        promoApplied = validPromo.code;
      }
    }
    const unitPrice = Math.max(1, unitOriginalPrice - unitDiscount);
    return {
      valid: true,
      productName: stock.name,
      unitOriginalPrice,
      unitDiscount,
      unitPrice,
      quantity,
      lineSubtotal: unitOriginalPrice * quantity,
      lineDiscount: unitDiscount * quantity,
      lineTotal: unitPrice * quantity,
      stock,
      promoApplied,
    };
  }

  if (item.kind === 'slotip') {
    if (!item.slotIpPackageId) {
      return { valid: false, reason: 'Missing slotIpPackageId' };
    }
    const pkg = await SlotIPPackage.findById(item.slotIpPackageId);
    if (!pkg) {
      return { valid: false, reason: 'Slot IP package no longer exists' };
    }
    if (!pkg.available) {
      return { valid: false, reason: 'Slot IP package is unavailable', stock: pkg };
    }
    const availableIps = (pkg.ips || []).filter(ip => !ip.allocated).length;
    if (availableIps < quantity) {
      return {
        valid: false,
        reason: `Only ${availableIps} slot IP${availableIps === 1 ? '' : 's'} available, you requested ${quantity}`,
        stock: pkg,
      };
    }

    const unitOriginalPrice = Number(pkg.price);
    let unitDiscount = 0;
    let promoApplied;
    if (item.promoCode) {
      const validPromo = (pkg.promoCodes || []).find(
        p => p.code?.toUpperCase() === item.promoCode.toUpperCase() && p.isActive
      );
      if (validPromo) {
        unitDiscount = validPromo.discountType === 'percentage'
          ? Math.round((unitOriginalPrice * validPromo.discount) / 100)
          : validPromo.discount;
        promoApplied = validPromo.code;
      }
    }
    const unitPrice = Math.max(1, unitOriginalPrice - unitDiscount);
    return {
      valid: true,
      productName: pkg.name,
      unitOriginalPrice,
      unitDiscount,
      unitPrice,
      quantity,
      lineSubtotal: unitOriginalPrice * quantity,
      lineDiscount: unitDiscount * quantity,
      lineTotal: unitPrice * quantity,
      stock: pkg,
      promoApplied,
    };
  }

  return { valid: false, reason: `Unknown cart item kind: ${item.kind}` };
}

export async function priceCart(items = []) {
  const lines = await Promise.all(items.map(async (item) => {
    const priced = await priceCartLine(item);
    return { item, priced };
  }));

  let subtotal = 0;
  let discount = 0;
  let total = 0;
  let invalidCount = 0;

  for (const { priced } of lines) {
    if (!priced.valid) {
      invalidCount++;
      continue;
    }
    subtotal += priced.lineSubtotal;
    discount += priced.lineDiscount;
    total += priced.lineTotal;
  }

  return {
    lines,
    subtotal,
    discount,
    total,
    hasInvalidItems: invalidCount > 0,
  };
}
