"use client";

import type { AminoAcid } from "../data/aminoAcids";
import type { FortuneEntry } from "../data/fortunes";

type FortuneCardProps = {
  acid: AminoAcid;
  fortune: FortuneEntry;
  onOpenLesson: () => void;
  onRetry: () => void;
  onHome: () => void;
};

/** A compact, deterministic result card. The constellation is only SVG so it
 * remains cheap to render while the camera and molecule viewer stay idle. */
export function FortuneCard({
  acid,
  fortune,
  onOpenLesson,
  onRetry,
  onHome,
}: FortuneCardProps) {
  const learningHint = fortune.learningHint.replace(
    /^学習用のイメージ[：:]\s*/,
    "",
  );

  return (
    <section
      className="fortune-card"
      style={{ "--acid-color": acid.theme } as React.CSSProperties}
      aria-label={`${acid.nameJa}の抽福結果`}
    >
      <div className="fortune-card-heading">
        <div>
          <span className="fortune-kicker">
            分子星座 · {fortune.theme}
          </span>
          <h2>{fortune.constellationName}</h2>
          <p className="fortune-title">{fortune.constellationTitle}</p>
        </div>
        <svg
          className="fortune-constellation"
          viewBox="0 0 100 100"
          role="img"
          aria-label="分子星座"
        >
          {fortune.links.map(([from, to], index) => {
            const start = fortune.stars[from];
            const end = fortune.stars[to];
            if (!start || !end) return null;
            return (
              <line
                key={`link-${from}-${to}-${index}`}
                x1={start.x * 100}
                y1={start.y * 100}
                x2={end.x * 100}
                y2={end.y * 100}
                className="fortune-star-link"
              />
            );
          })}
          {fortune.stars.map((star, index) => (
            <circle
              key={`star-${index}`}
              cx={star.x * 100}
              cy={star.y * 100}
              r="3.4"
              className="fortune-star"
            />
          ))}
        </svg>
      </div>

      <div className="fortune-copy">
        <p
          className="fortune-scroll-hint"
          role="note"
          aria-label="スクロールしてもっとみる"
        >
          スクロールしてもっとみる
        </p>
        <p className="fortune-meaning">
          <span>意味</span>
          {fortune.meaning}
        </p>
        <p className="fortune-learning">
          <span>学習用のイメージ</span>
          {learningHint}
          {fortune.moleculeHint}
        </p>
        <p className="fortune-message">{fortune.fortune}</p>
        <p className="fortune-cheer">{fortune.message}</p>
        <div className="fortune-facts">
          <p>
            <strong>おすすめ</strong>
            {fortune.goodFor}
          </p>
          <p>
            <strong>気をつけること</strong>
            {fortune.avoid}
          </p>
          <p>
            <strong>やってみよう</strong>
            {fortune.tryToday}
          </p>
          <p>
            <strong>大事なこと</strong>
            {fortune.takeCare}
          </p>
        </div>
      </div>

      <div className="fortune-actions">
        <button type="button" className="fortune-primary" onClick={onOpenLesson}>
          分子をくわしく見る
        </button>
        <button type="button" className="fortune-secondary" onClick={onRetry}>
          もう一度抽福
        </button>
        <button type="button" className="fortune-secondary" onClick={onHome}>
          ホームへ
        </button>
      </div>
    </section>
  );
}
