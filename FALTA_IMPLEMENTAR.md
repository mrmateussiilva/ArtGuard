# O que ainda falta implementar

Itens planejados ou mencionados que ainda não foram implementados no ArtGuard.

---

## 1. Verificação de qualidade da imagem

- **Objetivo:** Avaliar nitidez/qualidade (ex.: variância do Laplaciano) e retornar um score ou flag (ex.: qualidade OK / baixa).
- **Onde:** Novo comando ou campo no resultado da validação; possível uso de `imageproc` para convolução.
- **Config:** Limiar de qualidade (0–100) na configuração para marcar item como atenção/rejeitado.

---

## 2. Verificação de perfil de cores (ICC) por tipo de máquina

- **Objetivo:** Ler perfil ICC embutido no arquivo (TIFF/JPEG/PNG) e validar se é um dos perfis aceitos para cada “tipo de máquina”.
- **Onde:** Módulo de leitura de metadados (ex.: extensão do `utils/dpi.rs` ou novo `utils/icc.rs`); validação no fluxo de validação do pedido.
- **Config:** Lista de tipos de máquina e, para cada um, lista de perfis aceitos (nome/ID ou caminho para .icc).
- **Crates sugeridas:** `lcms2` (bindings Little CMS) ou `colorbox` para ler/comparar perfis.

---

## 3. Melhorias para arquivos grandes

- **Objetivo:** Reduzir pico de memória ao abrir/processar imagens muito grandes.
- **Possíveis mudanças:**
  - Uso de **memory-mapped I/O** (`memmap2`) para leitura de arquivos grandes em disco.
  - Decode **por região ou em resolução reduzida** quando o formato permitir (ex.: TIFF por tiles com crate `tiff`).
  - **Reuso de buffers** ou pipeline que não mantenha cópia full-res na memória ao mesmo tempo.

---

## 4. Validação em paralelo dos itens do pedido

- **Objetivo:** Processar várias imagens do pedido em paralelo (download + hash + match) em vez de sequencial, para reduzir tempo total.
- **Onde:** `validate_order` em `commands/validate_order.rs` (ex.: `futures::stream::buffer_unordered` ou várias tarefas com `tokio::spawn` e limite de concorrência).

---

## 5. Expor “Verificações” na comparação unitária (ValidationModal)

- **Objetivo:** Na tela de comparação uma-a-uma (referência vs. imagem do índice), ter o mesmo botão “Verificações” / “Aplicar verificações” (medida, DPI, recorte, texto) quando houver match.
- **Onde:** `src/components/ValidationModal.tsx` — ao exibir resultado com match, permitir abrir o mesmo fluxo de verificações (reutilizando `VerificationActionsDialog` ou equivalente).

---

## 6. UI: exibir DPI e medida no card do item

- **Objetivo:** Mostrar de forma explícita no card de cada item (ex.: na listagem de pedidos ou no resumo do item) os valores de DPI e se medida está OK, além do chip atual.
- **Onde:** Onde o resultado por item é exibido (já temos os dados em `result.items`).

---

## 7. Persistência do caminho da fonte padrão

- **Objetivo:** Guardar na config (ou preferências) o último caminho de fonte .ttf usado em “Escrever nome na região”, para não precisar escolher toda vez.
- **Onde:** Config do app + campo no dialog de texto.

---

## 8. Documentação da API de comandos (frontend)

- **Objetivo:** Documentar no README ou em `docs/` os comandos Tauri usados pelo frontend (`validate_order`, `crop_image_into_parts`, `draw_text_on_image`, etc.) com parâmetros e retornos.
- **Onde:** README ou `docs/API.md`.

---

*Última atualização: conforme implementação até o commit atual.*
