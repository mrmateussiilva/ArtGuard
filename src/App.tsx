import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Toaster, toast } from 'sonner';
import { listen } from "@tauri-apps/api/event";
import InfoIcon from '@mui/icons-material/Info';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import {
  Typography,
  TextField,
  Button,
  Box,
  CircularProgress,
  Alert,
  Paper,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Chip,
  Stack,
  ThemeProvider,
  createTheme,
  CssBaseline,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { open } from "@tauri-apps/plugin-dialog";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CloseIcon from "@mui/icons-material/Close";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import AssignmentIcon from "@mui/icons-material/Assignment";
import SettingsIcon from "@mui/icons-material/Settings";
import ShieldIcon from "@mui/icons-material/Shield";
import SaveIcon from "@mui/icons-material/Save";
import LayersIcon from "@mui/icons-material/Layers";
import { ValidationModal as AssistedValidationModal } from "./components/ValidationModal";
import { VerificationActionsDialog, type ValidationItemResult } from "./components/VerificationActionsDialog";

const getImageUrl = (path: string | undefined, apiUrl: string) => {
  if (!path) return "";
  try {
    const urlObj = new URL(apiUrl);
    const baseUrl = urlObj.origin;
    return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  } catch {
    return path;
  }
};

interface Item {
  tipo_producao?: string;
  largura?: string;
  altura?: string;
  tecido?: string;
  imagem?: string;
  descricao?: string;
}

interface Pedido {
  id?: number;
  numero?: string;
  cliente?: string;
  data_entrega?: string;
  status?: string;
  items?: Item[];
}

type StageStatus = "pending" | "running" | "success" | "error";

interface ValidationPhase {
  id: string;
  label: string;
  status: StageStatus;
  icon: React.ReactNode;
}

interface ValidationModalProps {
  open: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  storagePath: string;
  apiUrl: string;
  thresholdApproved: number;
  thresholdAttention: number;
}

const STAGES_CONFIG = [
  { id: "downloading", label: "Baixando referência", icon: <LayersIcon fontSize="small" /> },
  { id: "normalizing", label: "Normalizando imagem", icon: <AutoAwesomeIcon fontSize="small" /> },
  { id: "hashing", label: "Gerando hashes", icon: <ShieldIcon fontSize="small" /> },
  { id: "loading_index", label: "Carregando índice", icon: <AssignmentIcon fontSize="small" /> },
  { id: "matching", label: "Buscando match", icon: <ImageSearchIcon fontSize="small" /> },
  { id: "scoring", label: "Calculando score", icon: <AnalyticsIcon fontSize="small" /> },
  { id: "finalizing", label: "Finalizando", icon: <DoneAllIcon fontSize="small" /> },
];

interface InformationalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'success' | 'info' | 'warning' | 'error';
}

