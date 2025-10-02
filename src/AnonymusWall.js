import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import { Copy, LogIn, Send, Shield, DoorOpen } from "lucide-react";

// Simple utility to format dates in user's locale
function formatDate(d) {
  try {
    return new Date(d).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

// Persist + load from localStorage with a key
const useStoredState = (key, initial) => {
  const [val, setVal] = useState(() => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : initial;
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(val));
  }, [key, val]);
  return [val, setVal];
};

export default function AnonymousWall() {
  // Connection and identity
  const [url, setUrl] = useStoredState("aw_supabase_url", "");
  const [anonKey, setAnonKey] = useStoredState("aw_supabase_anon", "");
  const [wall, setWall] = useStoredState("aw_wall_slug", "pistas-navidad");
  const [alias, setAlias] = useStoredState("aw_alias", "");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  // Supabase client (recomputed on creds change)
  const supabase = useMemo(() => {
    if (!url || !anonKey) return null;
    try {
      return createClient(url, anonKey, { db: { schema: "public" } });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [url, anonKey]);

  // Data state
  const [clues, setClues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");

  const joinWall = async () => {
    setError("");
    if (!supabase) {
      setError("Configura Supabase URL y Anon Key.");
      return;
    }
    if (!wall) {
      setError("Elegí un código de muro (wall slug).");
      return;
    }
    setConnected(true);
  };

  // Fetch existing clues when connected
  useEffect(() => {
    const fetchClues = async () => {
      if (!connected || !supabase || !wall) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("clues")
        .select("id, wall_slug, alias, content, created_at")
        .eq("wall_slug", wall)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) setError(error.message);
      else setClues(data || []);
      setLoading(false);
    };
    fetchClues();
  }, [connected, supabase, wall]);

  // Realtime subscription
  useEffect(() => {
    if (!connected || !supabase || !wall) return;
    const channel = supabase
      .channel("clues-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "clues",
          filter: `wall_slug=eq.${wall}`,
        },
        (payload) => {
          setClues((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe((status) => {
        // Optional: console.log("Realtime:", status);
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [connected, supabase, wall]);

  const addClue = async () => {
    setError("");
    if (!content.trim()) return;
    if (!supabase) {
      setError("No hay conexión a Supabase.");
      return;
    }
    const payload = {
      wall_slug: wall,
      alias: alias?.trim() || null,
      content: content.trim(),
    };
    const { error } = await supabase.from("clues").insert(payload);
    if (error) setError(error.message);
    else setContent("");
  };

  const disconnect = () => {
    setConnected(false);
  };

  const shareRef = useRef(null);
  const copyShare = () => {
    const txt = `Únete al muro anónimo\nWall: ${wall}`;
    navigator.clipboard?.writeText(txt);
  };

  return (
    <div className="min-h-screen bg-neutral-100 py-10">
      <div className="max-w-3xl mx-auto px-4">
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold mb-2"
        >
          Murito con los chicos de Re de chill anónimo para pistas 🎁
        </motion.h1>
        <p className="text-neutral-600 mb-6">
          pueden publicar pistas sin revelar identidad
        </p>

        {/* Connection card */}
        <div className="bg-white rounded-2xl shadow p-5 mb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">
                Supabase URL
              </label>
              <input
                className="w-full rounded-xl border p-2"
                placeholder="https://YOUR-PROJECT.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">
                Supabase Anon Key
              </label>
              <input
                className="w-full rounded-xl border p-2"
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Wall</label>
              <input
                className="w-full rounded-xl border p-2"
                placeholder="pistas-navidad"
                value={wall}
                onChange={(e) => setWall(e.target.value.replace(/\s+/g, "-"))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Alias (opcional)</label>
              <input
                className="w-full rounded-xl border p-2"
                placeholder="Anónimo, Duende, etc."
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            {!connected ? (
              <button
                onClick={joinWall}
                className="px-4 py-2 rounded-xl bg-black text-white flex items-center gap-2 shadow"
              >
                <LogIn size={18} /> Conectarte al muro
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="px-4 py-2 rounded-xl bg-neutral-200 flex items-center gap-2"
              >
                <DoorOpen size={18} /> Desconectarte del muro
              </button>
            )}
          </div>

          {error && (
            <div className="mt-3 text-sm text-red-600">{error}</div>
          )}
        </div>

        {/* Composer + list */}
        <div className="bg-white rounded-2x2 shadow p-5">
          <h2 className="text-lg font-semibold mb-3">aca escriben una pista</h2>
          <div className="flex gap-4">
            <textarea
              className="flex-1 rounded-xl border p-10 h-30"
              placeholder="Ej: Nose ingeniense algun ejemplo loquitos jaja"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!connected}
            />
            <button
              onClick={addClue}
              disabled={!connected || !content.trim()}
              className="self-end h-10 px-4 rounded-xl bg-black text-white flex items-center gap-2 disabled:opacity-40"
            >
              <Send size={18} /> Publicar pista
            </button>
          </div>

          <div className="border-t mt-5 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Pistas publicadas:</h3>
              {loading && <span className="text-sm text-neutral-500">Cargando…</span>}
            </div>
            {clues.length === 0 ? (
              <p className="text-neutral-500 text-sm">Todavia no hay pistas</p>
            ) : (
              <ul className="space-y-3">
                {clues.map((c) => (
                  <li key={c.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-neutral-600">
                        {c.alias || "Anónimo"}
                      </span>
                      <span className="text-xs text-neutral-400">{formatDate(c.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{c.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
