import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ gemini: "NO_KEY", message: "GEMINI_API_KEY not set in .env.local" });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const result = await model.generateContent("Reply with exactly: OK");
    const text = result.response.text().trim();
    return NextResponse.json({ gemini: "WORKING", response: text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ gemini: "FAILED", error: message });
  }
}
