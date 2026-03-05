import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Stack,
  TextField,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Grid,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import StraightenIcon from "@mui/icons-material/Straighten";
import HighQualityIcon from "@mui/icons-material/HighQuality";
import { toast } from "sonner";

export interface ValidationItemResult {
  url: string;
  status: string;
  score: number;
  matched_file: string | null;
  width?: number | null;
  height?: number | null;
  dpi_x?: number | null;
  dpi_y?: number | null;
  dpi_ok?: boolean;
  measure_ok?: boolean | null;
}

interface VerificationActionsDialogProps {
  open: boolean;
  onClose: () => void;
  item: ValidationItemResult;
  itemIndex: number;
  storagePath: string;
  /** Nome sugerido para "Escrever nome na imagem" (ex.: descrição do item do pedido). */
  defaultText?: string;
}

export function VerificationActionsDialog({
  open: openProp,
  onClose,
  item,
  itemIndex,
  storagePath,
  defaultText = "",
}: VerificationActionsDialogProps) {
  const [cropOpen, setCropOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [cropCols, setCropCols] = useState(2);
  const [cropRows, setCropRows] = useState(2);
  const [cropBasename, setCropBasename] = useState(`parte_${itemIndex}`);
  const [cropWidthFallback, setCropWidthFallback] = useState("");
  const [cropHeightFallback, setCropHeightFallback] = useState("");
  const [textValue, setTextValue] = useState(defaultText);
  const [textX, setTextX] = useState(10);
  const [textY, setTextY] = useState(10);
  const [fontSize, setFontSize] = useState(24);
  const [fontPath, setFontPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [outputModeText, setOutputModeText] = useState<"overwrite" | "new">("new");
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const [cropOverwrite, setCropOverwrite] = useState(true);

  const sourcePath = item.matched_file
    ? `${storagePath.replace(/\/$/, "")}/${item.matched_file}`
    : "";

  useEffect(() => {
    if (openProp) {
      invoke<{ default_font_path?: string | null }>("get_config")
        .then((c) => { if (c?.default_font_path) setFontPath(c.default_font_path); })
        .catch(() => {});
    }
  }, [openProp]);

  const imgW = item.width ?? (cropWidthFallback ? parseInt(cropWidthFallback, 10) : 0);
  const imgH = item.height ?? (cropHeightFallback ? parseInt(cropHeightFallback, 10) : 0);

  const getPositionFromGrid = (row: number, col: number): { x: number; y: number } => {
    const w = imgW > 0 ? imgW : 1000;
    const h = imgH > 0 ? imgH : 800;
    const margin = 20;
    const textW = 200;
    const textH = 50;
    const xLeft = margin;
    const xCenter = Math.max(margin, Math.floor(w / 2 - textW / 2));
    const xRight = Math.max(margin, w - textW - margin);
    const yTop = margin;
    const yMiddle = Math.max(margin, Math.floor(h / 2 - textH / 2));
    const yBottom = Math.max(margin, h - textH - margin);
    const xs = [xLeft, xCenter, xRight];
    const ys = [yTop, yMiddle, yBottom];
    return { x: xs[col], y: ys[row] };
  };

  const handleGridPositionSelect = (row: number, col: number) => {
    const { x, y } = getPositionFromGrid(row, col);
    setTextX(x);
    setTextY(y);
  };

  const gridPositionLabel = (row: number, col: number): string => {
    const rows = ["Topo", "Meio", "Base"];
    const cols = ["Esq.", "Centro", "Dir."];
    return `${rows[row]} ${cols[col]}`;
  };

  const buildCropRegions = (): { x: number; y: number; width: number; height: number }[] => {
    if (imgW <= 0 || imgH <= 0) return [];
    const cols = Math.max(1, Math.min(20, cropCols));
    const rows = Math.max(1, Math.min(20, cropRows));
    const w = Math.floor(imgW / cols);
    const h = Math.floor(imgH / rows);
    const regions: { x: number; y: number; width: number; height: number }[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * w;
        const y = row * h;
        const width = col === cols - 1 ? imgW - x : w;
        const height = row === rows - 1 ? imgH - y : h;
        regions.push({ x, y, width, height });
      }
    }
    return regions;
  };

  const handleCrop = async () => {
    if (!sourcePath) return;
    const regions = buildCropRegions();
    if (regions.length === 0) {
      toast.error("Informe as dimensões da imagem (largura e altura em pixels) ou use um item com match que já tenha dimensões.");
      return;
    }
    const outputDir = await open({ directory: true, title: "Pasta para salvar as partes" });
    if (!outputDir || typeof outputDir !== "string") return;
    const basename = cropOverwrite ? cropBasename : `${cropBasename}_${Date.now()}`;
    setLoading(true);
    try {
      const paths = await invoke<string[]>("crop_image_into_parts", {
        sourcePath,
        outputDir,
        regions,
        outputBasename: basename,
      });
      toast.success(`${paths.length} parte(s) salva(s).`);
      setCropOpen(false);
    } catch (e: unknown) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  const applyDrawText = async (outputPath: string) => {
    if (!sourcePath || !fontPath) return;
    setLoading(true);
    try {
      await invoke("draw_text_on_image", {
        sourcePath,
        outputPath,
        text: textValue || " ",
        x: textX,
        y: textY,
        width: 200,
        height: 50,
        fontPath,
        fontSize,
      });
      toast.success("Texto aplicado e imagem salva.");
      setTextOpen(false);
      setConfirmOverwriteOpen(false);
    } catch (e: unknown) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDrawText = async () => {
    if (!sourcePath || !fontPath) {
      toast.error("Selecione a fonte (arquivo .ttf).");
      return;
    }
    if (outputModeText === "overwrite") {
      setConfirmOverwriteOpen(true);
      return;
    }
    const outputPath = await save({
      title: "Salvar imagem como",
      filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (!outputPath) return;
    await applyDrawText(outputPath);
  };

  const handleConfirmOverwrite = () => {
    applyDrawText(sourcePath);
  };

  const handlePickFont = async () => {
    const selected = await open({
      title: "Selecionar fonte (.ttf)",
      directory: false,
      multiple: false,
      filters: [{ name: "Fontes", extensions: ["ttf", "otf"] }],
    });
    if (selected && typeof selected === "string") {
      setFontPath(selected);
      try {
        const config = await invoke<{ default_font_path?: string | null } & Record<string, unknown>>("get_config");
        await invoke("save_config", { config: { ...config, default_font_path: selected } });
      } catch {
        // persistência opcional; não bloquear o fluxo
      }
    }
  };

  if (!openProp) return null;

  return (
    <Dialog open={openProp} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: "16px", p: 2, minHeight: "40vh" } }}>
      <DialogTitle sx={{ fontWeight: 800, color: "#0F172A", fontSize: "1.15rem", pb: 1 }}>
        Verificações — Item {itemIndex + 1}
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Grid container spacing={3}>
          {/* Coluna esquerda: imagem de destino + resumo */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Stack spacing={2}>
              {item.matched_file && (
                <Paper variant="outlined" sx={{ p: 2, bgcolor: "#f1f5f9", borderRadius: "12px" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#64748B", mb: 1 }}>
                    Imagem de destino
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: "#0F172A", wordBreak: "break-all" }}>
                    {item.matched_file}
                  </Typography>
                  {(item.width != null && item.height != null) && (
                    <Typography variant="caption" sx={{ color: "#64748B", display: "block", mt: 0.5 }}>
                      {item.width} × {item.height} px
                    </Typography>
                  )}
                </Paper>
              )}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: "12px" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#64748B", mb: 1.5 }}>
                  Resumo
                </Typography>
                <Stack spacing={1}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <StraightenIcon fontSize="small" sx={{ color: "#64748B" }} />
                    <Typography variant="body2">
                      Medida: {item.measure_ok === true && <CheckCircleIcon sx={{ fontSize: 16, color: "#16a34a" }} />}
                      {item.measure_ok === false && <ErrorIcon sx={{ fontSize: 16, color: "#dc2626" }} />}
                      {item.measure_ok == null && "—"}
                      {item.measure_ok === true && " OK"}
                      {item.measure_ok === false && " Abaixo do esperado"}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <HighQualityIcon fontSize="small" sx={{ color: "#64748B" }} />
                    <Typography variant="body2">
                      DPI: {item.dpi_x != null && item.dpi_y != null ? `${Math.round(item.dpi_x)}×${Math.round(item.dpi_y)}` : "—"}
                      {item.dpi_ok ? " OK" : item.dpi_x != null ? " Abaixo do mínimo" : ""}
                    </Typography>
                  </Box>
                  {item.width != null && item.height != null && (
                    <Typography variant="body2" sx={{ color: "#64748B" }}>
                      Dimensões: {item.width}×{item.height} px
                    </Typography>
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Grid>

          {/* Coluna direita: ações */}
          <Grid size={{ xs: 12, md: 8 }}>
            {!item.matched_file ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                Nenhuma imagem correspondente; recorte e texto só estão disponíveis quando há match.
              </Typography>
            ) : (
              <Grid container spacing={2}>
                {/* Card Recortar */}
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Paper variant="outlined" sx={{ p: 2, height: "100%", borderRadius: "12px", bgcolor: cropOpen ? "#f0f9ff" : "#fafafa" }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#0F172A" }}>
                        Recortar imagem
                      </Typography>
                      {!cropOpen ? (
                        <Button variant="outlined" size="small" startIcon={<ContentCutIcon />} onClick={() => setCropOpen(true)} sx={{ borderRadius: "8px" }}>
                          Abrir
                        </Button>
                      ) : (
                        <Button variant="text" size="small" onClick={() => setCropOpen(false)}>Fechar</Button>
                      )}
                    </Box>
                    {cropOpen && (
                      <Stack spacing={1.5}>
                        <Typography variant="body2" color="text.secondary">
                          Divida a imagem em um grid. Ex.: 2×2 = 4 partes iguais.
                        </Typography>
                        <Stack direction="row" spacing={2}>
                          <TextField type="number" size="small" label="Colunas" value={cropCols} onChange={(e) => setCropCols(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))} inputProps={{ min: 1, max: 20 }} sx={{ width: 100 }} />
                          <TextField type="number" size="small" label="Linhas" value={cropRows} onChange={(e) => setCropRows(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))} inputProps={{ min: 1, max: 20 }} sx={{ width: 100 }} />
                        </Stack>
                        {(() => {
                          const cols = Math.max(1, Math.min(20, cropCols));
                          const rows = Math.max(1, Math.min(20, cropRows));
                          const parts = cols * rows;
                          return (
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: "#0F172A", mb: 1 }}>
                                Serão geradas {parts} parte{parts !== 1 ? "s" : ""}
                              </Typography>
                              <Box
                                sx={{
                                  display: "grid",
                                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                                  gridTemplateRows: `repeat(${rows}, 1fr)`,
                                  width: Math.min(cols * 24, 200),
                                  height: Math.min(rows * 24, 120),
                                  gap: 1,
                                  bgcolor: "#e2e8f0",
                                  p: 0.5,
                                  borderRadius: 1,
                                }}
                              >
                                {Array.from({ length: parts }, (_, i) => (
                                  <Box key={i} sx={{ bgcolor: "#94a3b8", borderRadius: 0.5, minHeight: 12 }} />
                                ))}
                              </Box>
                            </Box>
                          );
                        })()}
                        {(item.width == null || item.height == null) && (
                          <Stack direction="row" spacing={1}>
                            <TextField type="number" size="small" label="Largura (px)" value={cropWidthFallback} onChange={(e) => setCropWidthFallback(e.target.value)} placeholder="ex: 1000" sx={{ flex: 1 }} />
                            <TextField type="number" size="small" label="Altura (px)" value={cropHeightFallback} onChange={(e) => setCropHeightFallback(e.target.value)} placeholder="ex: 800" sx={{ flex: 1 }} />
                          </Stack>
                        )}
                        <TextField size="small" label="Nome base das partes" value={cropBasename} onChange={(e) => setCropBasename(e.target.value)} fullWidth />
                        <FormControl component="fieldset" size="small">
                          <RadioGroup row value={cropOverwrite ? "overwrite" : "unique"} onChange={(_, v) => setCropOverwrite(v === "overwrite")}>
                            <FormControlLabel value="overwrite" control={<Radio size="small" />} label="Sobrescrever se existir" />
                            <FormControlLabel value="unique" control={<Radio size="small" />} label="Sempre nome novo" />
                          </RadioGroup>
                        </FormControl>
                        <Button variant="contained" onClick={handleCrop} disabled={loading} size="medium" sx={{ alignSelf: "flex-start", borderRadius: "8px" }}>
                          {loading ? "Salvando…" : "Recortar e escolher pasta"}
                        </Button>
                      </Stack>
                    )}
                  </Paper>
                </Grid>

                {/* Card Escrever nome */}
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Paper variant="outlined" sx={{ p: 2, height: "100%", borderRadius: "12px", bgcolor: textOpen ? "#f0fdf4" : "#fafafa" }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#0F172A" }}>
                        Escrever nome na imagem
                      </Typography>
                      {!textOpen ? (
                        <Button variant="outlined" size="small" startIcon={<TextFieldsIcon />} onClick={() => { setTextValue(defaultText || textValue); setTextOpen(true); }} sx={{ borderRadius: "8px" }}>
                          Abrir
                        </Button>
                      ) : (
                        <Button variant="text" size="small" onClick={() => setTextOpen(false)}>Fechar</Button>
                      )}
                    </Box>
                    {textOpen && (
                      <Stack spacing={1.5}>
                        <FormControl component="fieldset" size="small">
                          <RadioGroup row value={outputModeText} onChange={(_, v) => setOutputModeText(v as "overwrite" | "new")}>
                            <FormControlLabel value="new" control={<Radio size="small" />} label="Criar novo arquivo" />
                            <FormControlLabel value="overwrite" control={<Radio size="small" />} label="Sobrescrever a imagem" />
                          </RadioGroup>
                        </FormControl>
                        <TextField fullWidth size="small" label="Texto (nome)" value={textValue} onChange={(e) => setTextValue(e.target.value)} />
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 600, color: "#64748B", display: "block", mb: 0.5 }}>
                            Posição do texto (clique na célula)
                          </Typography>
                          <Box sx={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, 1fr)",
                            gap: 0.5,
                            width: "100%",
                            maxWidth: 180,
                            "& button": {
                              minHeight: 44,
                              border: "1px solid",
                              borderColor: "#e2e8f0",
                              borderRadius: 1,
                              bgcolor: "#f8fafc",
                              cursor: "pointer",
                              fontSize: "0.7rem",
                              color: "#64748B",
                              "&:hover": { bgcolor: "#f1f5f9", borderColor: "#cbd5e1" },
                              "&.selected": { bgcolor: "#e0f2fe", borderColor: "#0ea5e9", color: "#0369a1", fontWeight: 600 }
                            }
                          }}>
                            {[0, 1, 2].map((row) =>
                              [0, 1, 2].map((col) => {
                                const { x, y } = getPositionFromGrid(row, col);
                                const selected = textX === x && textY === y;
                                return (
                                  <button
                                    key={`${row}-${col}`}
                                    type="button"
                                    className={selected ? "selected" : ""}
                                    onClick={() => handleGridPositionSelect(row, col)}
                                    title={`${gridPositionLabel(row, col)} (${x}, ${y})`}
                                  >
                                    {gridPositionLabel(row, col)}
                                  </button>
                                );
                              })
                            )}
                          </Box>
                          <Typography variant="caption" sx={{ color: "#94A3B8", display: "block", mt: 0.5 }}>
                            {imgW > 0 && imgH > 0 ? `Posição atual: ${textX}, ${textY} px` : "Dimensões da imagem usadas para calcular a posição."}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <TextField type="number" size="small" label="Tamanho da fonte" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} sx={{ width: 120 }} />
                        </Stack>
                        <Button variant="outlined" size="small" onClick={handlePickFont} sx={{ alignSelf: "flex-start" }}>
                          {fontPath ? `Fonte: ${fontPath.split(/[/\\]/).pop()}` : "Selecionar fonte (.ttf)"}
                        </Button>
                        <Button variant="contained" onClick={handleDrawText} disabled={loading || !fontPath} size="medium" sx={{ alignSelf: "flex-start", borderRadius: "8px" }}>
                          {loading ? "Salvando…" : outputModeText === "new" ? "Aplicar e escolher onde salvar" : "Aplicar (sobrescrever)"}
                        </Button>
                      </Stack>
                    )}
                  </Paper>
                </Grid>
              </Grid>
            )}
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ borderRadius: "10px" }}>
          Fechar
        </Button>
      </DialogActions>

      <Dialog
        open={confirmOverwriteOpen}
        onClose={() => setConfirmOverwriteOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: "1rem" }}>
          Sobrescrever imagem?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Isso irá modificar o arquivo original. Deseja continuar?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmOverwriteOpen(false)} sx={{ borderRadius: "10px" }}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleConfirmOverwrite} disabled={loading} sx={{ borderRadius: "10px", bgcolor: "#b91c1c", "&:hover": { bgcolor: "#991b1b" } }}>
            {loading ? "Aplicando…" : "Continuar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
