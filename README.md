# 🎮 NOTA 11 - Game Tracker & Masterpieces

Aplicação web moderna, responsiva, rápida e elegante para rastreamento de jogos em andamento (**"Jogando Agora"**) e jogos finalizados (**"Zerados"**), com sistema de **Baixador Automático de Capas pelo ScreenScraper**, atalhos para **Google Imagens**, catálogo completo de consoles da **1ª à 9ª geração e PC**, formato de **Tempo de Jogo em `xx:xx:xx` (HH:MM:SS)**, 4 **Condições de Zerar** com **Borda Dourada** para jogos **Platinados/Perfeitos**, e o sistema exclusivo de avaliação de **1 a 11** (onde a nota 11 representa a **Obra-Prima / Masterpiece da Minha Vida**).

---

## 📋 Schema Oficial do Sistema & Importação/Exportação CSV (8 Colunas)

Toda a estrutura de dados, exportação e importação CSV obedece rigorosamente às 8 colunas abaixo:

| # | Coluna CSV | Campo no Sistema | Descrição / Valores |
|---|---|---|---|
| 1 | **Jogos Zerados** | `title` | Nome/título do jogo |
| 2 | **Plataforma** | `platform` | Consoles da 1ª geração até a 9ª geração atual, Portáteis e PC |
| 3 | **Gênero** | `genre` | Gênero ou múltiplos gêneros (texto livre) |
| 4 | **Data** | `completionDate` | Data de finalização do jogo (`YYYY-MM-DD` ou `DD/MM/YYYY`) |
| 5 | **Ano** | `completionYear` | Ano em que foi zerado (e não ano de lançamento) |
| 6 | **Tempo de Jogo** | `playtime` | Formato padronizado `xx:xx:xx` (ex: `135:00:00`, `25:30:00`) |
| 7 | **Nota** | `rating` | Escala de **1 a 11** (11 = Masterpiece Obra-Prima) |
| 8 | **Condição de Zerar** | `completionCondition` | `Platinado/Perfeitos`, `Condição Padrão`, `Condição Reduzida`, `Jogo sem fim` |

### Exemplo de Cabeçalho e Linhas CSV:
```csv
Jogos Zerados,Plataforma,Gênero,Data,Ano,Tempo de Jogo,Nota,Condição de Zerar
"Elden Ring","PC","RPG / Souls-like",2024-02-18,2024,"135:00:00",11,"Platinado/Perfeitos"
"The Legend of Zelda: Tears of the Kingdom","Nintendo Switch","Ação / Aventura",2023-11-20,2023,"110:30:00",11,"Platinado/Perfeitos"
"Cyberpunk 2077: Phantom Liberty","PC","RPG / Ficção Científica",2024-03-02,2024,"75:45:00",9,"Condição Padrão"
"Resident Evil 3 (1999)","PlayStation (PS1)","Survival Horror",2024-01-20,2024,"04:15:00",9,"Condição Reduzida"
"World of Warcraft","PC","MMORPG",2023-12-31,2023,"520:00:00",9,"Jogo sem fim"
```

---

## 🚀 Como Executar

O projeto está unificado e pode ser executado de duas formas práticas:

### 🖥️ Opção 1: Aplicativo Desktop Nativo para Windows (.NET 9 + WebView2)
- Dê um duplo clique em **`1_Abrir_Desktop_Windows.bat`** (ou `executar.bat`).
- Uma janela nativa de alta performance e visual moderno será iniciada com o servidor embutido em C#.
- Para gerar uma versão standalone portátil pronta para distribuição (sem precisar de nada instalado), execute **`gerar_release.bat`**.

### 🌐 Opção 2: Navegador Web (Local)
- Dê um duplo clique em **`2_Abrir_No_Navegador.bat`** (ou `iniciar_servidor.bat`).
- O servidor local iniciará e abrirá automaticamente no seu navegador padrão (`http://localhost:3000`).
- Você também pode simplesmente abrir o arquivo `index.html` diretamente em qualquer navegador.

---

## 🌟 Funcionalidades Principais

