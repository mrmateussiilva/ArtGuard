# API dos comandos Tauri (ArtGuard)

Comandos expostos pelo backend Rust e invocados pelo frontend via `invoke()`.

---

## Pedidos e API externa

### `buscar_pedidos`

Obtém a lista de pedidos da API FastAPI.

| Parâmetro | Tipo     | Descrição                    |
|----------|----------|------------------------------|
| `url`    | `string` | URL base da API (ex.: `http://localhost:8000/pedidos/`) |

**Retorno:** `Promise<Pedido[]>` — array de pedidos (cada um com `id`, `numero`, `cliente`, `items`, etc.).

**Exemplo (frontend):**
```ts
const pedidos = await invoke<Pedido[]>("buscar_pedidos", { url: "http://localhost:8000/pedidos/" });
```

---

## Índice e armazenamento

### `index_storage`

Varre a pasta de impressão, gera hashes (SHA256 + pHash) e DPI por imagem e grava `index.json` na pasta.

| Parâmetro       | Tipo     | Descrição                |
|----------------|----------|--------------------------|
| `storage_path` | `string` | Caminho absoluto da pasta |

**Retorno:** `Promise<string>` — mensagem de sucesso (ex.: quantidade de arquivos indexados).

**Exemplo:**
```ts
await invoke("index_storage", { storagePath: "/caminho/pasta/impressao" });
```

### `get_index_images`

Retorna a lista de imagens do índice (metadados) para uma pasta já indexada.

| Parâmetro       | Tipo     | Descrição                |
|----------------|----------|--------------------------|
| `storage_path` | `string` | Caminho da pasta que contém `index.json` |

**Retorno:** `Promise<ImageMetadata[]>` — cada item tem `name`, `path`, `phash`, `sha256`, `width`, `height`, etc.

---

## Validação de pedido

### `validate_order`

Valida todas as imagens de um pedido contra o índice: baixa cada imagem por URL, gera hashes, compara com o índice e verifica DPI/medida. Os itens são processados em paralelo. O resultado é enviado via evento `validation-stage` (payload com `stage`, `status`, `data`).

| Parâmetro              | Tipo                    | Descrição |
|------------------------|-------------------------|-----------|
| `order_id`             | `number`                | ID do pedido (para log) |
| `image_urls`           | `string[]`              | URLs das imagens do pedido (na ordem dos itens) |
| `storage_path`         | `string`                | Pasta do índice |
| `threshold_approved`   | `number`                | Score mínimo para status "approved" (ex.: 90) |
| `threshold_attention`  | `number`                | Score mínimo para "attention" (ex.: 70) |
| `item_measures_cm`     | `[number, number][]` \| `null` | Opcional. Para cada item, `[largura_cm, altura_cm]` para validar medida em pixels |

**Retorno:** `Promise<void>`. Em caso de sucesso, o resultado agregado é enviado no evento `validation-stage` com `stage: "finalizing"`, `status: "success"` e `data` contendo:

```json
{
  "status": "approved" | "attention" | "divergent",
  "score": 123.45,
  "total_items": 5,
  "items": [
    {
      "url": "https://...",
      "status": "approved",
      "score": 95.2,
      "matched_file": "arquivo.png" | null,
      "width": 1000 | null,
      "height": 800 | null,
      "dpi_x": 300 | null,
      "dpi_y": 300 | null,
      "dpi_ok": true,
      "measure_ok": true | false | null
    }
  ]
}
```

**Exemplo:**
```ts
await invoke("validate_order", {
  orderId: pedido.id,
  imageUrls: urls,
  storagePath,
  thresholdApproved: 90,
  thresholdAttention: 70,
  itemMeasuresCm: medidasOuNull
});
// Escutar: listen("validation-stage", (e) => { ... e.payload.data ... })
```

---

## Validação visual assistida (uma imagem)

### `compare_single_image`

Compara uma imagem de referência (URL) com uma imagem do índice (metadado). Usado no modal de validação visual assistida.

| Parâmetro        | Tipo              | Descrição |
|------------------|-------------------|-----------|
| `reference_url`  | `string`          | URL da imagem de referência |
| `indexed_image`  | `ImageMetadata`   | Objeto do índice (name, path, phash, sha256, width, height) |
| `threshold`      | `number` (opcional) | Score mínimo para aprovar (padrão 85) |

