import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Container,
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
  ThemeProvider,
  createTheme,
  CssBaseline,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from "@mui/material";
import { open } from "@tauri-apps/plugin-dialog";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import DoneAllIcon from "@mui/icons-material/DoneAll";

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
}

const STAGES_CONFIG = [
  { id: "localizing", label: "Localizando imagens", icon: <ImageSearchIcon fontSize="small" /> },
  { id: "embedding", label: "Gerando embeddings", icon: <AutoAwesomeIcon fontSize="small" /> },
  { id: "comparing", label: "Comparando similaridade", icon: <CompareArrowsIcon fontSize="small" /> },
  { id: "scoring", label: "Calculando score", icon: <AnalyticsIcon fontSize="small" /> },
  { id: "finalizing", label: "Finalizando validação", icon: <DoneAllIcon fontSize="small" /> },
];

function ValidationModal({ open, onClose, pedido, storagePath, apiUrl }: ValidationModalProps) {
  const [phases, setPhases] = useState<ValidationPhase[]>(
    STAGES_CONFIG.map(s => ({ ...s, status: "pending" }))
  );
  const [result, setResult] = useState<{ score: number; status: string } | null>(null);

  useEffect(() => {
    if (open && pedido) {
      setPhases(STAGES_CONFIG.map(s => ({ ...s, status: "pending" })));
      setResult(null);

      const startValidation = async () => {
        const unlisten = await listen<any>("validation-stage", (event) => {
          const { stage, status, data } = event.payload;
          setPhases(prev => prev.map(p =>
            p.id === stage ? { ...p, status } : p
          ));
          if (stage === "finalizing" && status === "success" && data) {
            setResult(data);
          }
        });

        try {
          // Use first item's image for validation
          const itemPath = pedido.items && pedido.items[0]?.imagem ? pedido.items[0].imagem : "";
          const fullImageUrl = getImageUrl(itemPath, apiUrl);

          await invoke("validate_order", {
            orderId: pedido.id,
            imageUrl: fullImageUrl,
            storagePath,
            threshold: 16 // Default threshold for perceptual hash (8x8 bits)
          });
        } catch (err) {
          console.error("Validation error:", err);
        }

        return () => {
          unlisten();
        };
      };

      const cleanupPromise = startValidation();
      return () => {
        cleanupPromise.then(unlisten => unlisten && unlisten());
      };
    }
  }, [open, pedido, storagePath]);

  const getStatusIcon = (status: StageStatus) => {
    switch (status) {
      case "running": return <CircularProgress size={20} thickness={5} />;
      case "success": return <CheckCircleIcon sx={{ color: "#166534" }} />;
      case "error": return <ErrorIcon sx={{ color: "#991B1B" }} />;
      default: return <RadioButtonUncheckedIcon sx={{ color: "#CBD5E1" }} />;
    }
  };

  return (
    <Dialog
      open={open}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: { borderRadius: "16px", p: 1 }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 3, pb: 1 }} component="div">
        <Typography variant="h6" component="div" sx={{ fontWeight: 800, color: "#0F172A", textTransform: "uppercase", fontSize: "1rem" }}>
          Validando Pedido #{pedido?.numero || pedido?.id}
        </Typography>
        <Typography variant="body2" sx={{ color: "#64748B", fontWeight: 500 }}>
          Processamento visual automatizado
        </Typography>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 16, top: 16, color: "#94A3B8" }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ px: 4, py: 3 }}>
          <Box sx={{ position: "relative" }}>
            {/* Progress line indicator */}
            <Box sx={{
              position: "absolute",
              left: 10,
              top: 10,
              bottom: 10,
              width: "2px",
              bgcolor: "#F1F5F9",
              zIndex: 0
            }} />

            {phases.map((phase) => (
              <Box key={phase.id} sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                mb: 3,
                position: "relative",
                zIndex: 1
              }}>
                <Box sx={{
                  width: 22,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "white"
                }}>
                  {getStatusIcon(phase.status)}
                </Box>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle2" sx={{
                    fontWeight: 700,
                    color: phase.status === "pending" ? "#94A3B8" : "#1E293B",
                    fontSize: "0.9rem"
                  }}>
                    {phase.label}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#94A3B8", display: "block", mt: -0.5 }}>
                    {phase.status === "running" ? "Em processamento..." : phase.status === "success" ? "Concluído" : ""}
                  </Typography>
                </Box>
                <Box sx={{ color: "#94A3B8", opacity: phase.status === "pending" ? 0.3 : 1 }}>
                  {phase.icon}
                </Box>
              </Box>
            ))}
          </Box>

          {result && (
            <FadeIn>
              <Paper elevation={0} sx={{
                mt: 4,
                p: 3,
                bgcolor: result.status === "APROVADO" ? "#F0FDF4" : "#FEF2F2",
                border: `1px solid ${result.status === "APROVADO" ? "#BBF7D0" : "#FECACA"}`,
                borderRadius: "12px",
                textAlign: "center"
              }}>
                <Typography variant="overline" sx={{ fontWeight: 700, color: result.status === "APROVADO" ? "#166534" : "#991B1B" }}>
                  Resultado da Validação
                </Typography>
                <Typography variant="h4" sx={{
                  fontWeight: 900,
                  color: result.status === "APROVADO" ? "#15803d" : "#b91c1c",
                  my: 1
                }}>
                  {result.status}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: "#475569" }}>
                  Score de Similaridade: {result.score.toFixed(1)}%
                </Typography>
              </Paper>
            </FadeIn>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// Simple helper for fade in effect
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
  const [url, setUrl] = useState("http://localhost:8000/pedidos/");
  const [storagePath, setStoragePath] = useState("");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation Modal State
  const [validationOpen, setValidationOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);

  const theme = useMemo(() => CreateAppTheme(), []);

  const handleValidarPedido = (pedido: Pedido) => {
    setSelectedPedido(pedido);
    setValidationOpen(true);
  };

  const selecionarPasta = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Selecionar Pasta de Armazenamento",
      });
      if (selected) {
        setStoragePath(selected as string);
      }
    } catch (err: any) {
      console.error("Erro ao selecionar pasta:", err);
      setError("Erro ao abrir seletor de pastas: " + err.toString());
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
    if (s.includes("aprovado") || s.includes("concluido")) {
      return <Chip label={status} size="small" sx={{ bgcolor: "#F0FDF4", color: "#166534", fontWeight: 600, borderRadius: "6px" }} />;
    }
    if (s.includes("pendente") || s.includes("atencao")) {
      return <Chip label={status} size="small" sx={{ bgcolor: "#FFFBEB", color: "#92400E", fontWeight: 600, borderRadius: "6px" }} />;
    }
    if (s.includes("erro") || s.includes("atrasado")) {
      return <Chip label={status} size="small" sx={{ bgcolor: "#FEF2F2", color: "#991B1B", fontWeight: 600, borderRadius: "6px" }} />;
    }
    return <Chip label={status || "N/A"} size="small" sx={{ bgcolor: "#F1F5F9", color: "#475569", fontWeight: 600, borderRadius: "6px" }} />;
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ py: 6 }}>
        {/* Header Section */}
        <Box sx={{ mb: 6 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontWeight: 800,
              letterSpacing: "0.05em",
              color: "#0F172A",
              fontSize: "1.75rem"
            }}
          >
            ENGINE DE VALIDAÇÃO
          </Typography>
          <Typography
            variant="subtitle1"
            sx={{ color: "#64748B", fontWeight: 500 }}
          >
            Controle técnico automatizado
          </Typography>
        </Box>

        {/* Configuration Card */}
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="overline"
            sx={{ fontWeight: 700, color: "#64748B", ml: 1, mb: 1, display: "block" }}
          >
            Fonte de Dados
          </Typography>
          <Paper
            elevation={0}
            sx={{
              p: 4,
              borderRadius: "12px",
              border: "1px solid #E2E8F0",
              boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"
            }}
          >
            <Grid container spacing={3}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="URL da API de Pedidos"
                  variant="outlined"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://localhost:8000/pedidos/"
                  sx={{ bgcolor: "white" }}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Pasta de Armazenamento"
                  variant="outlined"
                  value={storagePath}
                  sx={{ bgcolor: "white" }}
                  slotProps={{
                    input: {
                      readOnly: true,
                      endAdornment: (
                        <Button
                          variant="text"
                          onClick={selecionarPasta}
                          startIcon={<FolderOpenIcon />}
                          sx={{
                            ml: 1,
                            whiteSpace: "nowrap",
                            color: "#64748B",
                            fontWeight: 600,
                            '&:hover': { bgcolor: '#F8FAFC' }
                          }}
                        >
                          Alterar
                        </Button>
                      )
                    }
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12 }} sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="contained"
                  disableElevation
                  onClick={handleBuscar}
                  disabled={loading}
                  sx={{
                    px: 6,
                    py: 1.5,
                    borderRadius: "8px",
                    textTransform: "none",
                    fontWeight: 700,
                    fontSize: "1rem",
                    bgcolor: "#0F172A",
                    '&:hover': { bgcolor: '#1E293B' }
                  }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : "Sincronizar Pedidos"}
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Box>

        {/* Orders Section */}
        <Box sx={{ mt: 6 }}>
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 4, borderRadius: "12px", border: "1px solid #FEE2E2" }}
            >
              {error}
            </Alert>
          )}

          {!loading && !error && pedidos.length > 0 && (
            <Box>
              {pedidos.map((pedido, index) => (
                <Accordion
                  key={pedido.id || index}
                  elevation={0}
                  sx={{
                    mb: 2,
                    borderRadius: "12px !important",
                    border: "1px solid #E2E8F0",
                    '&:before': { display: 'none' },
                    transition: "all 0.2s ease",
                    cursor: "pointer",
                    '&:hover': {
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                      borderColor: "#CBD5E1",
                      '& .validate-btn': { opacity: 1 }
                    }
                  }}
                  onClick={() => handleValidarPedido(pedido)}
                >
                  <AccordionSummary
                    component="div"
                    expandIcon={<ExpandMoreIcon sx={{ color: "#94A3B8" }} />}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Box sx={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", pr: 2 }}>
                      <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: "monospace",
                            bgcolor: "#F8FAFC",
                            px: 1,
                            py: 0.5,
                            borderRadius: "4px",
                            color: "#475569",
                            fontWeight: 600
                          }}
                        >
                          #{pedido.numero || pedido.id}
                        </Typography>
                        <Box>
                          <Typography variant="body1" sx={{ fontWeight: 700, color: "#1E293B" }}>
                            {pedido.cliente || "Consumidor Final"}
                          </Typography>
                          <Typography variant="caption" sx={{ color: "#64748B", fontWeight: 500 }}>
                            Entrega: {formatarData(pedido.data_entrega)}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                        <Button
                          size="small"
                          variant="contained"
                          disableElevation
                          className="validate-btn"
                          sx={{
                            opacity: 0,
                            transition: "opacity 0.2s",
                            bgcolor: "#0F172A",
                            borderRadius: "6px",
                            textTransform: "none",
                            py: 0.5
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleValidarPedido(pedido);
                          }}
                        >
                          Validar
                        </Button>
                        {getStatusChip(pedido.status)}
                        <Chip
                          label={`${pedido.items?.length || 0} itens`}
                          variant="outlined"
                          size="small"
                          sx={{ border: "1px solid #E2E8F0", color: "#64748B", fontWeight: 600, borderRadius: "6px" }}
                        />
                      </Box>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0, px: 3, pb: 3 }}>
                    <Divider sx={{ mb: 3, borderColor: "#F1F5F9" }} />
                    <Typography variant="overline" sx={{ fontWeight: 700, color: "#94A3B8", mb: 2, display: "block" }}>
                      Detalhamento da Produção
                    </Typography>
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
                              bgcolor: "#F8FAFC",
                              borderColor: "#E2E8F0"
                            }}
                          >
                            <Box
                              component="img"
                              src={getImageUrl(item.imagem, url)}
                              sx={{
                                width: 80,
                                height: 80,
                                objectFit: "cover",
                                borderRadius: "8px",
                                border: "1px solid #E2E8F0",
                                bgcolor: "white"
                              }}
                              alt={item.descricao || "Item"}
                              onError={(e: any) => { e.target.src = "https://placehold.co/80x80?text=Indisponível"; }}
                            />
                            <Box sx={{ flexGrow: 1 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#0F172A", lineHeight: 1.2 }}>
                                {item.tipo_producao || "Produção Padrão"}
                              </Typography>
                              <Typography variant="caption" sx={{ display: "block", color: "#64748B", mt: 0.5, fontWeight: 500 }}>
                                {item.tecido || "Material não especificado"}
                              </Typography>
                              <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569" }}>
                                  {item.largura} x {item.altura}cm
                                </Typography>
                              </Box>
                            </Box>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}

          {!loading && !error && pedidos.length === 0 && (
            <Box sx={{ textAlign: "center", py: 10 }}>
              <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                Aguardando sincronização de dados...
              </Typography>
            </Box>
          )}
        </Box>
      </Container>
      <ValidationModal
        open={validationOpen}
        onClose={() => setValidationOpen(false)}
        pedido={selectedPedido}
        storagePath={storagePath}
        apiUrl={url}
      />
    </ThemeProvider>
  );
}

function CreateAppTheme() {
  return createTheme({
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h4: {
        fontFamily: '"Inter", sans-serif',
      },
      button: {
        textTransform: 'none',
      }
    },
    palette: {
      background: {
        default: "#F1F5F9",
      },
      primary: {
        main: "#0F172A",
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: "#F1F5F9",
          }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          }
        }
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              backgroundColor: 'white',
              '& fieldset': {
                borderColor: '#E2E8F0',
              },
              '&:hover fieldset': {
                borderColor: '#CBD5E1',
              },
            },
          }
        }
      }
    }
  });
}

export default App;
