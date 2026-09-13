declare module 'bullmq' {
  export class Queue {
    constructor(name: string, opts?: unknown);
    getJobs(): Promise<unknown[]>;
    // Add any other methods you need for tests
  }
}
