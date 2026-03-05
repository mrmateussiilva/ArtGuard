import { useState } from "react";
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
  Divider,
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
  const [cropRegions, setCropRegions] = useState("");
  const [cropBasename, setCropBasename] = useState(`parte_${itemIndex}`);
  const [textValue, setTextValue] = useState(defaultText);
  const [textX, setTextX] = useState(10);
  const [textY, setTextY] = useState(10);
  const [fontSize, setFontSize] = useState(24);
  const [fontPath, setFontPath] = useState("");
  const [loading, setLoading] = useState(false);

  const sourcePath = item.matched_file
    ? `${storagePath.replace(/\/$/, "")}/${item.matched_file}`
    : "";

  const handleCrop = async () => {
    if (!sourcePath || !cropRegions.trim()) {
      toast.error("Informe as regiões (JSON: [{x,y,width,height}, ...])");
      return;
    }
    let regions: { x: number; y: number; width: number; height: number }[];
    try {
      regions = JSON.parse(cropRegions);
    } catch {
      toast.error("JSON de regiões inválido.");
      return;
    }
    const outputDir = await open({ directory: true, title: "Pasta para salvar as partes" });
    if (!outputDir || typeof outputDir !== "string") return;
    setLoading(true);
    try {
      const paths = await invoke<string[]>("crop_image_into_parts", {
        sourcePath,
        outputDir,
        regions,
        outputBasename: cropBasename,
      });
      toast.success(`${paths.length} parte(s) salva(s).`);
      setCropOpen(false);
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
    const outputPath = await save({
      title: "Salvar imagem como",
      filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (!outputPath) return;
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
    } catch (e: unknown) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePickFont = async () => {
    const selected = await open({
      title: "Selecionar fonte (.ttf)",
      directory: false,
      multiple: false,
      filters: [{ name: "Fontes", extensions: ["ttf", "otf"] }],
    });
    if (selected && typeof selected === "string") setFontPath(selected);
  };

  if (!openProp) return null;

  return (
    <Dialog open={openProp} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: "16px", p: 1 } }}>
      <DialogTitle sx={{ fontWeight: 800, color: "#0F172A", fontSize: "1.1rem" }}>
        Verificações — Item {itemIndex + 1}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {/* Resumo: Medida e Resolução (DPI) */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#64748B", mb: 1 }}>
              Resumo das verificações
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <StraightenIcon fontSize="small" sx={{ color: "#64748B" }} />
                <Typography variant="body2">
                  Medida:{" "}
                  {item.measure_ok === true && <CheckCircleIcon sx={{ fontSize: 16, color: "#16a34a" }} />}
                  {item.measure_ok === false && <ErrorIcon sx={{ fontSize: 16, color: "#dc2626" }} />}
                  {item.measure_ok == null && "—"}
                  {item.measure_ok === true && " OK"}
                  {item.measure_ok === false && " Abaixo do esperado"}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <HighQualityIcon fontSize="small" sx={{ color: "#64748B" }} />
                <Typography variant="body2">
                  Resolução (DPI):{" "}
                  {item.dpi_ok === true && <CheckCircleIcon sx={{ fontSize: 16, color: "#16a34a" }} />}
                  {item.dpi_ok === false && <ErrorIcon sx={{ fontSize: 16, color: "#dc2626" }} />}
                  {item.dpi_x != null && item.dpi_y != null
                    ? `${Math.round(item.dpi_x)}×${Math.round(item.dpi_y)}`
                    : "—"}
                  {item.dpi_ok === true && " OK"}
                  {item.dpi_ok === false && " Abaixo do mínimo"}
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Divider />

          {!item.matched_file ? (
            <Typography variant="body2" color="text.secondary">
              Nenhuma imagem correspondente; recorte e texto só estão disponíveis quando há match.
            </Typography>
          ) : (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#64748B" }}>
                Ações na imagem correspondente
              </Typography>

              {!cropOpen && !textOpen && (
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    startIcon={<ContentCutIcon />}
                    onClick={() => setCropOpen(true)}
                    sx={{ borderRadius: "10px" }}
                  >
                    Recortar em partes
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<TextFieldsIcon />}
                    onClick={() => {
                      setTextValue(defaultText || textValue);
                      setTextOpen(true);
                    }}
                    sx={{ borderRadius: "10px" }}
                  >
                    Escrever nome na região
                  </Button>
                </Stack>
              )}

              {cropOpen && (
                <Box sx={{ p: 2, bgcolor: "#f8fafc", borderRadius: "12px" }}>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                    Regiões (JSON): [{"{ x, y, width, height }"}, ...]
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    value={cropRegions}
                    onChange={(e) => setCropRegions(e.target.value)}
                    placeholder='[{"x":0,"y":0,"width":500,"height":500}]'
                    size="small"
                    sx={{ mb: 1, "& .MuiInputBase-root": { fontFamily: "monospace", fontSize: "0.85rem" } }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Nome base das partes"
                    value={cropBasename}
                    onChange={(e) => setCropBasename(e.target.value)}
                    sx={{ mb: 1 }}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button variant="contained" onClick={handleCrop} disabled={loading} size="small">
                      {loading ? "Salvando…" : "Recortar e escolher pasta"}
                    </Button>
                    <Button variant="text" onClick={() => setCropOpen(false)} size="small">
                      Cancelar
                    </Button>
                  </Stack>
                </Box>
              )}

              {textOpen && (
                <Box sx={{ p: 2, bgcolor: "#f8fafc", borderRadius: "12px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Texto (nome)"
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    sx={{ mb: 1 }}
                  />
                  <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <TextField type="number" size="small" label="X" value={textX} onChange={(e) => setTextX(Number(e.target.value))} sx={{ width: 80 }} />
                    <TextField type="number" size="small" label="Y" value={textY} onChange={(e) => setTextY(Number(e.target.value))} sx={{ width: 80 }} />
                    <TextField type="number" size="small" label="Tamanho fonte" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} sx={{ width: 100 }} />
                  </Stack>
                  <Button variant="outlined" size="small" onClick={handlePickFont} sx={{ mb: 1, display: "block" }}>
                    {fontPath ? fontPath.split(/[/\\]/).pop() : "Selecionar fonte (.ttf)"}
                  </Button>
                  <Stack direction="row" spacing={1}>
                    <Button variant="contained" onClick={handleDrawText} disabled={loading || !fontPath} size="small">
                      {loading ? "Salvando…" : "Aplicar e escolher onde salvar"}
                    </Button>
                    <Button variant="text" onClick={() => setTextOpen(false)} size="small">
                      Cancelar
                    </Button>
                  </Stack>
                </Box>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ borderRadius: "10px" }}>
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
