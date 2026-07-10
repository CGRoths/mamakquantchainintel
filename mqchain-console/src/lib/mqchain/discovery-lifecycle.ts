export class DiscoveryJobNotCompletableError extends Error {
  constructor(status: string) {
    super(`Discovery job cannot be completed from status ${status}. Only draft or running jobs accept results.`);
    this.name = "DiscoveryJobNotCompletableError";
  }
}

export function assertDiscoveryJobCompletable(status: string) {
  if (status !== "draft" && status !== "running") {
    throw new DiscoveryJobNotCompletableError(status);
  }
}