**Retorno:** `Promise<ComparisonResult>` — `{ score: number, status: string, matched_file: string }`.

### `read_image_as_base64`

Lê um arquivo de imagem do disco e retorna em Data URL (base64) para exibição no frontend.

| Parâmetro | Tipo     | Descrição        |
|----------|----------|------------------|
| `path`  | `string` | Caminho absoluto do arquivo |

**Retorno:** `Promise<string>` — string no formato `data:image/jpeg;base64,...` (ou png/webp conforme extensão).

---

## Configuração

### `get_config`

Lê a configuração do app no diretório de config da aplicação (ex.: `artguard_config.json`).

**Retorno:** `Promise<AppConfig>`:

```ts
{
  api_url: string;
  storage_path: string;
  default_font_path?: string | null;  // último caminho da fonte .ttf usado em "Escrever nome na imagem"
  validation: {
    threshold_approved: number;
    threshold_attention: number;
    min_match_score: number;
    min_dpi: number;
    accepted_formats: string[];
    hash_algorithm: string;
    hash_size: number;
    normalize_size: number;
  };
}
```

### `save_config`

Salva a configuração no disco (mesmo formato retornado por `get_config`).

| Parâmetro | Tipo         | Descrição     |
|----------|--------------|---------------|
| `config` | `AppConfig`  | Objeto completo de configuração |

**Retorno:** `Promise<void>`.

**Exemplo:**
```ts
const config = await invoke("get_config");
await invoke("save_config", { config: { ...config, storage_path: novoPath } });
```

---

## Operações em imagens

### `crop_image_into_parts`

Recorta a imagem em várias regiões retangulares e salva cada uma como arquivo separado.

| Parâmetro         | Tipo     | Descrição |
|-------------------|----------|-----------|
| `source_path`     | `string` | Caminho da imagem de origem |
| `output_dir`      | `string` | Pasta onde salvar as partes |
| `regions`         | `Array<{ x, y, width, height }>` | Regiões em pixels |
| `output_basename` | `string` | Nome base dos arquivos (ex.: `parte_0.png`, `parte_1.png`) |

**Retorno:** `Promise<string[]>` — lista de caminhos dos arquivos gerados.

**Exemplo:**
```ts
const paths = await invoke<string[]>("crop_image_into_parts", {
  sourcePath: "/pasta/imagem.png",
  outputDir: "/pasta/saida",
  regions: [{ x: 0, y: 0, width: 500, height: 400 }, { x: 500, y: 0, width: 500, height: 400 }],
  outputBasename: "parte"
});
```

### `draw_text_on_image`

Desenha texto em uma posição (x, y) na imagem usando uma fonte TTF e salva o resultado em um novo arquivo.

| Parâmetro      | Tipo     | Descrição |
|----------------|----------|-----------|
| `source_path`  | `string` | Imagem de origem |
| `output_path`  | `string` | Caminho do arquivo de saída |
| `text`        | `string` | Texto a desenhar |
| `x`           | `number` | Posição X (pixels) |
| `y`           | `number` | Posição Y (pixels) |
| `width`       | `number` | Largura da região (não usado na lógica atual) |
| `height`      | `number` | Altura da região (não usada na lógica atual) |
| `font_path`   | `string` | Caminho do arquivo .ttf (ou .otf) |
| `font_size`   | `number` | Tamanho da fonte em pixels |

**Retorno:** `Promise<void>`.

**Exemplo:**
```ts
await invoke("draw_text_on_image", {
  sourcePath: "/pasta/imagem.png",
  outputPath: "/pasta/imagem_com_nome.png",
  text: "Nome do cliente",
  x: 10,
  y: 10,
  width: 200,
  height: 50,
  fontPath: "/usr/share/fonts/TTF/DejaVuSans.ttf",
  fontSize: 24
});
```

---

## Eventos emitidos pelo backend

| Evento             | Quando | Payload |
|--------------------|--------|---------|
| `validation-stage` | Durante `validate_order` e `compare_single_image` | `{ stage: string, status: string, data?: object }`. Em `stage === "finalizing"` e `status === "success"`, `data` contém o resultado agregado da validação (status, score, items). |

Stages típicos: `loading_index`, `downloading`, `normalizing`, `hashing`, `matching`, `scoring`, `finalizing`.
