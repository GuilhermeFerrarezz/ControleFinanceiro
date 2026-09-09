import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const userId = request.headers.get('user-id');
  
    console.log("ID recuperado na API:", userId);

    return NextResponse.json({ userId: userId })


}