function InformationalDialog({ open, onClose, title, message, type = 'info' }: InformationalDialogProps) {
  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircleOutlineIcon sx={{ fontSize: 48, color: "#16A34A" }} />;
      case 'warning': return <ReportProblemIcon sx={{ fontSize: 48, color: "#D97706" }} />;
      case 'error': return <ErrorOutlineIcon sx={{ fontSize: 48, color: "#DC2626" }} />;
      default: return <InfoIcon sx={{ fontSize: 48, color: "#3182CE" }} />;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: "16px", p: 1 } }}>
      <DialogTitle sx={{ textAlign: "center", pt: 4, pb: 2 }}>
        {getIcon()}
        <Typography variant="h6" sx={{ mt: 2, fontWeight: 800, color: "#1E293B" }}>
          {title}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ textAlign: "center", px: 4 }}>
        <Typography variant="body2" sx={{ color: "#64748B", fontWeight: 500, lineHeight: 1.6 }}>
          {message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "center", pb: 4, pt: 2 }}>
        <Button
          variant="contained"
          onClick={onClose}
          sx={{
            bgcolor: "#1E293B",
            px: 4,
            borderRadius: "10px",
            '&:hover': { bgcolor: "#334155" }
          }}
        >
          Entendido
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ValidationModal({ open, onClose, pedido, storagePath, apiUrl, thresholdApproved, thresholdAttention }: ValidationModalProps) {
  const [phases, setPhases] = useState<ValidationPhase[]>(
    STAGES_CONFIG.map(s => ({ ...s, status: "pending" }))
  );
  const [result, setResult] = useState<{
    score: number;
    status: string;
    items?: ValidationItemResult[];
    total_items?: number;
  } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [verificationItemIndex, setVerificationItemIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open && pedido) {
      setPhases(STAGES_CONFIG.map(s => ({ ...s, status: "pending" })));
      setResult(null);
      setLocalError(null);

      let unlistenFn: (() => void) | null = null;

      const run = async () => {
        try {
          unlistenFn = await listen<any>("validation-stage", (event) => {
            const { stage, status, data } = event.payload;
            setPhases(prev =>
              prev.map(p => (p.id === stage ? { ...p, status } : p))
            );
            if (stage === "finalizing" && status === "success" && data) {
              setResult(data);
            }
          });

          const itemsWithImage = (pedido.items || []).filter(item => item.imagem);
          const imageUrls = itemsWithImage.map(item => getImageUrl(item.imagem, apiUrl));
          const measuresCm = itemsWithImage.map(item => [
            parseFloat(item.largura) || 0,
            parseFloat(item.altura) || 0
          ]);
          const itemMeasuresCm = measuresCm.every(([a, b]) => a > 0 && b > 0)
            ? measuresCm
            : undefined;

          await invoke("validate_order", {
            orderId: pedido.id,
            imageUrls,
            storagePath,
            thresholdApproved: thresholdApproved,
            thresholdAttention: thresholdAttention,
            itemMeasuresCm: itemMeasuresCm ?? null
          });
        } catch (err: any) {
          console.error("Validation error:", err);
          setLocalError(err.toString());
          // Mark any remains as error
          setPhases(prev =>
            prev.map(p => (p.status === "running" || p.status === "pending" ? (p.id === "downloading" ? { ...p, status: "error" } : p) : p))
          );
        }
      };

      run();

      return () => {
        if (unlistenFn) unlistenFn();
      };
    }
  }, [open, pedido, storagePath, apiUrl]);

  const getStatusIcon = (status: StageStatus) => {
    switch (status) {
      case "running": return <CircularProgress size={20} thickness={5} />;
      case "success": return <CheckCircleIcon sx={{ color: "#166534" }} />;
      case "error": return <ErrorIcon sx={{ color: "#991B1B" }} />;
      default: return <RadioButtonUncheckedIcon sx={{ color: "#CBD5E1" }} />;
    }
  };

  const completedCount = phases.filter((p) => p.status === "success").length;
  const currentPhase = phases.find((p) => p.status === "running");
  const allDone = result != null;

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: "16px", p: 1 }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, pb: 0.5 }} component="div">
        <Typography variant="h6" component="div" sx={{ fontWeight: 800, color: "#0F172A", textTransform: "uppercase", fontSize: "0.95rem" }}>
          Validando Pedido #{pedido?.numero || pedido?.id}
        </Typography>
        <Typography variant="caption" sx={{ color: "#64748B", fontWeight: 500 }}>
          Processamento visual automatizado
        </Typography>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12, color: "#94A3B8" }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ px: 3, py: 2 }}>
          {/* Progresso em uma linha: ícones conectados */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0, mb: 1.5 }}>
            {phases.map((phase, i) => (
              <Box key={phase.id} sx={{ display: "flex", alignItems: "center", flex: i < phases.length - 1 ? 0 : 1 }}>
                <Box sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: phase.status === "success" ? "#DCFCE7" : phase.status === "running" ? "#E0F2FE" : "#F1F5F9",
                  border: `2px solid ${phase.status === "success" ? "#16a34a" : phase.status === "running" ? "#0ea5e9" : "#e2e8f0"}`,
                  flexShrink: 0
                }}>
                  {phase.status === "success" ? (
                    <CheckCircleIcon sx={{ fontSize: 16, color: "#16a34a" }} />
                  ) : phase.status === "running" ? (
                    <CircularProgress size={14} thickness={5} sx={{ color: "#0ea5e9" }} />
                  ) : (
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "#94A3B8" }}>{i + 1}</Typography>
                  )}
                </Box>
                {i < phases.length - 1 && (
                  <Box sx={{
                    width: 20,
                    height: 2,
                    bgcolor: phase.status === "success" ? "#86efac" : "#e2e8f0",
                    mx: 0.25
                  }} />
                )}
              </Box>
            ))}
          </Box>
          <Typography variant="caption" sx={{ color: "#64748B", display: "block", textAlign: "center" }}>
            {allDone ? "Concluído" : currentPhase ? currentPhase.label : `${completedCount} de ${phases.length} etapas`}
          </Typography>

          {localError && (
            <Alert severity="error" sx={{ mt: 2, borderRadius: "12px" }}>
              {localError}
            </Alert>
          )}

          {result && (
            <FadeIn>
              <Paper elevation={0} sx={{
                mt: 2,
                p: 2,
                bgcolor:
                  result.status === "approved" ? "#F0FDF4" :
                    result.status === "attention" ? "#FFFBEB" : "#FEF2F2",
                border: `1px solid ${result.status === "approved" ? "#BBF7D0" :
                  result.status === "attention" ? "#FEF3C7" : "#FECACA"
                  }`,
                borderRadius: "12px",
                textAlign: "center"
              }}>
                <Typography variant="overline" sx={{
                  fontWeight: 700,
                  color:
                    result.status === "approved" ? "#166534" :
                      result.status === "attention" ? "#92400E" : "#991B1B"
                }}>
                  Resultado da Validação
                </Typography>
                <Typography variant="h5" sx={{
                  fontWeight: 900,
                  color:
                    result.status === "approved" ? "#15803d" :
                      result.status === "attention" ? "#D97706" : "#b91c1c",
                  my: 0.5,
                  textTransform: "uppercase"
                }}>
                  {result.status === "approved" ? "Aprovado" :
                    result.status === "attention" ? "Atenção" : "Divergente"}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: "#475569" }}>
                  Score médio: {result.score.toFixed(1)}%
                </Typography>
              </Paper>

              {result.items && result.items.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#64748B", mb: 1, textAlign: "left" }}>
                    Por item — aplicar verificações
                  </Typography>
                  <Stack spacing={0.75}>
                    {result.items.map((it, idx) => (
                      <Paper
                        key={idx}
                        variant="outlined"
                        sx={{
                          p: 1.25,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderRadius: "10px",
                          bgcolor: "#f8fafc"
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: "#0F172A" }}>
                            Item {idx + 1}
                          </Typography>
                          <Chip
                            size="small"
                            label={it.matched_file || "Sem match"}
                            sx={{
                              bgcolor: it.matched_file ? "#E0F2FE" : "#FEE2E2",
                              color: it.matched_file ? "#0369A1" : "#B91C1C",
                              fontWeight: 600,
                              fontSize: "0.75rem"
                            }}
                          />
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                            <Typography component="span" variant="caption" sx={{ color: "#64748B" }}>
                              Score: {it.score.toFixed(0)}%
                            </Typography>
                            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                              <Typography component="span" variant="caption" sx={{ color: it.dpi_ok === false ? "#b45309" : "#64748B", fontWeight: it.dpi_ok === false ? 600 : 400 }}>
                                DPI: {it.dpi_x != null && it.dpi_y != null ? `${Math.round(it.dpi_x)}×${Math.round(it.dpi_y)}` : "—"}
                                {it.dpi_ok === true && " OK"}
                                {it.dpi_ok === false && " Abaixo"}
                              </Typography>
                              {it.dpi_ok === true && <CheckCircleIcon sx={{ fontSize: 14, color: "#16a34a", verticalAlign: "middle" }} />}
                              {it.dpi_ok === false && <ErrorIcon sx={{ fontSize: 14, color: "#dc2626", verticalAlign: "middle" }} />}
                            </Box>
                            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                              <Typography component="span" variant="caption" sx={{ color: it.measure_ok === false ? "#b45309" : "#64748B", fontWeight: it.measure_ok === false ? 600 : 400 }}>
                                Medida: {it.measure_ok === true ? "OK" : it.measure_ok === false ? "Abaixo" : "—"}
                                {it.measure_ok === true && <CheckCircleIcon sx={{ fontSize: 14, color: "#16a34a", verticalAlign: "middle" }} />}
                                {it.measure_ok === false && <ErrorIcon sx={{ fontSize: 14, color: "#dc2626", verticalAlign: "middle" }} />}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => setVerificationItemIndex(idx)}
                          sx={{
                            borderRadius: "8px",
                            bgcolor: "#1e293b",
                            "&:hover": { bgcolor: "#334155" }
                          }}
                        >
                          Verificações
                        </Button>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              )}

              {verificationItemIndex !== null && result.items?.[verificationItemIndex] && (
                <VerificationActionsDialog
                  open={true}
                  onClose={() => setVerificationItemIndex(null)}
                  item={result.items[verificationItemIndex]}
                  itemIndex={verificationItemIndex}
                  storagePath={storagePath}
                  defaultText={(pedido?.items as Item[] | undefined)?.filter((i: Item) => i.imagem)[verificationItemIndex]?.descricao}
                />
              )}
            </FadeIn>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function FadeIn({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{
      animation: "fadeIn 0.5s ease-out forwards",
      "@keyframes fadeIn": {
        "0%": { opacity: 0, transform: "translateY(10px)" },
        "100%": { opacity: 1, transform: "translateY(0)" }
      }
    }}>
      {children}
    </Box>
  );
}

