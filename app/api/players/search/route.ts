import { NextResponse } from "next/server";
import { searchPlayers } from "@/lib/nba";

export const revalidate = 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({
      data: [],
      meta: { total_pages: 0, current_page: 1, next_page: null, per_page: 25, total_count: 0 },
    });
  }

  try {
    const result = await searchPlayers(query);
    console.log(`Search for "${query}": Found ${result.data.length} players${result.error ? `; error: ${result.error}` : ""}`);
    const status = result.error ? 503 : 200;
    return NextResponse.json(
      {
        data: result.data,
        meta: {
          total_pages: 1,
          current_page: 1,
          next_page: null,
          per_page: 25,
          total_count: result.data.length,
        },
        ...(result.error && { error: result.error }),
      },
      { status },
    );
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({
      data: [],
      meta: { total_pages: 0, current_page: 1, next_page: null, per_page: 25, total_count: 0 },
    });
  }
}
