import { NextResponse } from "next/server";
import { fetchPlayerSeasonAverages } from "@/lib/nba";

export const revalidate = 3600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const playerId = Number(id);

  if (!Number.isFinite(playerId)) {
    return NextResponse.json(
      { error: "Invalid player ID" },
      { status: 400 },
    );
  }

  const stats = await fetchPlayerSeasonAverages(playerId);

  if (!stats) {
    return NextResponse.json(
      { error: "Player stats not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: stats });
}
