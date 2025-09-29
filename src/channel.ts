import { isTransfer } from "./transfer";

type FunctionType = (...args: any[]) => any;

export type ChannelFunctions = Record<string, FunctionType>;

type Tx<T extends ChannelFunctions> = {
  [Name in keyof T]: (
    ...args: Parameters<T[Name]>
  ) => Promise<Awaited<ReturnType<T[Name]>>>;
};

interface Transceiver<T extends ChannelFunctions> {
  createTx: (worker?: Worker) => Tx<T>;
  rx: (receivers: T, worker?: Worker) => void;
}

interface ResponseHandler {
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
}

export function channel<T extends ChannelFunctions>(
  channelName: string = "default"
): Transceiver<T> {
  return {
    createTx(worker) {
      const responseHandlerMap = new Map<string, ResponseHandler>();

      const eventListenerObject = worker ?? self;

      eventListenerObject.addEventListener("message", (event) => {
        const { data } = event as MessageEvent;

        if (data.channelName !== channelName) {
          return;
        }

        const { id, result, error } = data;

        const handler = responseHandlerMap.get(id);

        if (handler) {
          if (error) {
            handler.reject(error);
          } else {
            handler.resolve(result);
          }
          responseHandlerMap.delete(id);
        }
      });

      const tx = new Proxy(
        {},
        {
          get(_, method) {
            return (...args: any[]) => {
              const id = uuid();

              const unwrappedArgs: any[] = [];
              const transfer: Transferable[] = [];

              args.forEach((arg) => {
                if (isTransfer(arg)) {
                  unwrappedArgs.push(arg.value);
                  transfer.push(...arg.transfer);
                } else {
                  unwrappedArgs.push(arg);
                }
              });

              eventListenerObject.postMessage(
                { method, args: unwrappedArgs, id, channelName },
                { transfer }
              );

              return new Promise((resolve, reject) => {
                responseHandlerMap.set(id, { resolve, reject });
              });
            };
          },
        }
      ) as Record<keyof T, (...args: any[]) => Promise<any>>;

      return tx;
    },
    rx(receivers, worker) {
      const eventListenerObject = worker ?? self;

      eventListenerObject.addEventListener("message", async (event) => {
        const { data } = event as MessageEvent;
        if (data.channelName !== channelName) {
          return;
        }

        const { method, args, id } = data;
        try {
          const result = await receivers[method](...args);

          if (isTransfer(result)) {
            eventListenerObject.postMessage(
              { result: result.value, id, channelName },
              { transfer: result.transfer }
            );
          } else {
            eventListenerObject.postMessage({ result, id, channelName });
          }
        } catch (error) {
          eventListenerObject.postMessage({ error, id, channelName });
        }
      });
    },
  };
}

function uuid(): string {
  return new Array(4)
    .fill(0)
    .map(() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16))
    .join("-");
}
