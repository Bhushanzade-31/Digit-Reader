import { useRef, useState, useEffect } from "react";

export default function App() {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [preview, setPreview] = useState(null);
  const [blob, setBlob] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, c.width, c.height);
  };
  useEffect(clearCanvas, []);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return [
      ((p.clientX - r.left) * canvasRef.current.width) / r.width,
      ((p.clientY - r.top) * canvasRef.current.height) / r.height,
    ];
  };
  const start = (e) => {
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(...pos(e));
    setPreview(null);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.lineTo(...pos(e));
    ctx.stroke();
  };
  const end = () => (drawing.current = false);

  const onUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setBlob(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError("");
  };

  const predict = async () => {
    setLoading(true);
    setError("");
    try {
      const img =
        preview && blob
          ? blob
          : await new Promise((res) => canvasRef.current.toBlob(res, "image/png"));
      const fd = new FormData();
      fd.append("image", img, "digit.png");
      let resp;
      try {
        resp = await fetch("/api/predict", { method: "POST", body: fd });
      } catch {
        throw new Error(
          "Cannot reach the prediction backend. Make sure it is running on port 5000."
        );
      }

      const responseText = await resp.text();
      let data;
      if (responseText.trim()) {
        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            resp.ok
              ? "The prediction backend returned an invalid response."
              : `The prediction backend is unavailable (HTTP ${resp.status}). Check that it started correctly.`
          );
        }
      } else if (!resp.ok) {
        throw new Error(
          `The prediction backend is unavailable (HTTP ${resp.status}). Check that it started correctly.`
        );
      } else {
        throw new Error("The prediction backend returned an empty response.");
      }
      if (!resp.ok) throw new Error(data.error || "Prediction failed");
      setResult(data);
      setHistory((h) => [data.digit, ...h].slice(0, 10));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const speak = () => {
    if (!result) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.caption));
  };

  const reset = () => {
    clearCanvas();
    setPreview(null);
    setBlob(null);
    setResult(null);
    setError("");
  };

  return (
    <main className="app">
      <h1>Digit Reader</h1>
      <p className="sub">Draw a digit or upload an image, and I'll read it.</p>

      <div className="stage">
        {preview ? (
          <img src={preview} alt="uploaded digit" className="canvas" />
        ) : (
          <canvas
            ref={canvasRef}
            width={280}
            height={280}
            className="canvas"
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={end}
            onMouseLeave={end}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={end}
          />
        )}
      </div>

      <div className="row">
        <button onClick={predict} disabled={loading}>
          {loading ? "Reading…" : "Read digit"}
        </button>
        <label className="btn secondary">
          Upload
          <input type="file" accept="image/*" hidden onChange={onUpload} />
        </label>
        <button className="secondary" onClick={reset}>Clear</button>
      </div>

      {error && <p className="error">{error}</p>}

      {result && (
        <section className="result">
          <div className="big">{result.digit}</div>
          <p>{result.caption} ({(result.confidence * 100).toFixed(1)}% sure)</p>
          <button onClick={speak}>🔊 Read aloud</button>
          <ul>
            {result.top3.map((t) => (
              <li key={t.digit}>
                <span>{t.digit}</span>
                <div className="bar"><div style={{ width: `${t.confidence * 100}%` }} /></div>
                <small>{(t.confidence * 100).toFixed(1)}%</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.length > 0 && <p className="history">Recent: {history.join(", ")}</p>}
    </main>
  );
}
