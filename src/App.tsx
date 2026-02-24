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

interface Pedido {
  id?: number;
  numero?: string;
  cliente?: string;
  valor_total?: number;
  status?: string;
  data_entrada?: string;
  data_entrega?: string;
  vendedor?: string;
  designer?: string;
  itens?: any;
}

function App() {
  const [url, setUrl] = useState("http://localhost:8000/pedidos/");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                  <Box sx={{ display: "flex", width: "100%", justifyContent: "space-between", pr: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                      Pedido #{pedido.numero || pedido.id || "N/A"}
                    </Typography>
                    <Typography variant="body1">
                      {pedido.cliente || "Sem Nome"}
                    </Typography>
                    <Typography variant="body1" color="primary" sx={{ fontWeight: "bold" }}>
                      R$ {(pedido.valor_total || 0).toFixed(2)}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        bgcolor: "grey.200",
                        textTransform: "uppercase"
                      }}
                    >
                      {pedido.status || "N/A"}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Divider sx={{ mb: 2 }} />
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Vendedor</Typography>
                      <Typography variant="body2">{pedido.vendedor || "N/A"}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Designer</Typography>
                      <Typography variant="body2">{pedido.designer || "N/A"}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Data Entrada</Typography>
                      <Typography variant="body2">{pedido.data_entrada || "N/A"}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Data Entrega</Typography>
                      <Typography variant="body2">{pedido.data_entrega || "N/A"}</Typography>
                    </Grid>

                    <Grid size={{ xs: 12 }}>
                      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: "bold" }}>
                        Itens do Pedido
                      </Typography>
                      <Box sx={{ bgcolor: "grey.50", p: 2, borderRadius: 1 }}>
                        <pre style={{ margin: 0, fontSize: "0.8rem", overflowX: "auto" }}>
                          {JSON.stringify(pedido.itens, null, 2)}
                        </pre>
                      </Box>
                    </Grid>

                    <Grid size={{ xs: 12 }}>
                      <Typography variant="caption" color="text.secondary">Dados Brutos (Debug)</Typography>
                      <Box sx={{ bgcolor: "grey.100", p: 1, borderRadius: 1, fontSize: "0.7rem", color: "text.secondary" }}>
                        ID: {pedido.id} | Número: {pedido.numero}
                      </Box>
                    </Grid>
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
    </Container>
  );
}

export default App;
