-- ============================================================================
-- NOTA 11 GAME TRACKER - SUPABASE DATABASE SCHEMA
-- Execute este script no SQL Editor do seu projeto Supabase (100% Gratuito)
-- ============================================================================

-- 1. Cria a tabela de dados do usuário (user_data)
CREATE TABLE IF NOT EXISTS public.user_data (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    games JSONB DEFAULT '[]'::jsonb,
    profile JSONB DEFAULT '{}'::jsonb,
    settings JSONB DEFAULT '{}'::jsonb,
    playing_categories JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Habilita Row Level Security (RLS) para isolamento total e segurança máxima
ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Segurança (Cada usuário só pode ver, salvar e alterar os seus próprios dados)
DROP POLICY IF EXISTS "Usuários podem ver apenas seus próprios dados" ON public.user_data;
CREATE POLICY "Usuários podem ver apenas seus próprios dados" 
    ON public.user_data 
    FOR SELECT 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem inserir apenas seus próprios dados" ON public.user_data;
CREATE POLICY "Usuários podem inserir apenas seus próprios dados" 
    ON public.user_data 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar apenas seus próprios dados" ON public.user_data;
CREATE POLICY "Usuários podem atualizar apenas seus próprios dados" 
    ON public.user_data 
    FOR UPDATE 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar apenas seus próprios dados" ON public.user_data;
CREATE POLICY "Usuários podem deletar apenas seus próprios dados" 
    ON public.user_data 
    FOR DELETE 
    USING (auth.uid() = user_id);

-- 4. Função e Gatilho para atualizar automaticamente o campo updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_data_updated_at ON public.user_data;
CREATE TRIGGER trigger_user_data_updated_at
    BEFORE UPDATE ON public.user_data
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- SUCESSO: A tabela está pronta com proteção RLS por usuário!
-- ============================================================================
