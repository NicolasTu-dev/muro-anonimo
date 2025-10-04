import React, { useEffect, useMemo, useRef, useState } from "react";
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

// normalizar a minúsculas SOLO para texto
const normalizeClue = (c) => {
  const isImage = typeof c.content === "string" && c.content.startsWith("data:image");
  return {
    ...c,
    alias: c.alias ? String(c.alias).toLowerCase() : null,
    content: isImage ? c.content : (c.content ? String(c.content).toLowerCase() : ""),
  };
};

export default function AnonymousWall() {
  const [alias, setAlias] = useStoredState("aw_alias", "");
  const [clues, setClues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // modo: "text" | "draw"
  const [mode, setMode] = useState("text");
  const [content, setContent] = useState("");
  // canvas refs/estado
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawingRef = useRef(false);
  const [brush, setBrush] = useState(4);
  const [hasDrawing, setHasDrawing] = useState(false);

  // supabase
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
      else setClues((data || []).map(normalizeClue));
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
            setClues((prev) => [normalizeClue(payload.new), ...prev]);
          }
          if (payload.eventType === "UPDATE" && payload.new?.wall_slug === WALL_SLUG) {
            setClues((prev) => prev.map((c) => (c.id === payload.new.id ? normalizeClue(payload.new) : c)));
          }
          if (payload.eventType === "DELETE" && payload.old?.wall_slug === WALL_SLUG) {
            setClues((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  // ------- Canvas: init y handlers -------
  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // tamaño lógico
    const width = 420, height = 260;
    // DPI fix
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = brush;
    ctx.fillStyle = "#0f131a"; // fondo oscuro
    ctx.fillRect(0, 0, width, height); // “limpiar” con fondo
    ctxRef.current = ctx;
    setHasDrawing(false);
  }, [mode]); // init al entrar en draw

  useEffect(() => {
    if (mode !== "draw") return;
    const ctx = ctxRef.current;
    if (ctx) ctx.lineWidth = brush;
  }, [brush, mode]);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ("touches" in e ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x, y };
  };

  const startDraw = (e) => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    drawingRef.current = true;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setHasDrawing(true);
  };

  const moveDraw = (e) => {
    if (mode !== "draw") return;
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    if (mode !== "draw") return;
    drawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const width = parseInt(canvas.style.width), height = parseInt(canvas.style.height);
    ctx.fillStyle = "#0f131a";
    ctx.fillRect(0, 0, width, height);
    setHasDrawing(false);
  };

  // publicar (texto o dibujo)
  const addClue = async () => {
    setError("");
    if (!supabase) { setError("No hay conexión a Supabase."); return; }

    let payload;
    if (mode === "draw") {
      if (!hasDrawing) { setError("hacé un trazito antes de publicar 😉"); return; }
      const dataUrl = canvasRef.current.toDataURL("image/png");
      payload = {
        wall_slug: WALL_SLUG,
        alias: alias?.trim() ? alias.trim().toLowerCase() : null,
        content: dataUrl, // imagen
      };
    } else {
      if (!content.trim()) return;
      payload = {
        wall_slug: WALL_SLUG,
        alias: alias?.trim() ? alias.trim().toLowerCase() : null,
        content: content.trim().toLowerCase(), // texto minúsculas
      };
    }

    const { error } = await supabase.from("clues").insert(payload);
    if (error) setError(error.message);
    else {
      setContent("");
      if (mode === "draw") clearCanvas();
    }
  };

  return (
    <div className="container">
      <header className="header">
        <div className="title">
          Murito con los chicos de Re de chill anónimo para pistas <span className="gift">🎁</span>
        </div>
      </header>

      <section className="card" aria-label="composer">
        {/* alias */}
        <div className="row" style={{marginBottom:12}}>
          <div style={{flex:1}}>
            <label className="subtitle" style={{display:"block", marginBottom:6}}>
              letras/apodo/alias (opcional)
            </label>
            <input
              className="input"
              style={{ textTransform: "lowercase" }}
              placeholder="anónimo, duende, etc."
              value={alias}
              onChange={(e) => setAlias(e.target.value.toLowerCase())}
            />
          </div>
        </div>

        {/* toggle texto/dibujo */}
        <div className="row" style={{marginBottom:12}}>
          <div className="actions" style={{justifyContent:"flex-start"}}>
            <button
              className="btn btn-primary"
              style={{ opacity: mode === "text" ? 1 : 0.65 }}
              onClick={() => setMode("text")}
            >
              texto
            </button>
            <button
              className="btn btn-primary"
              style={{ opacity: mode === "draw" ? 1 : 0.65 }}
              onClick={() => setMode("draw")}
            >
              dibujo
            </button>
          </div>
        </div>

        {/* editor según modo */}
        {mode === "text" ? (
          <>
            <h3 className="section-title">escribí una pista</h3>
            <div className="row">
              <div style={{flex:1}}>
                <textarea
                  className="textarea"
                  style={{ textTransform: "lowercase" }}
                  placeholder="ej: le gusta el café de especialidad..."
                  value={content}
                  onChange={(e) => setContent(e.target.value.toLowerCase())}
                />
              </div>
              <div className="actions">
                <button className="btn btn-primary" onClick={addClue} disabled={!content.trim()}>
                  publicar
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <h3 className="section-title">dibujá algo</h3>
            <div className="row" style={{alignItems:"center", marginBottom:8}}>
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <span className="subtitle">grosor:</span>
                <input type="range" min="1" max="16" value={brush} onChange={(e) => setBrush(parseInt(e.target.value))}/>
                <span className="subtitle">{brush}px</span>
              </div>
              <div className="actions" style={{marginLeft:"auto"}}>
                <button className="btn" onClick={clearCanvas}>borrar</button>
              </div>
            </div>

            <div
              style={{
                border:"1px solid #262b36",
                borderRadius:12,
                background:"#0f131a",
                width:420, height:260, overflow:"hidden"
              }}
            >
              <canvas
                ref={canvasRef}
                onMouseDown={startDraw}
                onMouseMove={moveDraw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={(e)=>{e.preventDefault(); startDraw(e);}}
                onTouchMove={(e)=>{e.preventDefault(); moveDraw(e);}}
                onTouchEnd={(e)=>{e.preventDefault(); endDraw();}}
                style={{ display:"block", width:420, height:260, touchAction:"none" }}
              />
            </div>

            <div className="actions" style={{marginTop:12}}>
              <button className="btn btn-primary" onClick={addClue} disabled={!hasDrawing}>
                publicar dibujo
              </button>
            </div>
          </>
        )}

        {error && <div style={{marginTop:10, color:"#ff7b7b", fontSize:13}}>{error}</div>}
      </section>

      <section className="card" aria-label="list">
        <div className="section-title" style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <span>pistas publicadas</span>
          {loading && <span className="subtitle">cargando…</span>}
        </div>

        {clues.length === 0 ? (
          <div className="subtitle">todavía no hay pistas.</div>
        ) : (
          <ul className="list">
            {clues.map((c) => {
              const isImg = typeof c.content === "string" && c.content.startsWith("data:image");
              return (
                <li key={c.id} className="item">
                  <div className="item-head">
                    <span className="item-alias">{c.alias || "anónimo"}</span>
                    <span>{formatDate(c.created_at)}</span>
                  </div>
                  {isImg ? (
                    <img
                      src={c.content}
                      alt="dibujo"
                      style={{maxWidth:"100%", borderRadius:8, border:"1px solid #262b36"}}
                    />
                  ) : (
                    <div className="item-content">{c.content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
