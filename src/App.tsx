import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  ThemeProvider,
  createTheme,
  CssBaseline,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
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
import AssignmentIcon from "@mui/icons-material/Assignment";
import SettingsIcon from "@mui/icons-material/Settings";
import ShieldIcon from "@mui/icons-material/Shield";
import SaveIcon from "@mui/icons-material/Save";
import LayersIcon from "@mui/icons-material/Layers";

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
          const itemPath = pedido.items && pedido.items[0]?.imagem ? pedido.items[0].imagem : "";
          const fullImageUrl = getImageUrl(itemPath, apiUrl);

          await invoke("validate_order", {
            orderId: pedido.id,
            imageUrl: fullImageUrl,
            storagePath,
            threshold: 16
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
  }, [open, pedido, storagePath, apiUrl]);

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
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "#374151", mb: 1, display: "block" }}>
                      Pasta de Armazenamento
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <TextField
                        fullWidth
                        variant="outlined"
                        value={storagePath}
                        slotProps={{ input: { readOnly: true } }}
                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#F9FAFB' } }}
                      />
                      <IconButton
                        onClick={selecionarPasta}
                        sx={{
                          bgcolor: "#F3F4F6",
                          borderRadius: "8px",
                          border: "1px solid #E5E7EB"
                        }}
                      >
                        <FolderOpenIcon fontSize="small" />
                      </IconButton>
                    </Box>
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
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "#374151", mb: 1, display: "block" }}>
                      Resolução mínima (DPI)
                    </Typography>
                    <TextField
                      fullWidth
                      type="number"
                      variant="outlined"
                      defaultValue={150}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#F9FAFB' } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "#374151", mb: 1, display: "block" }}>
                      Formatos aceitos
                    </Typography>
                    <TextField
                      fullWidth
                      variant="outlined"
                      defaultValue="PNG, JPG, TIFF, PDF"
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#F9FAFB' } }}
                    />
                  </Grid>
                </Grid>
              </Paper>

              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="contained"
                  disableElevation
                  startIcon={<SaveIcon />}
                  sx={{
                    px: 4,
                    py: 1.25,
                    borderRadius: "8px",
                    textTransform: "none",
                    fontWeight: 700,
                    bgcolor: "#2563EB",
                    '&:hover': { bgcolor: '#1D4ED8' }
                  }}
                >
                  Salvar Configurações
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

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
