export interface LearningFilePort {
  pick(maximumBytes: number): Promise<string | null>;
  exportJSON(json: string): Promise<'shared' | 'dismissed' | 'downloaded'>;
}
