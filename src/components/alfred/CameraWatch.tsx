"use client";
// Motion-detection camera wake for Alfred.
// Samples webcam frames every 1.5s, computes average pixel delta.
// When motion exceeds threshold after a cooldown, dispatches alfred:wake.
// OFF by default — enable via Settings or localStorage alfred_camera_wake=1.
import { useEffect, useRef } from "react";

const MOTION_THRESHOLD = 28;   // avg per-channel pixel diff (0–255)
const SAMPLE_INTERVAL_MS = 1500;
const COOLDOWN_MS = 45000;     // 45s between wakes to prevent spam
const FRAME_W = 160;
const FRAME_H = 120;

export function CameraWatch() {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevRef   = useRef<Uint8ClampedArray | null>(null);
  const lastWake  = useRef<number>(0);

  useEffect(() => {
    let enabled = false;
    try { enabled = localStorage.getItem("alfred_camera_wake") === "1"; } catch {}
    if (!enabled) return;

    let stream: MediaStream | null = null;
    let intervalId: ReturnType<typeof setInterval>;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: FRAME_W, height: FRAME_H },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        intervalId = setInterval(() => {
          const canvas = canvasRef.current;
          const video  = videoRef.current;
          if (!canvas || !video) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
          const { data } = ctx.getImageData(0, 0, FRAME_W, FRAME_H);

          if (prevRef.current) {
            let totalDiff = 0;
            const step = 16; // sample every 4th pixel (stride 4 channels × 4 pixels = 16)
            let count = 0;
            for (let i = 0; i < data.length; i += step) {
              totalDiff += Math.abs(data[i]     - prevRef.current[i])
                        +  Math.abs(data[i + 1] - prevRef.current[i + 1])
                        +  Math.abs(data[i + 2] - prevRef.current[i + 2]);
              count++;
            }
            const avgDiff = totalDiff / (count * 3);

            if (avgDiff > MOTION_THRESHOLD) {
              const now = Date.now();
              if (now - lastWake.current > COOLDOWN_MS) {
                lastWake.current = now;
                window.dispatchEvent(new CustomEvent("alfred:wake", {
                  detail: { voice: false, source: "camera" },
                }));
              }
            }
          }

          prevRef.current = new Uint8ClampedArray(data);
        }, SAMPLE_INTERVAL_MS);
      } catch {
        // Camera permission denied or not available — silently disable
      }
    }

    start();

    return () => {
      clearInterval(intervalId);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <>
      {/* Hidden elements — only rendered when camera wake is active */}
      <video ref={videoRef} className="hidden" playsInline muted aria-hidden />
      <canvas ref={canvasRef} width={FRAME_W} height={FRAME_H} className="hidden" aria-hidden />
    </>
  );
}
