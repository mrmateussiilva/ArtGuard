import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Alert,
  Paper,
  Divider,
} from "@mui/material";

interface Pedido {
  id: number;
  cliente: String;
  valor: number;
  status: String;
}

function App() {
  const [url, setUrl] = useState("https://run.mocky.io/v3/8f747683-9b88-4696-b695-17793540248c"); // URL de exemplo
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuscar() {
    setLoading(true);
    setError(null);
    try {
      const response = await invoke<Pedido[]>("buscar_pedidos", { url });
      setPedidos(response);
    } catch (err: any) {
      console.error(err);
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
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
          <Paper elevation={2}>
            <List>
              {pedidos.map((pedido, index) => (
                <Box key={pedido.id}>
                  <ListItem>
                    <ListItemText
                      primary={`Pedido #${pedido.id} - ${pedido.cliente}`}
                      secondary={`Valor: R$ ${pedido.valor.toFixed(2)} | Status: ${pedido.status}`}
                    />
                  </ListItem>
                  {index < pedidos.length - 1 && <Divider />}
                </Box>
              ))}
            </List>
          </Paper>
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
