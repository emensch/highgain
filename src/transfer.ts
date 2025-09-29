const transferSymbol = Symbol("transfer");

export function transfer<T>(
  value: T,
  transfer?: Transferable | Transferable[]
): T {
  return {
    type: transferSymbol,
    value,
    transfer: transfer
      ? Array.isArray(transfer)
        ? transfer
        : [transfer]
      : [value],
  } as Transfer as T; // This typecast is /not/ correct, however, it allows "transfer" to be used as an argument or return value without any additional typing.
}

interface Transfer {
  type: symbol;
  value: any;
  transfer: Transferable[];
}

export function isTransfer(value: unknown): value is Transfer {
  return !!(
    value &&
    typeof value === "object" &&
    Reflect.get(value, "type") === transferSymbol
  );
}
