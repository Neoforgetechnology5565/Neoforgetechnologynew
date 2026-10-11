import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./auth";
import { DIVISIONS } from "./divisions";

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;
const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const COMPANY = `Neo Forge Technology builds custom software for engineering and business teams. Divisions:\n${DIVISIONS.map((d) => `- ${d.slug}: ${d.name} — ${d.tagline}`).join("\n")}`;

const RULES = `You write for the Neo Forge Technology blog. Audience: engineers, BIM/CAD managers and business owners who might hire a software team.
Hard rules: never invent statistics, percentages, client names, quotes, case studies, awards or product claims. Speak in general, accurate terms; say "typically" or "often" where unsure. Use plain, specific language, no hype, no filler. Markdown only (## and ### headings, paragraphs, - and 1. lists, **bold**); no raw HTML, no H1, no images, no links.
${COMPANY}`;

function client() {
  if (!aiConfigured()) throw new HttpError(503, "AI writing isn't set up yet. Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy.");
  return new Anthropic({ timeout: 55_000, maxRetries: 1 });
}

async function ask<T>(system: string, user: string, schema: Record<string, unknown>, maxTokens: number): Promise<T> {
  try {
    const res = await client().messages.create({
      model: MODEL(),
      max_tokens: maxTokens,
      system,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") throw new HttpError(422, "The AI declined this topic. Try a different one.");
    if (res.stop_reason === "max_tokens") throw new HttpError(502, "The article came back cut off. Try again, or pick a narrower topic.");
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new HttpError(502, "The AI returned no text. Try again.");
    return JSON.parse(block.text) as T;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(502, "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "The AI is busy or your Anthropic usage limit was reached. Try again shortly.");
    if (e instanceof Anthropic.APIConnectionError) throw new HttpError(504, "The AI took too long to answer. Try again.");
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `AI error (${e.status}). ${e.message.slice(0, 160)}`);
    throw new HttpError(502, "Could not read the AI response. Try again.");
  }
}

export interface TopicIdea { title: string; angle: string; keyword: string; division: string }

export async function suggestTopics(existingTitles: string[], focus: string): Promise<TopicIdea[]> {
  const out = await ask<{ topics: TopicIdea[] }>(
    RULES,
    `Suggest 8 blog article topics likely to attract search traffic from people who need this kind of software.${focus ? ` Focus area: ${focus}.` : " Spread them across the divisions."}
Titles should be specific and searchable (50–65 characters). "angle" is one sentence on what the article teaches. "keyword" is the main search phrase. "division" is the best-matching division slug.
Do not repeat or closely overlap these existing articles: ${existingTitles.slice(0, 60).join(" | ") || "(none yet)"}`,
    {
      type: "object", additionalProperties: false, required: ["topics"],
      properties: { topics: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "angle", "keyword", "division"], properties: { title: { type: "string" }, angle: { type: "string" }, keyword: { type: "string" }, division: { type: "string", enum: DIVISIONS.map((d) => d.slug) } } } } },
    },
    3000,
  );
  return (out.topics ?? []).slice(0, 8);
}

export interface AiArticle { title: string; excerpt: string; content: string; tags: string[]; division: string; seoTitle: string; seoDescription: string }

export async function writeArticle(topic: string, angle: string): Promise<AiArticle> {
  const a = await ask<AiArticle>(
    RULES,
    `Write a complete blog article.\nTopic: ${topic}${angle ? `\nAngle: ${angle}` : ""}\n
Length 800–1100 words. Structure: a short opening that states the problem, 4–6 sections with ## headings (some ### sub-headings, at least one list), a short honest "limits" or "when it doesn't fit" section, and a closing section that points to Neo Forge Technology's relevant service without hard selling.
Also give: title (50–65 chars), excerpt (max 180 chars, plain sentence), 3–6 tags, best-matching division slug, seoTitle (max 65 chars), seoDescription (max 160 chars). "content" must not repeat the title as a heading.`,
    {
      type: "object", additionalProperties: false, required: ["title", "excerpt", "content", "tags", "division", "seoTitle", "seoDescription"],
      properties: {
        title: { type: "string" }, excerpt: { type: "string" }, content: { type: "string" },
        tags: { type: "array", items: { type: "string" } }, division: { type: "string", enum: DIVISIONS.map((d) => d.slug) },
        seoTitle: { type: "string" }, seoDescription: { type: "string" },
      },
    },
    8000,
  );
  return {
    title: String(a.title || topic).slice(0, 160),
    excerpt: String(a.excerpt || "").slice(0, 300),
    content: String(a.content || "").slice(0, 80000),
    tags: (a.tags || []).map((t) => String(t).slice(0, 40)).slice(0, 8),
    division: DIVISIONS.some((d) => d.slug === a.division) ? a.division : "",
    seoTitle: String(a.seoTitle || "").slice(0, 70),
    seoDescription: String(a.seoDescription || "").slice(0, 170),
  };
}
