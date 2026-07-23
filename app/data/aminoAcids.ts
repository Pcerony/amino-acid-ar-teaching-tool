export const AMINO_ACID_IDS = [
  "alanine",
  "valine",
  "leucine",
  "isoleucine",
  "methionine",
  "phenylalanine",
  "tryptophan",
  "proline",
] as const;

export type AminoAcidId = (typeof AMINO_ACID_IDS)[number];

export type AminoAcid = {
  id: AminoAcidId;
  nameJa: string;
  nameEn: string;
  code: string;
  theme: string;
  themeRgb: readonly [number, number, number];
  shape: string;
  role: string;
  memory: string;
  referencePath: string;
};

export const AMINO_ACIDS: readonly AminoAcid[] = [
  {
    id: "alanine",
    nameJa: "アラニン",
    nameEn: "Alanine",
    code: "Ala",
    theme: "#ff7568",
    themeRgb: [255, 117, 104],
    shape: "小さな「えだ」がひとつ。すっきりした形だよ。",
    role: "{筋肉|きんにく}を動かすエネルギーづくりを手つだうよ。",
    memory: "サンゴ色の、小さくてシンプルな形。",
    referencePath: "references/alanine.png",
  },
  {
    id: "valine",
    nameJa: "バリン",
    nameEn: "Valine",
    code: "Val",
    theme: "#ff633c",
    themeRgb: [255, 99, 60],
    shape: "先がYの字のように、ふたつに分かれているよ。",
    role: "{筋肉|きんにく}のエネルギーと、からだづくりを手つだうよ。",
    memory: "オレンジ色のYの字をさがそう。",
    referencePath: "references/valine.png",
  },
  {
    id: "leucine",
    nameJa: "ロイシン",
    nameEn: "Leucine",
    code: "Leu",
    theme: "#ff9e39",
    themeRgb: [255, 158, 57],
    shape: "少しのびてから、先がふたつに分かれる形だよ。",
    role: "{筋肉|きんにく}をつくる合図を出す、大切ななかまだよ。",
    memory: "オレンジ色の、のびたYの字。",
    referencePath: "references/leucine.png",
  },
  {
    id: "isoleucine",
    nameJa: "イソロイシン",
    nameEn: "Isoleucine",
    code: "Ile",
    theme: "#f6c62e",
    themeRgb: [246, 198, 46],
    shape: "根もとに近いところで、えだが分かれているよ。",
    role: "{筋肉|きんにく}で使うエネルギーをつくるのを手つだうよ。",
    memory: "きいろの、根もとから分かれる形。",
    referencePath: "references/isoleucine.png",
  },
  {
    id: "methionine",
    nameJa: "メチオニン",
    nameEn: "Methionine",
    code: "Met",
    theme: "#d98a45",
    themeRgb: [217, 138, 69],
    shape: "長いえだの中に、いおうという原子が入っているよ。",
    role: "からだの中で、新しいたんぱく{質|しつ}をつくり始めるよ。",
    memory: "どう色の長いえだ。中に特別な点があるよ。",
    referencePath: "references/methionine.png",
  },
  {
    id: "phenylalanine",
    nameJa: "フェニルアラニン",
    nameEn: "Phenylalanine",
    code: "Phe",
    theme: "#ff776f",
    themeRgb: [255, 119, 111],
    shape: "六角形のわっかを、ひとつ持っているよ。",
    role: "{脳|のう}ではたらく大切なものの材料になるよ。",
    memory: "あかい色と、ひとつの六角形。",
    referencePath: "references/phenylalanine.png",
  },
  {
    id: "tryptophan",
    nameJa: "トリプトファン",
    nameEn: "Tryptophan",
    code: "Trp",
    theme: "#c35da1",
    themeRgb: [195, 93, 161],
    shape: "五角形と六角形、ふたつのわっかがつながっているよ。",
    role: "よい{睡眠|すいみん}や気もちにかかわるものの材料になるよ。",
    memory: "むらさき色の、ふたつつながったわっか。",
    referencePath: "references/tryptophan.png",
  },
  {
    id: "proline",
    nameJa: "プロリン",
    nameEn: "Proline",
    code: "Pro",
    theme: "#e9788d",
    themeRgb: [233, 120, 141],
    shape: "えだがくるりともどって、五角形のわっかになるよ。",
    role: "{皮膚|ひふ}などをささえるコラーゲンの材料になるよ。",
    memory: "ピンク色の、くるりともどる五角形。",
    referencePath: "references/proline.png",
  },
] as const;

export const AMINO_ACID_BY_ID = Object.fromEntries(
  AMINO_ACIDS.map((acid) => [acid.id, acid]),
) as Record<AminoAcidId, AminoAcid>;

export function isAminoAcidId(value: unknown): value is AminoAcidId {
  return (
    typeof value === "string" &&
    (AMINO_ACID_IDS as readonly string[]).includes(value)
  );
}
