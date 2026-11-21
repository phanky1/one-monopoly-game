export class TurnTimer {
  private durationSeconds: number;
  private remainingSeconds: number;
  private intervalHandle: NodeJS.Timeout | null = null;
  private onTick?: (seconds: number) => void;
  private onTimeout?: () => void;

  constructor(
    durationSeconds = 45,
    onTick?: (seconds: number) => void,
    onTimeout?: () => void
  ) {
    this.durationSeconds = durationSeconds;
    this.remainingSeconds = durationSeconds;
    this.onTick = onTick;
    this.onTimeout = onTimeout;
  }

  public start(): void {
    this.stop();
    this.remainingSeconds = this.durationSeconds;
    if (this.onTick) {
      this.onTick(this.remainingSeconds);
    }

    this.intervalHandle = setInterval(() => {
      this.remainingSeconds--;
      if (this.onTick) {
        this.onTick(this.remainingSeconds);
      }

      if (this.remainingSeconds <= 0) {
        this.stop();
        if (this.onTimeout) {
          this.onTimeout();
        }
      }
    }, 1000);
  }

  public stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  public reset(durationSeconds = this.durationSeconds): void {
    this.durationSeconds = durationSeconds;
    this.start();
  }

  public getRemainingSeconds(): number {
    return this.remainingSeconds;
  }
}
