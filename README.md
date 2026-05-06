# Controle NF Chevron — PC Offline com Banco Local

Aplicativo Windows para controle de NF, devoluções, garantias, recebimentos e descontos em boleto.

## Como gerar o aplicativo no GitHub

1. Suba todos estes arquivos em um repositório do GitHub.
2. Abra a aba **Actions**.
3. Execute o workflow **Gerar Aplicativo Windows PC**.
4. Ao finalizar, baixe o artifact **CONTROLE-NF-CHEVRON-WINDOWS-PC**.
5. Dentro dele haverá o instalador e a versão portable `.exe`.

## Login inicial local

Na primeira abertura, o sistema cria automaticamente um usuário local:

- E-mail: `admin@local`
- Senha: `123456`

Depois de instalado, os dados são salvos no próprio computador.

## Onde ficam os dados

O aplicativo cria automaticamente a pasta:

`Documentos/thIAguinho Soluções/Controle NF Chevron/`

Com esta estrutura:

- `banco/controle_nf_db.json` — banco local principal
- `backups/` — backups automáticos antes de importações
- `relatorios/` — local sugerido para exportações
- `logs/` — reservado para diagnósticos futuros

## Offline de verdade

O app não usa Firebase, CDN, Tailwind online, FontAwesome online ou servidor externo. Toda a interface, banco e lógica rodam dentro do PC.

## Exportação e importação

O sistema permite:

- Exportar backup completo `.json`
- Importar backup completo `.json`
- Exportar planilha `.csv` compatível com Excel/LibreOffice
- Importar planilha `.csv` exportada pelo próprio sistema
- Exportar PDF usando a impressão nativa do Windows/Chromium: botão **Exportar PDF / Imprimir** e depois escolher **Salvar como PDF**

Para restauração após formatação, use preferencialmente o backup `.json`. A planilha `.csv` também pode ser importada, mas o backup JSON preserva tudo com mais fidelidade.
