export type RecognitionCandidate<T extends string = string> = {
  id: T;
  score: number;
  margin: number;
};

export class RecognitionConsensus<T extends string = string> {
  private recent: RecognitionCandidate<T>[] = [];
  private stable: RecognitionCandidate<T> | null = null;
  private readonly requiredFrames: number;
  private readonly minimumScore: number;
  private readonly minimumMargin: number;

  constructor(
    requiredFrames = 3,
    minimumScore = 0.46,
    minimumMargin = 0.055,
  ) {
    this.requiredFrames = requiredFrames;
    this.minimumScore = minimumScore;
    this.minimumMargin = minimumMargin;
  }

  push(candidate: RecognitionCandidate<T> | null) {
    if (
      !candidate ||
      candidate.score < this.minimumScore ||
      candidate.margin < this.minimumMargin
    ) {
      this.recent = [];
      return this.stable;
    }

    this.recent.push(candidate);
    this.recent = this.recent.slice(-Math.max(5, this.requiredFrames));
    const tail = this.recent.slice(-this.requiredFrames);
    if (
      tail.length === this.requiredFrames &&
      tail.every((item) => item.id === candidate.id)
    ) {
      this.stable = candidate;
    }
    return this.stable;
  }

  reset(clearStable = false) {
    this.recent = [];
    if (clearStable) this.stable = null;
  }

  get result() {
    return this.stable;
  }
}
