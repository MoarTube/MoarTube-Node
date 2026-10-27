export class ByteBudget {
  private retained = 0;
  constructor(private readonly limit: number) {}
  reserve(bytes: number): (() => void) | undefined {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || this.retained + bytes > this.limit) {
      return undefined;
    }
    this.retained += bytes;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.retained -= bytes;
      }
    };
  }
}
