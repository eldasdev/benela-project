"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Crop, ImagePlus, RefreshCcw, RotateCw, Trash2, Upload } from "lucide-react";
import { AdminModal, adminButtonStyle, adminInputStyle } from "@/components/admin/ui";
import { uploadAdminPlatformImage } from "@/lib/platform-media";
import { readErrorMessage } from "@/lib/admin-utils";

type Props = {
  label: string;
  description?: string;
  value?: string | null;
  onChange: (value: string) => void;
  onClear?: () => void;
  assetType?: string;
  aspectRatio?: number;
  fitMode?: "cover" | "contain";
};

const OUTPUT_WIDTH = 1600;
const PREVIEW_WIDTH = 720;
const CHECKERBOARD =
  "linear-gradient(45deg, rgba(148, 163, 184, 0.14) 25%, transparent 25%, transparent 75%, rgba(148, 163, 184, 0.14) 75%), linear-gradient(45deg, rgba(148, 163, 184, 0.14) 25%, transparent 25%, transparent 75%, rgba(148, 163, 184, 0.14) 75%)";
const PREVIEW_VARIANTS = [
  {
    key: "transparent",
    label: "Transparent canvas",
    description: "Shows alpha edges and anti-aliasing.",
    outerBackground: "#f8fbff",
    innerBackground: CHECKERBOARD,
  },
  {
    key: "light",
    label: "Light interface",
    description: "Preview on bright content surfaces.",
    outerBackground: "linear-gradient(180deg, #f7fbff, #eff5ff)",
    innerBackground: "#ffffff",
  },
  {
    key: "dark",
    label: "Dark interface",
    description: "Checks legibility on deep brand surfaces.",
    outerBackground: "linear-gradient(180deg, #24325f, #1e2a4d)",
    innerBackground: "#23345f",
  },
  {
    key: "brand",
    label: "Brand panel",
    description: "Tests the image inside a marketing card treatment.",
    outerBackground: "linear-gradient(145deg, rgba(37, 99, 235, 0.18), rgba(99, 102, 241, 0.12), rgba(248, 250, 252, 0.96))",
    innerBackground: "linear-gradient(160deg, rgba(248, 250, 252, 0.96), rgba(226, 236, 255, 0.94))",
  },
] as const;

type PreviewKey = (typeof PREVIEW_VARIANTS)[number]["key"];

