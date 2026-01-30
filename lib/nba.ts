/**
 * NBA Stats API utilities
 * Free API, no authentication required
 * Base URL: https://stats.nba.com/stats/
 */

export type Player = {
  id: number;
  first_name: string;
  last_name: string;
  display_name?: string;
};

export type PlayerStats = {
  player: Player;
  pts: number; // Points per game
  fga: number; // Field goal attempts per game
};

const NBA_STATS_BASE = "https://stats.nba.com/stats";

// Headers to mimic a browser request (NBA Stats API requires this)
const NBA_HEADERS: HeadersInit = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.nba.com/",
  "Origin": "https://www.nba.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/**
 * Fetch from NBA Stats API. When NBA_STATS_PROXY_URL is set (e.g. on Vercel),
 * requests go through that proxy so they aren't blocked by NBA's cloud IP block.
 * Proxy should accept GET ?url=<encoded-nba-url> and return the response body.
 */
async function nbaFetch(
  url: string,
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<Response> {
  let proxy = process.env.NBA_STATS_PROXY_URL?.trim();
  if (proxy) {
    // Ensure proxy URL has a scheme (fetch requires a full URL)
    if (!/^https?:\/\//i.test(proxy)) {
      proxy = `https://${proxy}`;
    }
    const proxyBase = proxy.replace(/\/$/, "");
    const proxyUrl = `${proxyBase}?url=${encodeURIComponent(url)}`;
    console.log(`[NBA] Using proxy: ${proxyBase} (request to stats.nba.com)`);
    return fetch(proxyUrl, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
  }
  console.log("[NBA] Direct request (no proxy)");
  return fetch(url, {
    ...init,
    headers: { ...NBA_HEADERS, ...init?.headers },
  });
}

/**
 * Search for players by name
 */
export async function searchPlayers(
  query: string,
): Promise<{ data: Player[]; error?: string }> {
  if (!query.trim()) {
    return { data: [] };
  }

  try {
    // NBA Stats API endpoint for all players
    const url = new URL(`${NBA_STATS_BASE}/commonallplayers`);
    url.searchParams.set("LeagueID", "00"); // NBA
    url.searchParams.set("Season", getCurrentSeason());
    url.searchParams.set("IsOnlyCurrentSeason", "0"); // Get all players, we'll filter active ones

    console.log(`Fetching players from NBA Stats API: ${url.toString()}`);
    
    const response = await nbaFetch(url.toString(), {
      next: { revalidate: 3600 },
    });

    console.log(`NBA Stats API response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`NBA Stats API error: ${response.status} ${response.statusText}`, errorText.substring(0, 500));
      // Surface proxy/NBA errors so client can show a helpful message
      const msg = response.status === 403
        ? "NBA API blocked this request (proxy or origin may be blocked). Try Render or another host for the proxy."
        : response.status === 502
          ? "Proxy could not reach NBA API. Check proxy logs."
          : `Search failed: ${response.status}`;
      return { data: [], error: msg };
    }

    const rawData = await response.json();
    console.log(`NBA Stats API raw response keys:`, Object.keys(rawData));
    console.log(`NBA Stats API raw response sample:`, JSON.stringify(rawData).substring(0, 1000));

    const data = rawData as {
      resultSets?: Array<{
        name?: string;
        headers: string[];
        rowSet: Array<Array<unknown>>;
      }>;
      resource?: string;
      parameters?: unknown;
    };

    console.log(`NBA Stats API response structure:`, {
      hasResultSets: !!data.resultSets,
      resultSetsLength: data.resultSets?.length || 0,
      firstResultSetName: data.resultSets?.[0]?.name,
      firstResultSetRows: data.resultSets?.[0]?.rowSet?.length || 0,
    });

    if (!data.resultSets || data.resultSets.length === 0) {
      console.error("No resultSets in NBA Stats API response. Full response:", JSON.stringify(data).substring(0, 500));
      return { data: [] };
    }

    const players = data.resultSets[0];
    
    if (!players || !players.rowSet || players.rowSet.length === 0) {
      console.error("No player rows in first resultSet");
      return { data: [] };
    }
    console.log(`Processing ${players.rowSet.length} total players from API`);
    const queryLower = query.toLowerCase().trim();
    console.log(`Searching for query: "${queryLower}"`);

    // Filter players by name
    // Headers: ["PERSON_ID","DISPLAY_LAST_COMMA_FIRST","DISPLAY_FIRST_LAST","ROSTERSTATUS","FROM_YEAR","TO_YEAR","PLAYERCODE","PLAYER_SLUG","TEAM_ID","TEAM_CITY","TEAM_NAME","TEAM_ABBREVIATION","TEAM_CODE","TEAM_SLUG","GAMES_PLAYED_FLAG","OTHERLEAGUE_EXPERIENCE_CH"]
    const filtered: Player[] = players.rowSet
      .map((row) => {
        const playerId = row[0] as number;
        const displayLastCommaFirst = row[1] as string; // "Last, First"
        const displayFirstLast = row[2] as string; // "First Last"
        const rosterStatus = row[3] as number; // 1 for active, 0 for inactive
        const gamesPlayedFlag = row[14] as string; // "Y" if player has games this season

        // Filter for active players (on roster or has played games this season)
        const isActive = rosterStatus === 1 || gamesPlayedFlag === "Y";
        
        if (!isActive) return null;

        // Use both name formats for matching
        const lastCommaFirst = (displayLastCommaFirst || "").toLowerCase();
        const firstLast = (displayFirstLast || "").toLowerCase();

        // Check if query matches either format
        const matches =
          firstLast.includes(queryLower) ||
          lastCommaFirst.includes(queryLower) ||
          firstLast.split(" ").some((part) => part.includes(queryLower)) ||
          lastCommaFirst.split(", ").some((part) => part.includes(queryLower));

        if (!matches) return null;

        // Parse name from "Last, First" format
        const nameParts = displayLastCommaFirst.split(",").map((s) => s.trim());
        const lastName = nameParts[0] || "";
        const firstName = nameParts[1] || "";

        return {
          id: playerId,
          first_name: firstName,
          last_name: lastName,
          display_name: displayFirstLast || displayLastCommaFirst,
        } as Player;
      })
      .filter((p): p is Player => p !== null)
      .slice(0, 25); // Limit to 25 results

    console.log(`Filtered to ${filtered.length} matching players for query "${query}"`);
    if (filtered.length > 0) {
      console.log(`Sample matches:`, filtered.slice(0, 3).map(p => `${p.first_name} ${p.last_name}`));
    }

    return { data: filtered };
  } catch (error) {
    console.error("NBA Stats search error:", error);
    return { data: [] };
  }
}

/**
 * Get current NBA season string (e.g., "2024-25")
 */
function getCurrentSeason(): string {
  const currentYear = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  // NBA season starts in October
  if (month >= 10) {
    return `${currentYear}-${String(currentYear + 1).slice(-2)}`;
  } else {
    return `${currentYear - 1}-${String(currentYear).slice(-2)}`;
  }
}

/**
 * Get previous NBA season string
 */
function getPreviousSeason(): string {
  const currentYear = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  if (month >= 10) {
    return `${currentYear - 1}-${String(currentYear).slice(-2)}`;
  } else {
    return `${currentYear - 2}-${String(currentYear - 1).slice(-2)}`;
  }
}

/**
 * Try fetching stats from previous season as fallback
 */
async function tryPreviousSeason(playerId: number): Promise<PlayerStats | null> {
  const prevSeason = getPreviousSeason();
  console.log(`Trying previous season ${prevSeason} for player ${playerId}`);
  
  try {
    const url = new URL(`${NBA_STATS_BASE}/playerdashboardbygeneralsplits`);
    url.searchParams.set("MeasureType", "Base");
    url.searchParams.set("PerMode", "PerGame");
    url.searchParams.set("PlusMinus", "N");
    url.searchParams.set("PaceAdjust", "N");
    url.searchParams.set("Rank", "N");
    url.searchParams.set("LeagueID", "00");
    url.searchParams.set("Season", prevSeason);
    url.searchParams.set("SeasonType", "Regular Season");
    url.searchParams.set("PlayerID", String(playerId));
    url.searchParams.set("Outcome", "");
    url.searchParams.set("Location", "");
    url.searchParams.set("Month", "0");
    url.searchParams.set("SeasonSegment", "");
    url.searchParams.set("DateFrom", "");
    url.searchParams.set("DateTo", "");
    url.searchParams.set("OpponentTeamID", "0");
    url.searchParams.set("VsConference", "");
    url.searchParams.set("VsDivision", "");
    url.searchParams.set("GameSegment", "");
    url.searchParams.set("Period", "0");
    url.searchParams.set("ShotClockRange", "");
    url.searchParams.set("LastNGames", "0");

    const response = await nbaFetch(url.toString(), {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      resultSets: Array<{
        name: string;
        headers: string[];
        rowSet: Array<Array<unknown>>;
      }>;
    };

    const seasonTotals = data.resultSets?.find(
      (rs) => rs.name === "OverallPlayerDashboard",
    );

    if (!seasonTotals || !seasonTotals.rowSet || seasonTotals.rowSet.length === 0) {
      return null;
    }

    const row = seasonTotals.rowSet[0];
    const headers = seasonTotals.headers;
    const ptsIndex = headers.indexOf("PTS");
    const fgaIndex = headers.indexOf("FGA");

    if (ptsIndex === -1 || fgaIndex === -1) {
      return null;
    }

    const pts = Number(row[ptsIndex]);
    const fga = Number(row[fgaIndex]);

    if (isNaN(pts) || isNaN(fga) || fga === 0) {
      return null;
    }

    // Get player info
    const playerInfoUrl = new URL(`${NBA_STATS_BASE}/commonplayerinfo`);
    playerInfoUrl.searchParams.set("PlayerID", String(playerId));

    const playerResponse = await nbaFetch(playerInfoUrl.toString(), {
      next: { revalidate: 3600 },
    });

    let player: Player = {
      id: playerId,
      first_name: "",
      last_name: "",
    };

    if (playerResponse.ok) {
      const playerData = (await playerResponse.json()) as {
        resultSets: Array<{
          headers: string[];
          rowSet: Array<Array<unknown>>;
        }>;
      };

      if (
        playerData.resultSets &&
        playerData.resultSets.length > 0 &&
        playerData.resultSets[0].rowSet.length > 0
      ) {
        const playerRow = playerData.resultSets[0].rowSet[0];
        const playerHeaders = playerData.resultSets[0].headers;
        const firstNameIndex = playerHeaders.indexOf("FIRST_NAME");
        const lastNameIndex = playerHeaders.indexOf("LAST_NAME");

        if (firstNameIndex !== -1 && lastNameIndex !== -1) {
          player = {
            id: playerId,
            first_name: String(playerRow[firstNameIndex] || ""),
            last_name: String(playerRow[lastNameIndex] || ""),
          };
        }
      }
    }

    console.log(`Found stats for player ${playerId} from previous season ${prevSeason}`);
    return {
      player,
      pts: Number(pts.toFixed(1)),
      fga: Number(fga.toFixed(1)),
    };
  } catch (error) {
    console.error(`Error fetching previous season stats:`, error);
    return null;
  }
}

/**
 * Fetch season averages for a player by ID
 * Returns PPG and FGA per game for the current season
 */
export async function fetchPlayerSeasonAverages(
  playerId: number,
): Promise<PlayerStats | null> {
  try {
    const season = getCurrentSeason();
    console.log(`Fetching stats for player ${playerId} for season ${season}`);

    // Use playerdashboardbygeneralsplits endpoint for season stats
    const url = new URL(`${NBA_STATS_BASE}/playerdashboardbygeneralsplits`);
    url.searchParams.set("MeasureType", "Base");
    url.searchParams.set("PerMode", "PerGame");
    url.searchParams.set("PlusMinus", "N");
    url.searchParams.set("PaceAdjust", "N");
    url.searchParams.set("Rank", "N");
    url.searchParams.set("LeagueID", "00");
    url.searchParams.set("Season", season);
    url.searchParams.set("SeasonType", "Regular Season");
    url.searchParams.set("PlayerID", String(playerId));
    url.searchParams.set("Outcome", "");
    url.searchParams.set("Location", "");
    url.searchParams.set("Month", "0");
    url.searchParams.set("SeasonSegment", "");
    url.searchParams.set("DateFrom", "");
    url.searchParams.set("DateTo", "");
    url.searchParams.set("OpponentTeamID", "0");
    url.searchParams.set("VsConference", "");
    url.searchParams.set("VsDivision", "");
    url.searchParams.set("GameSegment", "");
    url.searchParams.set("Period", "0");
    url.searchParams.set("ShotClockRange", "");
    url.searchParams.set("LastNGames", "0");

    const response = await nbaFetch(url.toString(), {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error(
        `NBA Stats API error: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      resultSets: Array<{
        name: string;
        headers: string[];
        rowSet: Array<Array<unknown>>;
      }>;
    };

    if (!data.resultSets || data.resultSets.length === 0) {
      console.error(`No stats found for player ${playerId} for season ${season}`);
      // Try previous season as fallback
      return await tryPreviousSeason(playerId);
    }

    // playerdashboardbygeneralsplits returns OverallPlayerDashboard (aggregated season stats), not SeasonTotalsRegularSeason
    const seasonTotals = data.resultSets.find(
      (rs) => rs.name === "OverallPlayerDashboard",
    );

    if (!seasonTotals || !seasonTotals.rowSet || seasonTotals.rowSet.length === 0) {
      console.error(`No OverallPlayerDashboard for player ${playerId} for season ${season}. Result sets: ${data.resultSets.map((rs) => rs.name).join(", ")}`);
      return await tryPreviousSeason(playerId);
    }

    const row = seasonTotals.rowSet[0];
    const headers = seasonTotals.headers;

    const ptsIndex = headers.indexOf("PTS");
    const fgaIndex = headers.indexOf("FGA");

    if (ptsIndex === -1 || fgaIndex === -1) {
      console.error(`Missing PTS or FGA in stats for player ${playerId}`);
      return null;
    }

    const pts = Number(row[ptsIndex]);
    const fga = Number(row[fgaIndex]);

    if (isNaN(pts) || isNaN(fga) || fga === 0) {
      console.error(`Invalid stats for player ${playerId}: pts=${pts}, fga=${fga}`);
      return null;
    }

    // Get player info from commonplayerinfo endpoint
    const playerInfoUrl = new URL(`${NBA_STATS_BASE}/commonplayerinfo`);
    playerInfoUrl.searchParams.set("PlayerID", String(playerId));

    const playerResponse = await nbaFetch(playerInfoUrl.toString(), {
      next: { revalidate: 3600 },
    });

    let player: Player = {
      id: playerId,
      first_name: "",
      last_name: "",
    };

    if (playerResponse.ok) {
      const playerData = (await playerResponse.json()) as {
        resultSets: Array<{
          headers: string[];
          rowSet: Array<Array<unknown>>;
        }>;
      };

      if (
        playerData.resultSets &&
        playerData.resultSets.length > 0 &&
        playerData.resultSets[0].rowSet.length > 0
      ) {
        const playerRow = playerData.resultSets[0].rowSet[0];
        const playerHeaders = playerData.resultSets[0].headers;
        const firstNameIndex = playerHeaders.indexOf("FIRST_NAME");
        const lastNameIndex = playerHeaders.indexOf("LAST_NAME");

        if (firstNameIndex !== -1 && lastNameIndex !== -1) {
          player = {
            id: playerId,
            first_name: String(playerRow[firstNameIndex] || ""),
            last_name: String(playerRow[lastNameIndex] || ""),
          };
        }
      }
    }

    return {
      player,
      pts: Number(pts.toFixed(1)),
      fga: Number(fga.toFixed(1)),
    };
  } catch (error) {
    console.error("Error fetching player season averages:", error);
    return null;
  }
}
