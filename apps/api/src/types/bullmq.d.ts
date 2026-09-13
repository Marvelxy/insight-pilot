declare module 'bullmq' {
  export class Queue {
    constructor(name: string, opts?: any);
    getJobs(): Promise<any[]>;
    // Add any other methods you need for tests
  }
}