function drawImageToCanvas({
  canvas,
  image,
  width,
  height,
  zoom,
  rotation,
  brightness,
  contrast,
  offsetX,
  offsetY,
  fitMode,
}: {
  canvas: HTMLCanvasElement | null;
  image: HTMLImageElement | null;
  width: number;
  height: number;
  zoom: number;
  rotation: number;
  brightness: number;
  contrast: number;
  offsetX: number;
  offsetY: number;
  fitMode: "cover" | "contain";
}) {
  if (!canvas) return;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (!image) return;

  const baseScale =
    fitMode === "contain"
      ? Math.min(canvas.width / image.width, canvas.height / image.height) * 0.86
      : Math.max(canvas.width / image.width, canvas.height / image.height);
  const drawScale = baseScale * zoom;
  const drawWidth = image.width * drawScale;
  const drawHeight = image.height * drawScale;

  ctx.save();
  ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
  ctx.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

export default function PlatformImageField({
  label,
  description,
  value,
  onChange,
  onClear,
  assetType = "general",
  aspectRatio = 16 / 9,
  fitMode,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRefs = useRef<Record<PreviewKey, HTMLCanvasElement | null>>({
    transparent: null,
    light: null,
    dark: null,
    brand: null,
  });
  const [open, setOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [temporaryUrl, setTemporaryUrl] = useState<string | null>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  const outputHeight = useMemo(() => Math.round(OUTPUT_WIDTH / aspectRatio), [aspectRatio]);
  const previewHeight = useMemo(() => Math.round(PREVIEW_WIDTH / aspectRatio), [aspectRatio]);
  const resolvedFitMode = useMemo(() => {
    if (fitMode) return fitMode;
    return /logo|icon|badge|seal|mark/i.test(assetType) ? "contain" : "cover";
  }, [assetType, fitMode]);

  useEffect(() => {
    return () => {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    };
  }, [temporaryUrl]);

  useEffect(() => {
    if (!sourceUrl) {
      setImage(null);
      return;
    }
    setLoadingImage(true);
    setError("");
    const next = new Image();
    next.crossOrigin = "anonymous";
    next.onload = () => {
      setImage(next);
      setLoadingImage(false);
    };
    next.onerror = () => {
      setImage(null);
      setLoadingImage(false);
      setError("Could not load image into the editor.");
    };
    next.src = sourceUrl;
  }, [sourceUrl]);

  useEffect(() => {
    drawImageToCanvas({
      canvas: canvasRef.current,
      image,
      width: OUTPUT_WIDTH,
      height: outputHeight,
      zoom,
      rotation,
      brightness,
      contrast,
      offsetX,
      offsetY,
      fitMode: resolvedFitMode,
    });

    for (const variant of PREVIEW_VARIANTS) {
      drawImageToCanvas({
        canvas: previewCanvasRefs.current[variant.key],
        image,
        width: PREVIEW_WIDTH,
        height: previewHeight,
        zoom,
        rotation,
        brightness,
        contrast,
        offsetX: offsetX * (PREVIEW_WIDTH / OUTPUT_WIDTH),
        offsetY: offsetY * (PREVIEW_WIDTH / OUTPUT_WIDTH),
        fitMode: resolvedFitMode,
      });
    }
  }, [brightness, contrast, image, offsetX, offsetY, outputHeight, previewHeight, resolvedFitMode, rotation, zoom]);

  const resetAdjustments = () => {
    setZoom(1);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setOffsetX(0);
    setOffsetY(0);
  };

  const openFromFile = (file: File) => {
    if (temporaryUrl) {
      URL.revokeObjectURL(temporaryUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setTemporaryUrl(objectUrl);
    setSourceUrl(objectUrl);
    setSourceName(file.name);
    resetAdjustments();
    setOpen(true);
  };

  const openFromCurrent = async () => {
    if (!value) return;
    setError("");
    try {
      const res = await fetch(value, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load current image.");
      const blob = await res.blob();
      const file = new File([blob], "current-image.webp", { type: blob.type || "image/webp" });
      openFromFile(file);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load current image into the editor."));
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: offsetX,
      originY: offsetY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const deltaX = (event.clientX - dragRef.current.startX) * scaleX;
    const deltaY = (event.clientY - dragRef.current.startY) * scaleY;
    setOffsetX(dragRef.current.originX + deltaX);
    setOffsetY(dragRef.current.originY + deltaY);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current.active = false;
  };

  const uploadEditedImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setUploading(true);
    setError("");
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (!result) {
            reject(new Error("Could not prepare image for upload."));
            return;
          }
          resolve(result);
        }, "image/webp", 0.92);
      });
      const file = new File([blob], `${assetType}-${Date.now()}.webp`, { type: "image/webp" });
      const uploaded = await uploadAdminPlatformImage(file, assetType);
      onChange(uploaded.url);
      setOpen(false);
      setSourceUrl(null);
      setImage(null);
      setSourceName("");
      resetAdjustments();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not upload edited image."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div>
        <label style={{ display: "block", fontSize: "12px", color: "var(--text-subtle)", marginBottom: "8px" }}>{label}</label>
        {description ? <div style={{ marginBottom: "10px", fontSize: "12px", color: "var(--text-quiet)", lineHeight: 1.6 }}>{description}</div> : null}
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ borderRadius: "18px", border: "1px solid color-mix(in srgb, var(--border-default) 78%, transparent)", background: "color-mix(in srgb, var(--bg-surface) 94%, transparent)", overflow: "hidden" }}>
          {value ? (
            <div style={{ aspectRatio: `${aspectRatio}`, backgroundImage: `url(${value})`, backgroundSize: "cover", backgroundPosition: "center" }} />
          ) : (
            <div style={{ aspectRatio: `${aspectRatio}`, display: "grid", placeItems: "center", color: "var(--text-quiet)", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 18%, transparent), color-mix(in srgb, var(--bg-panel) 94%, transparent))" }}>
              <div style={{ display: "grid", gap: "8px", justifyItems: "center" }}>
                <Crop size={24} />
                <div style={{ fontSize: "13px", fontWeight: 600 }}>No cover uploaded yet</div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" style={adminButtonStyle("secondary")} onClick={() => fileInputRef.current?.click()}>
            <ImagePlus size={16} /> {value ? "Replace image" : "Upload image"}
          </button>
          {value ? (
            <button type="button" style={adminButtonStyle("ghost")} onClick={() => void openFromCurrent()}>
              <Crop size={16} /> Edit current image
            </button>
          ) : null}
          {value && onClear ? (
            <button type="button" style={adminButtonStyle("danger")} onClick={onClear}>
              <Trash2 size={16} /> Remove
            </button>
          ) : null}
        </div>

        {value ? (
          <input value={value} readOnly style={adminInputStyle({ fontSize: "12px", color: "var(--text-quiet)" })} />
        ) : null}

        {error ? (
          <div style={{ borderRadius: "14px", border: "1px solid color-mix(in srgb, var(--danger) 34%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, var(--bg-surface) 90%)", color: "var(--danger)", padding: "12px 14px", fontSize: "13px" }}>
            {error}
          </div>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) openFromFile(file);
          event.currentTarget.value = "";
        }}
      />

      <AdminModal
        open={open}
        onClose={() => setOpen(false)}
        title="Image editor"
        description="Crop the frame, adjust image treatment, and upload a clean platform asset. Drag the image inside the frame to reposition it."
        width={1180}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) 320px", gap: "18px" }} className="admin-blog-meta-grid">
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{sourceName || "Prepared image"}</div>
              <div style={{ fontSize: "12px", color: "var(--text-quiet)" }}>{OUTPUT_WIDTH}×{outputHeight} export</div>
            </div>
            <div
              style={{
                borderRadius: "22px",
                overflow: "hidden",
                border: "1px solid color-mix(in srgb, var(--border-default) 74%, transparent)",
                background: "#f5f9ff",
                backgroundImage: CHECKERBOARD,
                backgroundPosition: "0 0, 12px 12px",
                backgroundSize: "24px 24px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
              }}
            >
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                style={{ width: "100%", display: "block", cursor: dragRef.current.active ? "grabbing" : "grab", touchAction: "none" }}
              />
            </div>
            {loadingImage ? <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>Loading image...</div> : null}
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Live preview suite</div>
                <div style={{ fontSize: "12px", color: "var(--text-quiet)" }}>Transparent edges and brand contrast preview</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }} className="admin-blog-meta-grid">
                {PREVIEW_VARIANTS.map((variant) => (
                  <div
                    key={variant.key}
                    style={{
                      borderRadius: "18px",
                      border: "1px solid color-mix(in srgb, var(--border-default) 74%, transparent)",
                      background: "color-mix(in srgb, var(--bg-surface) 96%, transparent)",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)", display: "grid", gap: "4px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{variant.label}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-quiet)", lineHeight: 1.5 }}>{variant.description}</div>
                    </div>
                    <div style={{ padding: "14px", background: variant.outerBackground }}>
                      <div
                        style={{
                          borderRadius: "14px",
                          overflow: "hidden",
                          background: variant.innerBackground,
                          backgroundPosition: variant.key === "transparent" ? "0 0, 12px 12px" : undefined,
                          backgroundSize: variant.key === "transparent" ? "24px 24px" : undefined,
                          border: variant.key === "dark" ? "1px solid rgba(255,255,255,0.12)" : "1px solid color-mix(in srgb, var(--border-default) 58%, transparent)",
                          boxShadow: variant.key === "brand" ? "0 16px 32px color-mix(in srgb, var(--accent) 14%, transparent)" : "none",
                        }}
                      >
                        <canvas
                          ref={(node) => {
                            previewCanvasRefs.current[variant.key] = node;
                          }}
                          style={{
                            width: "100%",
                            display: "block",
                            aspectRatio: `${aspectRatio}`,
                            height: "auto",
                            pointerEvents: "none",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: "14px", alignContent: "start" }}>
            <div style={{ borderRadius: "18px", border: "1px solid color-mix(in srgb, var(--border-default) 74%, transparent)", background: "color-mix(in srgb, var(--bg-surface) 94%, transparent)", padding: "16px", display: "grid", gap: "12px" }}>
              <Control label="Zoom" value={zoom} min={1} max={3} step={0.01} display={`${zoom.toFixed(2)}x`} onChange={setZoom} />
              <Control label="Rotation" value={rotation} min={-180} max={180} step={1} display={`${rotation.toFixed(0)}°`} onChange={setRotation} />
              <Control label="Brightness" value={brightness} min={60} max={140} step={1} display={`${brightness.toFixed(0)}%`} onChange={setBrightness} />
              <Control label="Contrast" value={contrast} min={60} max={140} step={1} display={`${contrast.toFixed(0)}%`} onChange={setContrast} />
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <button type="button" style={adminButtonStyle("ghost")} onClick={resetAdjustments}>
                <RefreshCcw size={16} /> Reset adjustments
              </button>
              <button type="button" style={adminButtonStyle("ghost")} onClick={() => setRotation((prev) => prev + 90)}>
                <RotateCw size={16} /> Rotate 90°
              </button>
              <button type="button" style={adminButtonStyle("secondary")} onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} /> Choose another image
              </button>
              <button type="button" style={adminButtonStyle("primary")} disabled={!image || uploading} onClick={() => void uploadEditedImage()}>
                <Upload size={16} /> {uploading ? "Uploading..." : "Upload edited image"}
              </button>
            </div>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

function Control({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "grid", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{label}</span>
        <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 700 }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
