import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("scanner exposes one shared fortune mode and camera lifecycle", async () => {
  const source = await readFile(
    new URL("../app/AminoAcidScanner.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /scannerMode/);
  assert.match(source, /startCamera\s*=\s*useCallback\(async \(mode: ScannerMode = "scan"\)/);
  assert.match(source, /抽福をはじめる/);
  assert.match(source, /カメラでスキャンする/);
  assert.match(source, /FORTUNES/);
  assert.match(source, /FortuneCard/);
  assert.match(source, /scannerMode\s*===\s*"fortune"/);
  assert.equal((source.match(/new LocalRecognizer\(\)/g) ?? []).length, 1);
  assert.ok((source.match(/beginScanLoop\(\)/g) ?? []).length >= 3);
});

test("fortune card keeps its child-friendly accessible result contract", async () => {
  const source = await readFile(
    new URL("../app/components/FortuneCard.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(source, /onOpenLesson/);
  assert.match(source, /onRetry/);
  assert.match(source, /onHome/);
  assert.match(source, /aria-label="分子星座"/);
  assert.match(source, /学習用のイメージ/);
  assert.match(source, /分子をくわしく見る/);
  assert.match(source, /もう一度抽福/);
  assert.match(source, /ホームへ/);
  assert.match(source, /fortune\.stars/);
  assert.match(source, /fortune\.links/);
  assert.match(source, /fortune-scroll-hint/);
  assert.match(source, /スクロールしてもっとみる/);
  assert.match(css, /\.fortune-primary[\s\S]*background:\s*color-mix\([^;]*white\s+12%/);
  assert.match(css, /\.fortune-primary[\s\S]*color:\s*#07150f/);
});

test("demo mode is explicit and does not depend on camera permission", async () => {
  const source = await readFile(
    new URL("../app/AminoAcidScanner.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /get\("mode"\)/);
  assert.match(source, /params\.get\("mode"\)\s*===\s*"fortune"/);
  assert.match(source, /setResultId\(id\)/);
  assert.doesNotMatch(source, /demo[^\n]*startCamera/);
});

test("scanner invalidates pending work when its camera lifecycle changes", async () => {
  const source = await readFile(
    new URL("../app/AminoAcidScanner.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /scanGenerationRef/);
  assert.match(source, /activeAnalysisGenerationRef/);
  assert.match(source, /restartScanAfterPendingRef/);
  assert.match(source, /queueOrBeginScanLoop/);
  assert.match(source, /loopGenerationRef/);
  assert.match(source, /cameraStartGenerationRef/);
  assert.match(source, /isCurrentCameraStart/);
  assert.match(source, /cloudRequestTokenRef/);
  assert.match(source, /const requestToken = \+\+cloudRequestTokenRef\.current/);
  assert.match(source, /cloudRequestTokenRef\.current\s*!==\s*requestToken/);
  assert.match(source, /recognizerReadyRef/);
  assert.match(source, /if \(!recognizerReadyRef\.current\) return/);
  assert.match(source, /recognizerReadyRef\.current\s*=\s*false/);
  assert.match(source, /recognizerReadyRef\.current\s*=\s*true/);
  assert.match(source, /分子の準備に失敗しました。もう一度ためしてみよう/);
  assert.match(source, /カメラを再生できませんでした。もう一度ためしてみよう/);
  assert.match(source, /uploadTokenRef/);
  assert.match(source, /uploadPendingRef/);
  assert.match(source, /isCurrentUpload/);
  assert.match(source, /phase\s*===\s*"indexing"\s*&&\s*!recognizerReadyRef\.current/);
  assert.ok((source.match(/scanGenerationRef\.current\s*\+=\s*1/g) ?? []).length >= 3);
  assert.match(source, /scanGenerationRef\.current\s*===\s*generation/);
  assert.match(source, /isCurrentGeneration\(generation\)/);
  assert.match(source, /if \(!isCurrentGeneration\(generation\)\) return/);
});