### 1. 💾 Salvamento Automático de Rascunho (Adicionar Jogo)
- Qualquer dado digitado no formulário de adição de jogo é salvo em tempo real.
- Caso a janela seja fechada acidentalmente, o rascunho é recuperado instantaneamente ao reabrir, com opção de limpar ou iniciar em branco.

### 2. 💻 Subcategorias Inteligentes para PC
- Ao selecionar a plataforma **PC**, você pode escolher facilmente entre:
  - **PC - Computador** (Desktop / Notebook tradicional)
  - **PC - Steam Deck** (Console portátil da Valve)
  - **PC - Rog Ally** (Console portátil Asus / Windows)
- Todos os consoles de mesa e portáteis (1ª à 9ª geração) continuam disponíveis e organizados.

### 3. 🖼️ Baixador de Capas Automático (ScreenScraper.fr) & Google Imagens
- **Baixador em Lote (ScreenScraper)**: Escaneie toda a sua biblioteca de jogos para obter capas em alta definição oficiais direto da base do ScreenScraper.fr.
- **Opções de Escaneamento**:
  - *Apenas Jogos Sem Capa*: Baixa apenas para títulos que ainda usam a capa placeholder gerada.
  - *Substituir Todas as Capas*: Atualiza todas as capas da lista.
- **Busca Individual**: Ao cadastrar ou editar um jogo, utilize o botão *ScreenScraper* para ver candidatos oficiais ou o botão *Google Imagens* para pesquisar e colar links diretos.
- **Gerador de Capas SVG**: Gera automaticamente capas estilizadas dinâmicas caso nenhuma imagem seja informada.

### 4. 🏆 4 Condições de Zerar & Borda Dourada Radiante
- **Platinado/Perfeitos**: Ativa a moldura dourada metálica com brilho sutil (`card-platinum`) e o selo dourado de Platina.
- **Condição Padrão**: Finalização tradicional da campanha / créditos.
- **Condição Reduzida**: Any% ou campanha reduzida/rush.
- **Jogo sem fim**: MMOs, multiplayer competitivo e jogos contínuos sem final definitivo.

### 5. ⏱️ Tempo de Jogo no Formato `xx:xx:xx`
- Formato padronizado: `xx:xx:xx` (Horas:Minutos:Segundos, ex: `135:00:00`, `25:30:00`, `04:15:00`).
- Compatível com ordenação, filtros e somatório total formatado de horas jogadas no cabeçalho.

### 6. ⭐ Sistema de Avaliação Especial (Notas 1 a 11)
- **Notas de 1 a 10**: Sistema tradicional de pontuação com badges coloridos por categoria.
- **Nota 11 ("Obra-Prima / Masterpiece da Minha Vida")**: Renderiza uma **estrela dourada pulsante** com brilho metálico, gradiente holográfico e badge especial de conquista máxima.

---

## 📁 Estrutura Unificada do Projeto

```
Nota 11/
├── 1_Abrir_Desktop_Windows.bat       # Inicia o app Desktop nativo Windows (.NET 9)
├── 2_Abrir_No_Navegador.bat          # Inicia o servidor e abre no navegador
├── compilar.bat                      # Compila a versão Desktop (.NET)
├── gerar_release.bat                 # Gera pacote e ZIP portátil standalone
│
├── App.xaml / App.xaml.cs            # Configurações do app WPF Windows
├── MainWindow.xaml / MainWindow.xaml.cs # Janela nativa com WebView2 e servidor embutido
├── Nota11.csproj                     # Arquivo de projeto .NET 9 Desktop
├── Services/                         # Servidor HTTP local C# integrado
│
├── index.html                        # Interface do app (Vue 3, Tailwind, Lucide Icons)
├── css/
│   └── styles.css                    # Estilos visuais, tema gamer dark, bordas douradas
├── js/
│   ├── app.js                        # Lógica reativa Vue 3, filtros e modais
│   └── services/
│       ├── apiService.js             # Capas dinâmicas e atalhos Google
│       ├── screenScraperService.js   # Integração com API ScreenScraper.fr
│       └── storageService.js         # LocalStorage, Rascunhos, CSV e Backup JSON
├── Release/                          # Pacotes de distribuição gerados
└── README.md                         # Documentação do projeto
```
