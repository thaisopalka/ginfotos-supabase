# Implantacao do GINFOTOS 6a CRE

Este guia registra os passos principais para publicar e manter o app GINFOTOS 6a CRE.

## Modulos do app

- Inicio: painel geral.
- Nova Visita: criacao de vistoria tecnica.
- Visitas Tecnicas: consulta de registros.
- Unidades Escolares: base de unidades da E/6 CRE.
- Relatorios Word: geracao de documento editavel.
- WhatsApp Diretores: contato com direcao escolar.
- Pastas: organizacao por unidade.
- Arquivo / Historico: historico geral.
- Admin: controle de usuarios.

## Supabase

No Supabase, abra o SQL Editor e execute o arquivo:

```text
supabase/schema_ginfotos.sql
```

Esse arquivo prepara as tabelas usadas pelo app:

```text
app_users
unidades
visitas
pastas
user_invites
```

Ele tambem cria campos, indices, triggers e politicas basicas para funcionamento.

## Vercel

No projeto do Vercel, confira:

```text
Framework: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Cadastre as variaveis de ambiente do Supabase no painel do Vercel. Os valores reais devem ficar somente no Vercel, nunca no GitHub.

Variaveis esperadas pelo app:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_EMAIL
ADMIN_PASSWORD
```

Depois de cadastrar ou alterar variaveis, faca novo redeploy.

## Redeploy

Apos cada commit no GitHub:

```text
Vercel -> Deployments -> Redeploy
```

## Usuarios

Usuarios criados na aba Admin entram com o e-mail cadastrado e a credencial provisoria gerada no proprio Admin.

A aba Admin permite:

- criar usuario;
- copiar convite;
- gerar nova credencial provisoria;
- bloquear;
- ativar;
- remover.

## Unidades escolares

A aba Unidades Escolares permite colar dados vindos do Excel nesta ordem:

```text
DESIGNACAO
UNIDADE ESCOLAR
ENDERECO
BAIRRO
TELEFONE
DIRETOR GERAL
CELULAR DIRETOR
DIRETOR ADJUNTO
CELULAR ADJUNTO
```

## Fallback local

O app foi ajustado para continuar abrindo mesmo se o Supabase estiver instavel ou incompleto.

Telas com fallback local:

```text
Visitas Tecnicas
Unidades Escolares
Pastas
Relatorios Word
Arquivo / Historico
```

## Comandos locais

```bash
npm install
npm run dev
npm run build
```

## Rodape padrao

```text
DESENVOLVIDO POR THAIS OPALKA
E/6a CRE/GIN
```
