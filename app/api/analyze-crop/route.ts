import { analyze, status } from "@/lib/analysis-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const env = () => ({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  ANALYSIS_ACCESS_TOKEN: process.env.ANALYSIS_ACCESS_TOKEN,
});
export async function GET() {
  return status(env());
}
export async function POST(request: Request) {
  return analyze(request, env());
}
