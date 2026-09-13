declare module 'bullmq' {
  export interface Job {
    data?: Record<string, unknown>;
    remove?(): Promise<void>;
    // add other properties as needed for tests
  }

  export class Queue {
    constructor(name: string, opts?: unknown);
    add(name: string, data: unknown, opts?: unknown): Promise<Job>;
    getJobs(): Promise<Job[]>;
    // Add any other methods you need for tests
  }
}
