"use client";

import type { AminoAcid } from "../data/aminoAcids";
import type { FortuneEntry } from "../data/fortunes";
import { MOLECULES } from "../data/molecules";
import { MoleculeViewer } from "./MoleculeViewer";
import { Sparkles, RefreshCw, Home, BookOpen } from "lucide-react";

type FortuneCardProps = {
  acid: AminoAcid;
  fortune: FortuneEntry;
  onOpenLesson: () => void;
  onRetry: () => void;
  onHome: () => void;
};

/** A spacious, beautifully laid out, scrollable fortune result page. */
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
  const molecule = MOLECULES[acid.id];

  return (
    <section
      className="fortune-page-overlay"
      style={{ "--acid-color": acid.theme } as React.CSSProperties}
      aria-label={`${acid.nameJa}の花てまりおみくじ結果`}
    >
      <div className="fortune-page-container">
        {/* Header */}
        <header className="fortune-page-header">
          <div className="fortune-header-main">
            <span className="fortune-kicker">
              <Sparkles aria-hidden="true" /> 花てまりおみくじ · {fortune.theme}
            </span>
            <h1 className="fortune-constellation-title">
              {fortune.constellationName}
            </h1>
            <p className="fortune-constellation-sub">
              {fortune.constellationTitle}
            </p>
          </div>
          <div className="fortune-star-badge">
            <svg
              className="fortune-constellation-svg"
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
                  r="3.5"
                  className="fortune-star"
                />
              ))}
            </svg>
          </div>
        </header>

        {/* Main Fortune Quote */}
        <div className="fortune-hero-card">
          <p className="fortune-hero-quote">“ {fortune.fortune} ”</p>
          <p className="fortune-hero-cheer">{fortune.message}</p>
        </div>

        {/* Media Section: 2D Reference Card + 3D Molecule Model */}
        <div className="fortune-media-section">
          <h3 className="section-title">であった分子の形</h3>
          <div className="fortune-media-grid">
            <div className="fortune-media-card">
              <span className="media-card-tag">教具カード</span>
              <img
                src={acid.referencePath}
                alt={acid.nameJa}
                className="fortune-acid-img"
              />
              <span className="fortune-acid-name">
                {acid.nameJa} <small>({acid.code})</small>
              </span>
            </div>
            {molecule && (
              <div className="fortune-media-card">
                <span className="media-card-tag">3D 立体モデル</span>
                <div className="fortune-molecule-3d">
                  <MoleculeViewer
                    molecule={molecule}
                    theme={acid.theme}
                    active={true}
                  />
                </div>
                <span className="fortune-acid-name">3D 交互モデル</span>
              </div>
            )}
          </div>
        </div>

        {/* Meaning & Learning Info Stack */}
        <div className="fortune-info-stack">
          <div className="info-card">
            <h4>意味・メッセージ</h4>
            <p>{fortune.meaning}</p>
          </div>
          <div className="info-card">
            <h4>学習イメージ</h4>
            <p>
              {learningHint} {fortune.moleculeHint}
            </p>
          </div>
        </div>

        {/* Advice Grid */}
        <div className="fortune-advice-section">
          <h3 className="section-title">きょうのアドバイス</h3>
          <div className="fortune-facts-grid">
            <div className="fact-card">
              <strong>おすすめ</strong>
              <p>{fortune.goodFor}</p>
            </div>
            <div className="fact-card">
              <strong>気をつけること</strong>
              <p>{fortune.avoid}</p>
            </div>
            <div className="fact-card">
              <strong>やってみよう</strong>
              <p>{fortune.tryToday}</p>
            </div>
            <div className="fact-card">
              <strong>大事なこと</strong>
              <p>{fortune.takeCare}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="fortune-actions-bar">
          <button
            type="button"
            className="fortune-btn-primary"
            onClick={onOpenLesson}
          >
            <BookOpen aria-hidden="true" />
            分子をくわしく見る
          </button>
          <div className="fortune-btn-group">
            <button
              type="button"
              className="fortune-btn-secondary"
              onClick={onRetry}
            >
              <RefreshCw aria-hidden="true" />
              もう一度おみくじ
            </button>
            <button
              type="button"
              className="fortune-btn-secondary"
              onClick={onHome}
            >
              <Home aria-hidden="true" />
              ホームへ
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
