# ArtGuard

App desktop (Tauri + React) que automatiza a validação de imagens da **pasta de impressão**: compara imagens dos pedidos (vindas da API FastAPI) com as imagens indexadas nessa pasta.

## Ideia do projeto

- **Imagens A (a comparar):** vêm da **API Python FastAPI** (pedidos com nome, medida, material e URLs das imagens). Este projeto **não implementa rotas HTTP**; só consome essa API.
- **Imagens B (indexadas):** são as da **pasta usada para impressão**. O ArtGuard indexa essa pasta e compara as imagens do pedido com esse índice.

Objetivo: automatizar processos com as imagens da pasta de impressão, validando se o que está no pedido bate com o que temos na pasta.

## Fluxo

1. **Indexação (pasta de impressão)**  
   O usuário escolhe a pasta → o sistema varre arquivos (TIFF, PNG, JPG, etc.), calcula SHA256 + pHash, grava `index.json` nessa pasta (= imagens B).

2. **Pedidos**  
   O frontend chama a API FastAPI (ex.: `http://localhost:8000/pedidos/`) e obtém pedidos com itens (nome, medida, material, **URLs das imagens**). As imagens dos pedidos são obtidas por **URL** (o backend baixa com `reqwest`); não há upload nem rota HTTP neste app.

3. **Comparação**  
   Para um pedido selecionado, o frontend envia as URLs das imagens ao backend; o backend baixa cada uma, gera hashes e compara com o índice da pasta (`validate_order`). Também é possível comparar uma única imagem com uma do índice (`compare_single_image`).

## Recursos adicionais (imagem)

- **Medida e resolução (DPI):** Na indexação, o DPI é lido dos metadados (EXIF para JPEG/TIFF, pHYs para PNG) e armazenado no índice. Na validação do pedido, cada imagem é verificada contra `min_dpi` (configuração) e, quando o pedido informa largura/altura em cm por item, a medida é convertida para pixels (cm × DPI / 2,54) e validada. O resultado inclui `dpi_x`, `dpi_y`, `dpi_ok` e `measure_ok` por item.
- **Recorte em partes:** Comando `crop_image_into_parts(sourcePath, outputDir, regions, outputBasename)` — `regions` é uma lista de `{ x, y, width, height }` em pixels; cada região é salva como `outputBasename_0.ext`, `outputBasename_1.ext`, etc.
- **Texto na região:** Comando `draw_text_on_image(sourcePath, outputPath, text, x, y, width, height, fontPath, fontSize)` — desenha o texto com canto superior esquerdo em (x, y), usando a fonte TTF em `fontPath` e o tamanho indicado; salva em `outputPath`.

## Stack

- **Frontend:** React 19 + Vite 7 + TypeScript  
- **Backend:** Rust (Tauri 2)  
- **Matching:** SHA256 (cópia exata) + pHash 8×8 (similaridade perceptual), com limiares configuráveis (approved / attention / divergent).

## Desenvolvimento

### Pré-requisitos

- [Node.js](https://nodejs.org/)
- [Rust](https://rustup.rs/)
- [Tauri](https://tauri.app/) (CLI e deps da sua plataforma)

### Comandos

```bash
# Instalar dependências
npm install

# Desenvolvimento
npm run tauri dev

# Build
npm run tauri build
```

### IDE

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
