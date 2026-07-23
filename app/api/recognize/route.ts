import { NextResponse } from "next/server";
import { AMINO_ACID_IDS, isAminoAcidId } from "../../data/aminoAcids";

const MAX_IMAGE_CHARACTERS = 900_000;
const DATA_URL_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function extractOutputText(payload: OpenAIResponse) {
  if (typeof payload.output_text === "string") return payload.output_text;
  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text ?? ""
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "cloud_fallback_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const image =
    typeof body === "object" &&
    body !== null &&
    "image" in body &&
    typeof body.image === "string"
      ? body.image
      : "";
  if (
    !image ||
    image.length > MAX_IMAGE_CHARACTERS ||
    !DATA_URL_PATTERN.test(image)
  ) {
    return NextResponse.json(
      { error: "invalid_image" },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const model = process.env.OPENAI_VISION_MODEL || "gpt-5.6-luna";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "none" },
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "This is one photographed face of an amino-acid teaching object. " +
                "Classify it only by comparing its color, abstract petal background, " +
                "and ball-and-stick molecular structure. If the face is unclear or " +
                "not one of the allowed labels, return id null and low confidence. " +
                `Allowed labels: ${AMINO_ACID_IDS.join(", ")}.`,
            },
            { type: "input_image", image_url: image, detail: "low" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "amino_acid_face",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: {
                anyOf: [
                  { type: "string", enum: AMINO_ACID_IDS },
                  { type: "null" },
                ],
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["id", "confidence"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "recognition_failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const payload = (await response.json()) as OpenAIResponse;
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractOutputText(payload));
  } catch {
    parsed = null;
  }
  const id =
    typeof parsed === "object" &&
    parsed !== null &&
    "id" in parsed &&
    isAminoAcidId(parsed.id)
      ? parsed.id
      : null;
  const confidence =
    typeof parsed === "object" &&
    parsed !== null &&
    "confidence" in parsed &&
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;

  return NextResponse.json(
    { id, confidence },
    { headers: { "Cache-Control": "no-store" } },
  );
}
