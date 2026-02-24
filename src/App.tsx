import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

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
  items?: Item[];
}

function App() {
  const [url, setUrl] = useState("http://localhost:8000/pedidos/");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to get image URL
  const getImageUrl = (path: string | undefined) => {
    if (!path) return "";
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}${path}`;
    } catch {
      return path;
    }
  };

  const formatarData = (dataStr: string | undefined) => {
    if (!dataStr) return "N/A";
    try {
      // Tenta tratar formatos ISO (YYYY-MM-DD) ou similares
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
      console.log("Resposta Completa da API:", response);

      // Se a resposta vier em um campo 'data' ou algo assim, ajustamos aqui.
      // Assumindo que a API retorna um array diretamente conforme o OpenAPI.
      const data = Array.isArray(response) ? response : response.data || [];
      setPedidos(data);
    } catch (err: any) {
      console.error("Erro ao buscar pedidos:", err);
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Engine de Validação de Produção
      </Typography>

      <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: "flex", gap: 2 }}>
          <TextField
            fullWidth
            label="URL da API de Pedidos"
            variant="outlined"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleBuscar}
            disabled={loading}
            sx={{ px: 4 }}
          >
            Buscar
          </Button>
        </Box>
      </Paper>

      <Box sx={{ mt: 2 }}>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", my: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && pedidos.length > 0 && (
          <Box>
            {pedidos.map((pedido, index) => (
              <Accordion key={pedido.id || index} sx={{ mb: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", pr: 2 }}>
                    <Box sx={{ display: "flex", gap: 4, alignItems: "center", flexGrow: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: "bold", minWidth: 100 }}>
                        ID: {pedido.id || pedido.numero || "N/A"}
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: "bold", minWidth: 200 }}>
                        {pedido.cliente || "Sem Nome"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Entrega: {formatarData(pedido.data_entrega)}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: "bold", bgcolor: "primary.light", color: "white", px: 2, py: 0.5, borderRadius: 10 }}>
                      {pedido.items?.length || 0} itens
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Divider sx={{ mb: 2 }} />
                  <Typography variant="h6" gutterBottom sx={{ fontSize: "1rem", fontWeight: "bold" }}>
                    Itens do Pedido
                  </Typography>
                  <Grid container spacing={3}>
                    {pedido.items?.map((item, i) => (
                      <Grid size={{ xs: 12, md: 6 }} key={i}>
                        <Paper variant="outlined" sx={{ p: 2, display: "flex", gap: 2, alignItems: "center" }}>
                          <Box
                            component="img"
                            src={getImageUrl(item.imagem)}
                            sx={{ width: 100, height: 100, objectFit: "cover", borderRadius: 1, bgcolor: "grey.100" }}
                            alt={item.descricao || "Imagem do item"}
                            onError={(e: any) => { e.target.src = "https://placehold.co/100x100?text=Sem+Imagem"; }}
                          />
                          <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: "bold", color: "primary.main", textTransform: "uppercase" }}>
                              {item.tipo_producao || "Tipo N/A"}
                            </Typography>
                            <Divider sx={{ my: 0.5 }} />
                            <Typography variant="body2">
                              <strong>Medida:</strong> {item.largura} x {item.altura}
                            </Typography>
                            <Typography variant="body2">
                              <strong>Material:</strong> {item.tecido || "N/A"}
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
        )}

        {!loading && !error && pedidos.length === 0 && (
          <Typography variant="body1" align="center" color="text.secondary" sx={{ mt: 4 }}>
            Nenhum pedido para exibir. Informe a URL e clique em "Buscar".
          </Typography>
        )}
      </Box>
    </Container >
  );
}

export default App;
