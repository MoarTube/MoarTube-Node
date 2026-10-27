/** Bounded FIFO admission, shared across requests rather than per upload. */
export class WorkPool {
  private active = 0;
  private readonly waiting: Array<(release: () => void) => void> = [];
  constructor(
    private readonly concurrency: number,
    private readonly capacity = 100
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('Invalid concurrency');
    }
  }
  async acquire(): Promise<() => void> {
    const slot = this.tryAcquire();
    if (slot) {
      return slot;
    }
    if (this.waiting.length >= this.capacity) {
      throw new Error('Work queue is full');
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }
  tryAcquire(): (() => void) | undefined {
    if (this.active >= this.concurrency) {
      return undefined;
    }
    this.active++;
    return this.releaseSlot();
  }
  private releaseSlot(): () => void {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const next = this.waiting.shift();
      if (next) {
        next(this.releaseSlot());
      } else {
        this.active--;
      }
    };
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await work();
    } finally {
      release();
    }
  }
}

export const encodingPool = new WorkPool(2);
export const uploadPool = new WorkPool(4);
