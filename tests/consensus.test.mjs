import assert from "node:assert/strict";
import test from "node:test";
import { RecognitionConsensus } from "../app/lib/consensus.ts";

const good = (id, score = 0.8, margin = 0.2) => ({ id, score, margin });

test("requires three consecutive confident frames", () => {
  const consensus = new RecognitionConsensus(3, 0.5, 0.05);
  assert.equal(consensus.push(good("valine")), null);
  assert.equal(consensus.push(good("valine")), null);
  assert.equal(consensus.push(good("valine")).id, "valine");
});

test("rejects low score, weak margin, and conflicting sequences", () => {
  const consensus = new RecognitionConsensus(3, 0.5, 0.05);
  consensus.push(good("valine"));
  consensus.push(good("leucine"));
  assert.equal(consensus.push(good("valine")), null);
  assert.equal(consensus.push(good("valine", 0.4)), null);
  assert.equal(consensus.push(good("valine", 0.8, 0.01)), null);
});

test("keeps a stable result until a new label also reaches consensus", () => {
  const consensus = new RecognitionConsensus(3, 0.5, 0.05);
  consensus.push(good("valine"));
  consensus.push(good("valine"));
  consensus.push(good("valine"));
  assert.equal(consensus.push(good("leucine")).id, "valine");
  assert.equal(consensus.push(good("leucine")).id, "valine");
  assert.equal(consensus.push(good("leucine")).id, "leucine");
});
