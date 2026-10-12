# 🚀 Guia de Implantação: Nota 11 no GitHub Pages com Supabase (100% Gratuito)

Este guia explica passo a passo como colocar o **Nota 11** online no **GitHub Pages** com banco de dados e login na nuvem via **Supabase** sem custo nenhum.

---

## 🛠️ Passo 1: Criar o Banco e Autenticação no Supabase (Grátis)

1. Acesse **[supabase.com](https://supabase.com)** e clique em **"Start your project"** (ou faça login com sua conta do GitHub).
2. Clique em **"New Project"**.
3. Preencha os campos:
   - **Name:** `nota11` (ou o nome que preferir).
   - **Database Password:** Crie uma senha forte e guarde-a.
   - **Region:** Escolha `São Paulo (South America)` ou `East US` (as mais rápidas para o Brasil).
   - **Pricing Plan:** Escolha o plano **Free ($0/month)**.
4. Clique em **"Create new project"** e aguarde cerca de 1 minuto para o banco ser provisionado.

---

## 📄 Passo 2: Criar a Tabela no Banco (1 Clique)

1. No painel do seu projeto no Supabase, no menu lateral esquerdo, clique no ícone **"SQL Editor"** (ícone de terminal `>_`).
2. Clique em **"New Query"**.
3. Abra o arquivo [`supabase_schema.sql`](./supabase_schema.sql) deste projeto, copie todo o conteúdo e cole no editor do Supabase.
4. Clique no botão verde **"Run"** (ou pressione `Ctrl + Enter`).
5. Você verá a mensagem **"Success. No rows returned"**. A tabela `user_data` foi criada com segurança *Row Level Security (RLS)* ativa!

---

## 🔑 Passo 3: Obter a URL e a Chave Pública (Anon Key)

1. No menu lateral do Supabase, clique na engrenagem **"Project Settings"** no canto inferior esquerdo.
2. Clique em **"API"**.
3. Você verá dois valores:
   - **Project URL:** Exemplo `https://xyzabc12345.supabase.co`
   - **Project API keys -> anon (public):** Uma chave longa iniciando com `eyJ...`
4. Copie esses dois valores. Você poderá inseri-los diretamente no botão **"Nuvem" -> "Configurações"** dentro do próprio Nota 11!

*(Dica: Se preferir que o seu site já abra configurado de fábrica sem precisar digitar essas chaves no navegador, basta colar a URL e a Anon Key no arquivo `js/services/supabaseService.js` no campo `DEFAULT_SUPABASE_CONFIG`).*

---

## 🌐 Passo 4: Publicar no GitHub Pages (Custo Zero)

1. Crie um repositório no seu GitHub (ex: `nota11` ou `nota11-tracker`).
2. Envie os arquivos do projeto para o repositório (`git add .`, `git commit -m "Nota 11 Web"`, `git push origin main`).
3. No seu repositório no GitHub, clique na aba **"Settings"** (Configurações).
4. No menu lateral esquerdo, clique em **"Pages"**.
5. Em **"Build and deployment" -> "Source"**, selecione:
   - **Branch:** `main`
   - **Folder:** `/ (root)`
6. Clique em **"Save"**.
7. Aguarde cerca de 1 a 2 minutos. O GitHub exibirá o link público do seu site:
   `https://seu-usuario.github.io/nota11/`

---

## 🔐 Como Funciona o Sistema de Login:

- **Continuar sem Login (Padrão):** O usuário pode usar o app normalmente sem criar conta. Os dados são salvos no cache do navegador (`localStorage`) instantaneamente.
- **Entrar / Criar Conta:** Ao clicar no botão de nuvem no topo, basta informar **E-mail e Senha**. Todos os jogos cadastrados passam a sincronizar no Supabase.
- **Se você já tinha jogos antes de logar:** O aplicativo detecta e sincroniza automaticamente a biblioteca local para a sua conta recém-conectada.
- **Recuperação de Senha:** Clique em *"Esqueci minha senha"*, digite o e-mail e receba o link oficial do Supabase para redefinir a senha gratuitamente.
- **Alterar Senha:** Quando logado, o painel da conta permite alterar a senha a qualquer momento.
