import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kfkdwnwztquorlegrudb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtma2R3bnd6dHF1b3JsZWdydWRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0MzI3NjIsImV4cCI6MjA3NTAwODc2Mn0.qugH_G_44fiQ2QUHrKoHQFSdvXzrhVtTo9qMMwBNf4A";
const WALL_SLUG = "muritoDeChill";

function formatDate(d) {
  try {
    return new Date(d).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return d; }
}

// localStorage helper
const useStoredState = (key, initial) => {
  const [val, setVal] = useState(() => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : initial;
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(val)); }, [key, val]);
  return [val, setVal];
};

export default function AnonymousWall() {
  const [alias, setAlias] = useStoredState("aw_alias", "");
  const [clues, setClues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  const supabase = useMemo(() => {
    try { return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: "public" } }); }
    catch (e) { console.error(e); return null; }
  }, []);

  useEffect(() => { document.title = `Muro: ${WALL_SLUG}`; }, []);

  // fetch inicial
  useEffect(() => {
    const fetchClues = async () => {
      if (!supabase) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("clues")
        .select("id, wall_slug, alias, content, created_at")
        .eq("wall_slug", WALL_SLUG)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) setError(error.message);
      else setClues(data || []);
      setLoading(false);
    };
    fetchClues();
  }, [supabase]);

  // realtime
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("clues-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clues" },
        (payload) => {
          if (payload.eventType === "INSERT" && payload.new?.wall_slug === WALL_SLUG) {
            setClues((prev) => [payload.new, ...prev]);
          }
          if (payload.eventType === "UPDATE" && payload.new?.wall_slug === WALL_SLUG) {
            setClues((prev) => prev.map((c) => (c.id === payload.new.id ? payload.new : c)));
          }
          if (payload.eventType === "DELETE" && payload.old?.wall_slug === WALL_SLUG) {
            setClues((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  const addClue = async () => {
    setError("");
    if (!content.trim()) return;
    if (!supabase) { setError("No hay conexión a Supabase."); return; }
    const payload = { wall_slug: WALL_SLUG, alias: alias?.trim() || null, content: content.trim() };
    const { error } = await supabase.from("clues").insert(payload);
    if (error) setError(error.message); else setContent("");
  };

  return (
    <div className="container">
      <header className="header">
        <div className="title">
          Murito con los chicos de Re de chill anónimo para pistas <span className="gift">🎁</span>
        </div>
      </header>

      <section className="card" aria-label="composer">
        <div className="row" style={{marginBottom:12}}>
          <div style={{flex:1}}>
            <label className="subtitle" style={{display:"block", marginBottom:6}}>
              Letras aleatorias/apodo/alias (opcional)
            </label>
            <input
              className="input"
              placeholder="Anónimo, Duende, etc."
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
          </div>
        </div>

        <h3 className="section-title">Escribí una pista</h3>
        <div className="row">
          <div style={{flex:1}}>
            <textarea
              className="textarea"
              placeholder="Ej: le gusta el café de especialidad..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="actions">
            <button className="btn btn-primary" onClick={addClue} disabled={!content.trim()}>
              Publicar
            </button>
          </div>
        </div>

        {error && <div style={{marginTop:10, color:"#ff7b7b", fontSize:13}}>{error}</div>}
      </section>

      <section className="card" aria-label="list">
        <div className="section-title" style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <span>Pistas publicadas</span>
          {loading && <span className="subtitle">Cargando…</span>}
        </div>

        {clues.length === 0 ? (
          <div className="subtitle">Todavía no hay pistas.</div>
        ) : (
          <ul className="list">
            {clues.map((c) => (
              <li key={c.id} className="item">
                <div className="item-head">
                  <span className="item-alias">{c.alias || "Anónimo"}</span>
                  <span>{formatDate(c.created_at)}</span>
                </div>
                <div className="item-content">{c.content}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
