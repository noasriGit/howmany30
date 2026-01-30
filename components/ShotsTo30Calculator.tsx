"use client";

import { useEffect, useState } from "react";

type Player = {
  id: number;
  first_name: string;
  last_name: string;
};

type CalculationResult = {
  shots: number;
  playerName: string;
  pts: number;
  fga: number;
} | null;

export function ShotsTo30Calculator() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searchMeta, setSearchMeta] = useState<{
    current_page: number;
    next_page: number | null;
    total_count: number;
  } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [result, setResult] = useState<CalculationResult>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search players on query change
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchMeta(null);
      return;
    }

    // Only search if query is at least 3 characters to reduce API calls and improve results
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      setSearchMeta(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/players/search?q=${encodeURIComponent(searchQuery)}&per_page=25`,
        );
        if (response.ok) {
          const data = await response.json();
          console.log("Search response:", data);
          const players = data.data || [];
          console.log(`Setting ${players.length} search results`);
          setSearchResults(players);
          setSearchMeta(data.meta || null);
        } else {
          console.error("Search API error:", response.status, response.statusText);
          if (response.status === 429) {
            setError("Rate limit reached. Please wait a moment.");
            setSearchResults([]);
            setSearchMeta(null);
          }
        }
      } catch (err) {
        console.error("Error searching players:", err);
        setSearchResults([]);
        setSearchMeta(null);
      } finally {
        setSearchLoading(false);
      }
    }, 800); // Increased debounce to 800ms to reduce API calls

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const loadMorePlayers = async () => {
    if (!searchMeta?.next_page || !searchQuery.trim()) return;

    try {
      const response = await fetch(
        `/api/players/search?q=${encodeURIComponent(searchQuery)}&page=${searchMeta.next_page}&per_page=50`,
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults((prev) => [...prev, ...(data.data || [])]);
        setSearchMeta(data.meta || null);
      }
    } catch {
      // Silently fail
    }
  };

  // Calculate when player is selected
  useEffect(() => {
    if (!selectedPlayer) {
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/players/${selectedPlayer.id}/stats`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch stats");
        }
        const data = await response.json();
        return data.data;
      })
      .then((stats) => {
        if (!stats) {
          setError("No season data available for this player.");
          setResult(null);
          return;
        }

        if (stats.fga === 0 || stats.pts === 0) {
          setError("Player has no field goal attempts or points this season.");
          setResult(null);
          return;
        }

        const pointsPerShot = stats.pts / stats.fga;
        const shotsTo30 = 30 / pointsPerShot;
        const roundedShots = Number(shotsTo30.toFixed(1));

        setResult({
          shots: roundedShots,
          playerName: `${stats.player.first_name} ${stats.player.last_name}`,
          pts: stats.pts,
          fga: stats.fga,
        });
      })
      .catch((err) => {
        console.error("Error fetching player stats:", err);
        setError("Failed to load player data. Please try again.");
        setResult(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedPlayer]);

  const handlePlayerSelect = (player: Player) => {
    setSelectedPlayer(player);
    setSearchQuery(`${player.first_name} ${player.last_name}`);
    setSearchResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      
      // If there are search results, select the first one immediately
      if (searchResults.length > 0) {
        handlePlayerSelect(searchResults[0]);
        return;
      }
      
      // If there's a query but no results, trigger a search and wait for it
      if (searchQuery.trim()) {
        setSearchLoading(true);
        fetch(`/api/players/search?q=${encodeURIComponent(searchQuery)}&per_page=50`)
          .then(async (response) => {
            if (!response.ok) {
              throw new Error("Search failed");
            }
            const data = await response.json();
            return data;
          })
              .then((data) => {
                console.log("Enter key search response:", data);
                if (data.data && data.data.length > 0) {
                  setSearchResults(data.data);
                  setSearchMeta(data.meta);
                  handlePlayerSelect(data.data[0]);
                } else {
                  setError("No players found. Try a different search.");
                }
              })
          .catch((err) => {
            console.error("Error searching:", err);
            setError("Failed to search for players. Please try again.");
          })
          .finally(() => {
            setSearchLoading(false);
          });
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-5 py-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            How Many Shots to Score 30
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Based on current season efficiency
          </p>
        </div>

        {/* Player Selector */}
        <div className="relative mb-6">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search for a player..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
              </div>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border-2 border-blue-200 bg-white shadow-xl">
              {searchResults.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handlePlayerSelect(player)}
                  className="w-full px-4 py-3 text-left text-sm text-slate-900 transition-colors hover:bg-blue-50 focus:bg-blue-50 focus:outline-none first:rounded-t-xl"
                >
                  {player.first_name} {player.last_name}
                </button>
              ))}
              {searchMeta?.next_page && (
                <button
                  onClick={loadMorePlayers}
                  className="w-full border-t border-slate-200 px-4 py-3 text-center text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 focus:bg-blue-50 focus:outline-none last:rounded-b-xl"
                >
                  Load more players ({searchMeta.total_count - searchResults.length} remaining)
                </button>
              )}
            </div>
          )}
          {searchQuery.trim() && !searchLoading && searchResults.length === 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 shadow-lg">
              No players found. Try a different search.
            </div>
          )}
        </div>

        {/* Result Card */}
        {loading && (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-slate-600">Loading player stats...</p>
          </div>
        )}

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
            <p className="text-sm font-medium text-red-800">{error}</p>
            {selectedPlayer && (
              <button
                onClick={() => {
                  setError(null);
                  setSelectedPlayer(null);
                  setSearchQuery("");
                }}
                className="mt-4 rounded-lg bg-red-100 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-200"
              >
                Try another player
              </button>
            )}
          </div>
        )}

        {result && !loading && (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="text-center">
              <p className="text-sm font-medium text-slate-600">
                {result.playerName} needs
              </p>
              <p className="mt-2 text-5xl font-bold text-slate-900 sm:text-6xl">
                {result.shots}
              </p>
              <p className="mt-1 text-lg font-medium text-slate-700">
                shots to score 30
              </p>
              <p className="mt-6 text-xs text-slate-500">
                Based on current season efficiency
              </p>
              <p className="mt-1 text-xs text-slate-500">
                ({result.pts} PPG, {result.fga} FGA)
              </p>
              <p className="mt-4 text-xs text-slate-400">
                Assumes similar shot quality and usage
              </p>
            </div>
          </div>
        )}

        {!result && !loading && !error && selectedPlayer && (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-600">Calculating...</p>
          </div>
        )}

        {!result && !loading && !error && !selectedPlayer && (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-700">
              Search for a player above
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Type a player's name to see how many shots they need to score 30 points
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