function App() {
  const [currentTab, setCurrentTab] = useState<"pedidos" | "configuracoes">("pedidos");
  const [url, setUrl] = useState("http://localhost:8000/pedidos/");
  const [storagePath, setStoragePath] = useState("");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation Config States
  const [thresholdApproved, setThresholdApproved] = useState(90);
  const [thresholdAttention, setThresholdAttention] = useState(70);
  const [minMatchScore, setMinMatchScore] = useState(50);
  const [minDpi, setMinDpi] = useState(150);
  const [acceptedFormats, setAcceptedFormats] = useState("PNG, JPG, TIFF, WEBP");

  const [validationOpen, setValidationOpen] = useState(false);
  const [assistedValidationOpen, setAssistedValidationOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [selectedReferenceUrl, setSelectedReferenceUrl] = useState("");

  const theme = useMemo(() => CreateAppTheme(), []);

  // Notification state
  const [infoModal, setInfoModal] = useState<{ open: boolean; title: string; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({
    open: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showInfoModal = (title: string, message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setInfoModal({ open: true, title, message, type });
  };

  // Load Config on Mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await invoke<any>("get_config");
        setUrl(config.api_url);
        setStoragePath(config.storage_path);
        setThresholdApproved(config.validation.threshold_approved);
        setThresholdAttention(config.validation.threshold_attention);
        setMinMatchScore(config.validation.min_match_score ?? 50);
        setMinDpi(config.validation.min_dpi);
        setAcceptedFormats(config.validation.accepted_formats.join(", ").toUpperCase());
      } catch (err) {
        console.error("Erro ao carregar configurações:", err);
      }
    };
    loadConfig();
  }, []);

  const handleSaveConfig = async () => {
    setLoading(true);
    try {
      const config = {
        api_url: url,
        storage_path: storagePath,
        validation: {
          threshold_approved: thresholdApproved,
          threshold_attention: thresholdAttention,
          min_match_score: minMatchScore,
          min_dpi: minDpi,
          accepted_formats: acceptedFormats.split(",").map(s => s.trim().toLowerCase()).filter(s => s !== ""),
          hash_algorithm: "Mean",
          hash_size: 8,
          normalize_size: 256
        }
      };
      await invoke("save_config", { config });
      toast.success("Configurações salvas com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleValidarPedido = (pedido: Pedido) => {
    setSelectedPedido(pedido);
    setValidationOpen(true);
  };

  const selecionarPasta = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Selecionar Pasta de Produção",
      });
      if (selected) {
        setStoragePath(selected as string);
      }
    } catch (err: any) {
      console.error("Erro ao selecionar pasta:", err);
      setError("Erro ao abrir seletor de pastas: " + err.toString());
    }
  };

  const handleIndexStorage = async () => {
    if (!storagePath) return;
    try {
      setLoading(true);
      const result = await invoke<string>("index_storage", { storagePath });
      showInfoModal("Sincronização Concluída", result, "success");
    } catch (err) {
      console.error("Index error:", err);
      toast.error("Falha ao indexar: " + err);
    } finally {
      setLoading(false);
    }
  };

  const formatarData = (dataStr: string | undefined) => {
    if (!dataStr) return "N/A";
    try {
      const parts = dataStr.split("T")[0].split("-");
      if (parts.length === 3) {
        const [ano, mes, dia] = parts;
        return `${dia}/${mes}/${ano}`;
      }
      return dataStr;
    } catch {
      return dataStr;
    }
  };

  async function handleBuscar() {
    setLoading(true);
    setError(null);
    try {
      const response = await invoke<any>("buscar_pedidos", { url });
      const data = Array.isArray(response) ? response : response.data || [];
      setPedidos(data);
    } catch (err: any) {
      console.error("Erro ao buscar pedidos:", err);
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }

  const getStatusChip = (status: string | undefined) => {
    const s = status?.toLowerCase() || "";
    const isApproved = s.includes("aprovado") || s.includes("concluido") || s.includes("validado");
    const isPending = s.includes("pendente") || s.includes("atencao");

    return (
      <Chip
        label={status || "N/A"}
        size="small"
        sx={{
          bgcolor: isApproved ? "#F0FDF4" : isPending ? "#FFFBEB" : "#FEF2F2",
          color: isApproved ? "#166534" : isPending ? "#92400E" : "#991B1B",
          fontWeight: 600,
          borderRadius: "16px",
          px: 1
        }}
      />
    );
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", height: "100vh", bgcolor: "#F1F5F9" }}>
        {/* Sidebar */}
        <Box sx={{
          width: 260,
          bgcolor: "#111827",
          color: "white",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #1F2937"
        }}>
          <Box sx={{ p: 3, display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{
              width: 32,
              height: 32,
              bgcolor: "#3B82F6",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <ShieldIcon sx={{ fontSize: 20, color: "white" }} />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                ENGINE DE VALIDAÇÃO
              </Typography>
              <Typography variant="caption" sx={{ color: "#9CA3AF", fontSize: "0.65rem" }}>
                Controle técnico
              </Typography>
            </Box>
          </Box>

          <List sx={{ mt: 2, px: 2 }}>
            <ListItem disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                onClick={() => setCurrentTab("pedidos")}
                selected={currentTab === "pedidos"}
                sx={{
                  borderRadius: "8px",
                  py: 1.5,
                  '&.Mui-selected': {
                    bgcolor: "#1F2937",
                    '&:hover': { bgcolor: "#1F2937" }
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: currentTab === "pedidos" ? "#3B82F6" : "#9CA3AF" }}>
                  <AssignmentIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Pedidos"
                  primaryTypographyProps={{
                    sx: { fontWeight: 600, fontSize: "0.9rem", color: currentTab === "pedidos" ? "white" : "#9CA3AF" }
                  }}
                />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => setCurrentTab("configuracoes")}
                selected={currentTab === "configuracoes"}
                sx={{
                  borderRadius: "8px",
                  py: 1.5,
                  '&.Mui-selected': {
                    bgcolor: "#1F2937",
                    '&:hover': { bgcolor: "#1F2937" }
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: currentTab === "configuracoes" ? "#3B82F6" : "#9CA3AF" }}>
                  <SettingsIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Configurações"
                  primaryTypographyProps={{
                    sx: { fontWeight: 600, fontSize: "0.9rem", color: currentTab === "configuracoes" ? "white" : "#9CA3AF" }
                  }}
                />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>

        {/* Main Content */}
        <Box sx={{ flexGrow: 1, overflowY: "auto", p: 6 }}>
          {currentTab === "pedidos" ? (
            <Box>
              <Box sx={{ mb: 6, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: "#111827", fontSize: "1.875rem" }}>
                    Pedidos
                  </Typography>
                  <Typography variant="subtitle1" sx={{ color: "#6B7280", fontWeight: 500 }}>
                    Gerencie e valide as imagens dos pedidos de produção
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#9CA3AF", mt: 2, display: "block" }}>
                    {pedidos.length} pedidos encontrados
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  disableElevation
                  startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
                  onClick={handleBuscar}
                  disabled={loading}
                  sx={{
                    px: 3,
                    py: 1,
                    borderRadius: "8px",
                    textTransform: "none",
                    fontWeight: 700,
                    bgcolor: "#2563EB",
                    '&:hover': { bgcolor: '#1D4ED8' }
                  }}
                >
                  Sincronizar Pedidos
                </Button>
              </Box>

              {error && (
                <Alert severity="error" sx={{ mb: 4, borderRadius: "12px" }}>
                  {error}
                </Alert>
              )}

              <Box>
                {pedidos.map((pedido, index) => (
                  <Accordion
                    key={pedido.id || index}
                    elevation={0}
                    sx={{
                      mb: 2,
                      borderRadius: "12px !important",
                      border: "1px solid #E5E7EB",
                      '&:before': { display: 'none' },
                      transition: "all 0.2s ease",
                      cursor: "pointer",
                      '&:hover': {
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
                        borderColor: "#D1D5DB",
                        '& .validate-btn': { opacity: 1 }
                      }
                    }}
                    onClick={() => handleValidarPedido(pedido)}
                  >
                    <AccordionSummary
                      component="div"
                      expandIcon={<ExpandMoreIcon sx={{ color: "#9CA3AF" }} />}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Box sx={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", pr: 2 }}>
                        <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
                          <Typography variant="body2" sx={{ fontFamily: "monospace", color: "#6B7280", letterSpacing: 1 }}>
                            #{String(pedido.numero || pedido.id).padStart(10, '0')}
                          </Typography>
                          <Box>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: "#111827" }}>
                              {pedido.cliente || "Consumidor Final"}
                            </Typography>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                              <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: "#9CA3AF" }} />
                              <Typography variant="caption" sx={{ color: "#6B7280", fontWeight: 500 }}>
                                Entrega: {formatarData(pedido.data_entrega)}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                          <Button
                            size="small"
                            variant="outlined"
                            className="validate-btn"
                            sx={{
                              opacity: 0,
                              transition: "opacity 0.2s",
                              borderRadius: "6px",
                              textTransform: "none",
                              borderColor: "#E5E7EB",
                              color: "#4B5563"
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleValidarPedido(pedido);
                            }}
                          >
                            Validar
                          </Button>
                          {getStatusChip(pedido.status)}
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "#6B7280" }}>
                            <LayersIcon sx={{ fontSize: 16 }} />
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                              {pedido.items?.length || 0} itens
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0, px: 3, pb: 3 }}>
                      <Divider sx={{ mb: 3, borderColor: "#F3F4F6" }} />
                      <Grid container spacing={2}>
                        {pedido.items?.map((item, i) => (
                          <Grid size={{ xs: 12, md: 6 }} key={i}>
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 2,
                                display: "flex",
                                gap: 2,
                                alignItems: "center",
                                borderRadius: "10px",
                                bgcolor: "#F9FAFB",
                                borderColor: "#E5E7EB"
                              }}
                            >
                              <Box
                                component="img"
                                src={getImageUrl(item.imagem, url)}
                                sx={{
                                  width: 60,
                                  height: 60,
                                  objectFit: "cover",
                                  borderRadius: "8px",
                                  border: "1px solid #E5E7EB"
                                }}
                                alt={item.descricao || "Item"}
                                onError={(e: any) => { e.target.src = "https://placehold.co/80x80?text=Indisponível"; }}
                              />
                              <Box sx={{ flexGrow: 1 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#111827" }}>
                                  {item.tipo_producao || "Item Standard"}
                                </Typography>
                                <Typography variant="caption" sx={{ display: "block", color: "#6B7280" }}>
                                  {item.largura} x {item.altura}cm • {item.tecido}
                                </Typography>
                                <Button
                                  size="small"
                                  variant="text"
                                  startIcon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                                  sx={{
                                    mt: 1,
                                    fontSize: "0.7rem",
                                    fontWeight: 700,
                                    textTransform: "none",
                                    p: 0,
                                    minWidth: 0,
                                    color: "#2563EB"
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedReferenceUrl(getImageUrl(item.imagem, url));
                                    setAssistedValidationOpen(true);
                                  }}
                                >
                                  Validar Visualmente
                                </Button>
                              </Box>
                            </Paper>
                          </Grid>
                        ))}
                      </Grid>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>

              {pedidos.length === 0 && !loading && (
                <Box sx={{ textAlign: "center", py: 10 }}>
                  <Typography variant="body1" sx={{ color: "#9CA3AF", fontWeight: 500 }}>
                    Aguardando sincronização de dados...
                  </Typography>
                </Box>
              )}
            </Box>
          ) : (
            <Box maxWidth="md">
              <Box sx={{ mb: 6 }}>
                <Typography variant="h4" sx={{ fontWeight: 800, color: "#111827", fontSize: "1.875rem" }}>
                  Configurações
                </Typography>
                <Typography variant="subtitle1" sx={{ color: "#6B7280", fontWeight: 500 }}>
                  Configure as fontes de dados e parâmetros do sistema
                </Typography>
              </Box>

              <Paper elevation={0} sx={{ p: 4, borderRadius: "16px", border: "1px solid #E5E7EB", mb: 4 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, fontSize: "1rem" }}>
                  Fonte de Dados
                </Typography>
                <Typography variant="body2" sx={{ color: "#6B7280", mb: 4 }}>
                  Configure a URL da API e o caminho de armazenamento das imagens
                </Typography>

                <Grid container spacing={3}>
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "#374151", mb: 1, display: "block" }}>
                      URL da API de Pedidos
                    </Typography>
                    <TextField
                      fullWidth
                      variant="outlined"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#F9FAFB' } }}
                    />
                  </Grid>
                </Grid>
              </Paper>

              <Paper elevation={0} sx={{ p: 4, borderRadius: "16px", border: "1px solid #E5E7EB", mb: 6 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, fontSize: "1rem" }}>
                  Validação
                </Typography>
                <Typography variant="body2" sx={{ color: "#6B7280", mb: 4 }}>
                  Parâmetros de validação das imagens dos pedidos
                </Typography>

                <Grid container spacing={3}>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "#374151", mb: 1, display: "block" }}>
                      Resolução mínima (DPI)
                    </Typography>
                    <TextField
                      fullWidth
                      type="number"
                      variant="outlined"
                      value={minDpi}
                      onChange={(e) => setMinDpi(Number(e.target.value))}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#F9FAFB' } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "#374151", mb: 1, display: "block" }}>
                      Score de Aprovação (Verde %)
                    </Typography>
                    <TextField
                      fullWidth
                      type="number"
                      variant="outlined"
                      value={thresholdApproved}
                      onChange={(e) => setThresholdApproved(Number(e.target.value))}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#F9FAFB' } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "#374151", mb: 1, display: "block" }}>
                      Score de Atenção (Laranja %)
                    </Typography>
                    <TextField
                      fullWidth
                      type="number"
                      variant="outlined"
                      value={thresholdAttention}
                      onChange={(e) => setThresholdAttention(Number(e.target.value))}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#F9FAFB' } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "#374151", mb: 1, display: "block" }}>
                      Score mínimo para match (%)
                    </Typography>
                    <TextField
                      fullWidth
                      type="number"
                      variant="outlined"
                      value={minMatchScore}
                      onChange={(e) => setMinMatchScore(Number(e.target.value))}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#F9FAFB' } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "#374151", mb: 1, display: "block" }}>
                      Formatos aceitos (separados por vírgula)
                    </Typography>
                    <TextField
                      fullWidth
                      variant="outlined"
                      value={acceptedFormats}
                      onChange={(e) => setAcceptedFormats(e.target.value)}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#F9FAFB' } }}
                    />
                  </Grid>
                </Grid>
              </Paper>

              <Paper sx={{ p: 4, borderRadius: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.04)", mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 4, fontWeight: 700, color: "#1e293b" }}>
                  Fonte de Dados Local
                </Typography>
                <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                  <TextField
                    fullWidth
                    label="Caminho da Pasta de Produção"
                    value={storagePath}
                    onChange={(e) => setStoragePath(e.target.value)}
                    placeholder="/home/usuario/producao"
                    variant="outlined"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
                  />
                  <Button
                    variant="contained"
                    onClick={selecionarPasta}
                    sx={{ height: 56, borderRadius: "12px", px: 3, bgcolor: "#111827", "&:hover": { bgcolor: "#1f2937" } }}
                  >
                    Procurar
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={handleIndexStorage}
                    disabled={loading || !storagePath}
                    startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                    sx={{ height: 56, borderRadius: "12px", px: 3, borderColor: "#111827", color: "#111827" }}
                  >
                    Sincronizar Índice
                  </Button>
                </Box>
              </Paper>

              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 4 }}>
                <Button
                  variant="contained"
                  onClick={handleSaveConfig}
                  disabled={loading}
                  sx={{
                    bgcolor: "#1e293b",
                    px: 4,
                    py: 1.5,
                    borderRadius: "12px",
                    fontWeight: 700
                  }}
                >
                  {loading ? "Salvando..." : "Salvar Configurações"}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <AssistedValidationModal
        open={assistedValidationOpen}
        onClose={() => setAssistedValidationOpen(false)}
        referenceUrl={selectedReferenceUrl}
        storagePath={storagePath}
      />

      <ValidationModal
        open={validationOpen}
        onClose={() => setValidationOpen(false)}
        pedido={selectedPedido}
        storagePath={storagePath}
        apiUrl={url}
        thresholdApproved={thresholdApproved}
        thresholdAttention={thresholdAttention}
      />
      <InformationalDialog
        open={infoModal.open}
        onClose={() => setInfoModal(prev => ({ ...prev, open: false }))}
        title={infoModal.title}
        message={infoModal.message}
        type={infoModal.type}
      />
      <Toaster position="top-right" richColors />
    </ThemeProvider>
  );
}

function CreateAppTheme() {
  return createTheme({
    typography: {
      fontFamily: '"Inter", "system-ui", "-apple-system", sans-serif',
      h4: { fontWeight: 800 },
      subtitle1: { lineHeight: 1.5 }
    },
    palette: {
      primary: { main: "#2563EB" },
      background: { default: "#F1F5F9" }
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: "#F1F5F9",
            margin: 0
          }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' }
        }
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: "8px",
            fontSize: "0.95rem",
            '& fieldset': { borderColor: '#E5E7EB' },
            '&:hover fieldset': { borderColor: '#D1D5DB' },
            '&.Mui-focused fieldset': { borderColor: '#3B82F6', borderWidth: '1px' },
          }
        }
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: "8px"
          },
          contained: {
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' }
          }
        }
      }
    }
  });
}

export default App;
