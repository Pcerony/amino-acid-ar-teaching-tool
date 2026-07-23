import type { Metadata } from "next";
import { AminoAcidScanner } from "./AminoAcidScanner";

export const metadata: Metadata = {
  title: "アミノずかんカメラ",
  description: "カメラでアミノ酸の形を見つける、小学生向け学習ツール。",
};

export default function Home() {
  return <AminoAcidScanner />;
}
