import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    const expectedPassword = process.env.LAB1_PASSWORD;

    if (!expectedPassword) {
      console.error("LAB1_PASSWORD environment variable is missing!");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    if (username === "lab1" && password === expectedPassword) {
      const response = NextResponse.json({ success: true });
      
      // Set secure HTTP-only cookie
      response.cookies.set({
        name: "scope-auth-token",
        value: "authenticated",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        // Expire in 30 days
        maxAge: 60 * 60 * 24 * 30,
      });

      return response;
    }

    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
